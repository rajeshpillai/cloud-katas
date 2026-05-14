# Networking in AWS

## Overview

This lesson builds a real two-AZ VPC: public subnets, private subnets, an Internet Gateway, a NAT Gateway, route tables, security groups, NACLs, an S3 VPC endpoint, and the load balancer flavors you will use for real applications. The goal is to understand exactly how packets reach a service running in a private subnet and how to keep traffic that should stay private from leaving the VPC.

The cross-cloud transfer is mostly direct. AWS has a few moving parts GCP does not (NACLs alongside security groups, an explicit Internet Gateway resource, route tables you wire by hand), so this lesson walks through the explicit construction.

## Estimated Time

- 100-120 minutes

## Prerequisites

- Completed [AWS Fundamentals](01-aws-fundamentals.md)
- Permission to create VPC, EC2, and Elastic Load Balancing resources
- The `cloud-katas` AWS profile authenticated

## Cost Notice

A VPC, subnets, route tables, IGW, and security groups are free. A NAT Gateway costs about $1/day plus data processing. An ALB has a small per-hour fee. Tear down at the end.

## Learning Objectives

- Build a two-AZ VPC with public and private subnets
- Wire an Internet Gateway and a NAT Gateway with explicit route tables
- Contrast security groups and NACLs and pick the right tool
- Add an S3 VPC endpoint and prove traffic stays on the AWS network
- Identify the differences between ALB, NLB, and Gateway Load Balancer
- Use VPC Flow Logs to confirm what is actually flowing

## Core Concepts

- VPC is regional: A VPC lives in one region. Each subnet binds to one AZ. Cross-AZ traffic is free within a region; cross-region traffic is paid.
- IGW vs NAT Gateway: An Internet Gateway routes traffic *to and from* the internet for resources with public IPs. A NAT Gateway provides one-way outbound internet access for resources without public IPs and lives in a public subnet.
- Route tables: Each subnet associates with one route table that decides where packets go. Public subnets have a `0.0.0.0/0 → igw` entry. Private subnets have `0.0.0.0/0 → nat-gw`.
- Security groups: Stateful firewall rules attached to ENIs. Default-deny inbound, default-allow outbound. Replies to allowed inbound are automatically allowed back.
- Network ACLs (NACLs): Stateless rules attached to subnets. Used for coarse subnet-level allow/deny. Less common than security groups; most teams leave them at defaults.
- VPC endpoints (gateway + interface): An S3 gateway endpoint adds a route table entry so S3 traffic stays inside AWS. An interface endpoint provisions ENIs in your subnets that proxy a specific service's API.
- ALB vs NLB vs Gateway LB: ALB is HTTP/HTTPS with content-based routing and WAF integration. NLB is TCP/UDP with static IPs and millions of pps. Gateway LB is for inserting third-party network appliances.
- VPC Flow Logs: Records of accepted and rejected traffic. Land in CloudWatch Logs or S3. Essential for debugging "why can't service A reach service B?"

## Lab

### 1. Prepare

```bash
export AWS_PROFILE=cloud-katas
export AWS_REGION="us-east-1"
export VPC_CIDR="10.30.0.0/16"
```

### 2. Create the VPC and Subnets

```bash
VPC_ID=$(aws ec2 create-vpc \
  --cidr-block "$VPC_CIDR" \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=learning-vpc}]' \
  --query Vpc.VpcId --output text)

aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-hostnames

# Two AZs
AZS=( $(aws ec2 describe-availability-zones --query 'AvailabilityZones[0:2].ZoneName' --output text) )
echo "AZs: ${AZS[*]}"

# Public subnets
PUB_A=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --availability-zone "${AZS[0]}" --cidr-block 10.30.0.0/24 \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=learning-public-a}]' \
  --query Subnet.SubnetId --output text)
PUB_B=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --availability-zone "${AZS[1]}" --cidr-block 10.30.1.0/24 \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=learning-public-b}]' \
  --query Subnet.SubnetId --output text)

aws ec2 modify-subnet-attribute --subnet-id "$PUB_A" --map-public-ip-on-launch
aws ec2 modify-subnet-attribute --subnet-id "$PUB_B" --map-public-ip-on-launch

# Private subnets
PRV_A=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --availability-zone "${AZS[0]}" --cidr-block 10.30.10.0/24 \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=learning-private-a}]' \
  --query Subnet.SubnetId --output text)
PRV_B=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --availability-zone "${AZS[1]}" --cidr-block 10.30.11.0/24 \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=learning-private-b}]' \
  --query Subnet.SubnetId --output text)
```

### 3. Internet Gateway and Public Routing

```bash
IGW_ID=$(aws ec2 create-internet-gateway --query InternetGateway.InternetGatewayId --output text)
aws ec2 attach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID"

PUB_RT=$(aws ec2 create-route-table --vpc-id "$VPC_ID" \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=public-rt}]' \
  --query RouteTable.RouteTableId --output text)

aws ec2 create-route --route-table-id "$PUB_RT" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW_ID"
aws ec2 associate-route-table --route-table-id "$PUB_RT" --subnet-id "$PUB_A"
aws ec2 associate-route-table --route-table-id "$PUB_RT" --subnet-id "$PUB_B"
```

### 4. NAT Gateway and Private Routing

```bash
EIP_ALLOC=$(aws ec2 allocate-address --query AllocationId --output text)
NAT_ID=$(aws ec2 create-nat-gateway \
  --subnet-id "$PUB_A" \
  --allocation-id "$EIP_ALLOC" \
  --query NatGateway.NatGatewayId --output text)

# Wait
aws ec2 wait nat-gateway-available --nat-gateway-ids "$NAT_ID"

PRV_RT=$(aws ec2 create-route-table --vpc-id "$VPC_ID" \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=private-rt}]' \
  --query RouteTable.RouteTableId --output text)

aws ec2 create-route --route-table-id "$PRV_RT" --destination-cidr-block 0.0.0.0/0 --nat-gateway-id "$NAT_ID"
aws ec2 associate-route-table --route-table-id "$PRV_RT" --subnet-id "$PRV_A"
aws ec2 associate-route-table --route-table-id "$PRV_RT" --subnet-id "$PRV_B"
```

### 5. Security Groups

```bash
WEB_SG=$(aws ec2 create-security-group --group-name learning-web \
  --description "HTTP from internet" --vpc-id "$VPC_ID" \
  --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id "$WEB_SG" --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id "$WEB_SG" --protocol tcp --port 8080 --cidr 0.0.0.0/0

APP_SG=$(aws ec2 create-security-group --group-name learning-app \
  --description "Web only" --vpc-id "$VPC_ID" \
  --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id "$APP_SG" --protocol tcp --port 8080 --source-group "$WEB_SG"

SSH_SG=$(aws ec2 create-security-group --group-name learning-ssh \
  --description "SSM only" --vpc-id "$VPC_ID" \
  --query GroupId --output text)
# SSM connect does not need an inbound port; leave inbound empty
```

The `APP_SG`'s ingress references `WEB_SG` (a *group*, not a CIDR). Reference-by-group is the AWS idiom for east-west traffic and is easier to maintain than a list of CIDRs.

### 6. NACL Sidebar

NACLs are subnet-level and stateless. The default NACL allows all traffic; most teams leave it that way and rely on security groups. To demonstrate a deny rule that takes priority:

```bash
DEFAULT_NACL=$(aws ec2 describe-network-acls --filters "Name=vpc-id,Values=$VPC_ID" "Name=default,Values=true" --query 'NetworkAcls[0].NetworkAclId' --output text)
echo "Default NACL: $DEFAULT_NACL"

# Example block-everything-from-RFC-3171 (unused) rule. Run only if you want to play with it.
# aws ec2 create-network-acl-entry --network-acl-id "$DEFAULT_NACL" --ingress \
#   --rule-number 50 --protocol -1 --rule-action deny --cidr-block 192.0.2.0/24
```

Stateless: an inbound allow does not implicitly allow the reply. Forgetting to add the matching egress rule is the #1 NACL pitfall.

### 7. S3 Gateway VPC Endpoint

```bash
aws ec2 create-vpc-endpoint \
  --vpc-id "$VPC_ID" \
  --service-name "com.amazonaws.$AWS_REGION.s3" \
  --route-table-ids "$PRV_RT" \
  --vpc-endpoint-type Gateway
```

Now S3 traffic from private subnets does not transit the NAT Gateway — it goes through the endpoint, which is free.

### 8. Launch a Public Web VM

```bash
AMI=$(aws ec2 describe-images --owners amazon --filters \
  "Name=name,Values=al2023-ami-2023*-x86_64" \
  "Name=state,Values=available" \
  --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)

WEB_VM=$(aws ec2 run-instances \
  --image-id "$AMI" \
  --instance-type t3.micro \
  --subnet-id "$PUB_A" \
  --security-group-ids "$WEB_SG" \
  --iam-instance-profile Name=AmazonSSMRoleForInstancesQuickSetup \
  --user-data '#!/bin/bash
  dnf install -y python3
  nohup python3 -m http.server 8080 > /tmp/web.log 2>&1 &' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=web-vm}]' \
  --query 'Instances[0].InstanceId' --output text)

aws ec2 wait instance-running --instance-ids "$WEB_VM"

WEB_IP=$(aws ec2 describe-instances --instance-ids "$WEB_VM" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

sleep 30
curl -s "http://$WEB_IP:8080/" | head -3
```

If the instance profile name above does not exist in your account, create one or skip the profile flag (you will then not be able to SSM into the instance, but the web test still works).

### 9. Launch a Private VM and Confirm Egress

```bash
PRV_VM=$(aws ec2 run-instances \
  --image-id "$AMI" \
  --instance-type t3.micro \
  --subnet-id "$PRV_A" \
  --security-group-ids "$APP_SG" \
  --iam-instance-profile Name=AmazonSSMRoleForInstancesQuickSetup \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=private-vm}]' \
  --query 'Instances[0].InstanceId' --output text)

aws ec2 wait instance-running --instance-ids "$PRV_VM"

# Use SSM Session Manager (no SSH port required) to confirm internet egress via NAT
aws ssm start-session --target "$PRV_VM" 2>&1 | head -5 || echo "Install Session Manager plugin if needed"
```

In the SSM session:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://example.com
aws s3 ls 2>&1 | head -5     # goes through the S3 endpoint, not NAT
```

### 10. ALB Concept-Only

For an HTTPS application API, an Application Load Balancer fronts the web VM:

```bash
# Skip in lab to avoid the per-hour cost. The shape is:
# aws elbv2 create-load-balancer --name learning-alb --subnets "$PUB_A" "$PUB_B" --security-groups "$WEB_SG"
# aws elbv2 create-target-group --name learning-tg --protocol HTTP --port 8080 --vpc-id "$VPC_ID" --target-type instance
# aws elbv2 register-targets --target-group-arn ... --targets Id="$WEB_VM"
# aws elbv2 create-listener --load-balancer-arn ... --protocol HTTP --port 80 --default-actions Type=forward,TargetGroupArn=...
```

ALB chooses by hostname/path; NLB is for raw TCP/UDP; Gateway LB inserts third-party appliances.

### 11. Enable VPC Flow Logs

```bash
aws logs create-log-group --log-group-name /vpc/learning-vpc 2>/dev/null || true

LOGS_ROLE_ARN="arn:aws:iam::$ACCOUNT_ID:role/vpc-flow-logs"  # create once if not present
# aws iam create-role / put-role-policy with vpc-flow-logs.amazonaws.com trust

aws ec2 create-flow-logs \
  --resource-type VPC \
  --resource-ids "$VPC_ID" \
  --traffic-type ALL \
  --log-destination-type cloud-watch-logs \
  --log-group-name /vpc/learning-vpc \
  --deliver-logs-permission-arn "$LOGS_ROLE_ARN" 2>&1 | head -3
```

Run a curl from the public VM, then query the log group in CloudWatch Logs Insights:

```text
fields @timestamp, srcAddr, dstAddr, srcPort, dstPort, action, protocol
| sort @timestamp desc
| limit 20
```

## Validate

```bash
aws ec2 describe-vpcs --vpc-ids "$VPC_ID" --query 'Vpcs[0].{State:State,Cidr:CidrBlock}'
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$VPC_ID" --query 'RouteTables[].Associations[].SubnetId'
aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=$VPC_ID" --query 'VpcEndpoints[].{Svc:ServiceName,State:State}'
aws ec2 describe-instances --filters "Name=vpc-id,Values=$VPC_ID" --query 'Reservations[].Instances[].{Id:InstanceId,Subnet:SubnetId,PubIP:PublicIpAddress}'
```

Success means:

- VPC, two public subnets, two private subnets, IGW, NAT Gateway, two route tables, three security groups, one S3 endpoint.
- Public subnets route default to IGW; private subnets route default to NAT.
- The private VM reaches the internet via NAT and reaches S3 via the gateway endpoint (no NAT traversal).
- Flow logs land in CloudWatch.

## Troubleshooting

- NAT Gateway stuck `pending`: It takes ~1-2 minutes. `aws ec2 wait nat-gateway-available` blocks correctly.
- Instance has no public IP: `--map-public-ip-on-launch` was missing on the public subnet, or the subnet does not associate with the public route table.
- SSM Session Manager fails: The instance needs `AmazonSSMRoleForInstancesQuickSetup` (or equivalent) and the SSM agent. AL2023 ships with the agent.
- S3 endpoint not in effect: Confirm the route table includes a route to the gateway endpoint (look for `pl-XXXX` prefix list in route output).
- Security group reference fails: Group references must be in the *same VPC*. Across VPCs you need CIDRs or peering.

## Cleanup

```bash
aws ec2 terminate-instances --instance-ids "$WEB_VM" "$PRV_VM"
aws ec2 wait instance-terminated --instance-ids "$WEB_VM" "$PRV_VM"

aws ec2 delete-flow-logs --flow-log-ids "$(aws ec2 describe-flow-logs --filter Name=resource-id,Values="$VPC_ID" --query 'FlowLogs[0].FlowLogId' --output text)"

aws ec2 delete-vpc-endpoints --vpc-endpoint-ids "$(aws ec2 describe-vpc-endpoints --filters Name=vpc-id,Values="$VPC_ID" --query 'VpcEndpoints[0].VpcEndpointId' --output text)"

aws ec2 delete-nat-gateway --nat-gateway-id "$NAT_ID"
aws ec2 wait nat-gateway-deleted --nat-gateway-ids "$NAT_ID"
aws ec2 release-address --allocation-id "$EIP_ALLOC"

aws ec2 delete-security-group --group-id "$WEB_SG"
aws ec2 delete-security-group --group-id "$APP_SG"
aws ec2 delete-security-group --group-id "$SSH_SG"

aws ec2 detach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID"
aws ec2 delete-internet-gateway --internet-gateway-id "$IGW_ID"

aws ec2 disassociate-route-table --association-id $(aws ec2 describe-route-tables --route-table-ids "$PUB_RT" --query 'RouteTables[0].Associations[*].RouteTableAssociationId' --output text)
aws ec2 delete-route-table --route-table-id "$PUB_RT"
aws ec2 delete-route-table --route-table-id "$PRV_RT"

aws ec2 delete-subnet --subnet-id "$PUB_A"
aws ec2 delete-subnet --subnet-id "$PUB_B"
aws ec2 delete-subnet --subnet-id "$PRV_A"
aws ec2 delete-subnet --subnet-id "$PRV_B"

aws ec2 delete-vpc --vpc-id "$VPC_ID"
```

## Cross-Cloud Callout

- AWS VPC ↔ GCP VPC: AWS VPCs are regional; GCP VPCs are global with regional subnets. The difference matters when designing multi-region applications.
- AWS Internet Gateway + NAT Gateway ↔ GCP Cloud Router + Cloud NAT: same outcome, different decomposition.
- AWS Security Groups + NACLs ↔ GCP firewall rules: GCP has only one firewall layer; AWS has two and you should not need both for most workloads.
- AWS VPC endpoints ↔ GCP Private Google Access + Private Service Connect: both keep service traffic on the cloud network.

## Checkpoint

- Explain when a NACL would be the right tool over a security group.
- Describe what an S3 gateway endpoint changes about traffic from a private subnet.
- Identify the single setting that turns a "private subnet" into a "public-looking subnet."
- Explain the practical difference between an ALB and an NLB.

## Further Reading

- [Amazon VPC](https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html)
- [NAT Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)
- [VPC endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/concepts.html)
- [Security groups vs NACLs](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Security.html)
- [Elastic Load Balancing](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/what-is-load-balancing.html)
- [VPC Flow Logs](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html)
