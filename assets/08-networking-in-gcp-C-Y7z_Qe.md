# Networking in GCP

## Overview

This lesson builds a small but realistic VPC: a custom VPC, two regional subnets (one public-facing, one private), Cloud NAT for egress from private resources, Private Google Access for Google API traffic without external IPs, ingress firewall rules with targeted tags, an internal HTTP load balancer concept, and an introduction to Cloud Armor.

The point is to understand what each piece is responsible for and how packets actually flow.

## Estimated Time

- 90-120 minutes

## Prerequisites

- Completed [GCP Fundamentals](01-gcp-fundamentals.md)
- Permission to create VPCs, subnets, firewall rules, and Cloud Router in the project
- `gcloud` authenticated and the `cloud-katas` configuration active

## Cost Notice

VPCs, subnets, and firewall rules are free. Cloud NAT charges per-VM-hour and per-GB. A small lab is cents-per-hour; remember to destroy it. Load balancer forwarding rules and Cloud Armor have small per-hour and per-request fees.

## Learning Objectives

- Create a custom-mode VPC with regional subnets
- Reserve secondary IP ranges for GKE pod and service CIDRs
- Enable Cloud NAT so private VMs can reach the internet for updates
- Enable Private Google Access for `*.googleapis.com` traffic
- Write ingress firewall rules that target by tag and service account
- Understand the differences between external, internal, and global load balancers
- Recognize where Cloud Armor sits in the request path

## Core Concepts

- VPCs are global, subnets are regional: A single VPC can span every region; each subnet is constrained to one region. Inter-region traffic stays on Google's backbone and never traverses the public internet.
- Auto vs custom subnet mode: Auto mode creates a `10.128.0.0/9` set of subnets in every region for you. Custom mode means you pick CIDRs explicitly; this is preferred for any non-trivial environment.
- Cloud Router and Cloud NAT: Cloud NAT translates private VM source addresses to a small pool of public IPs for outbound traffic. Cloud Router announces routes the NAT relies on. Inbound traffic is not affected.
- Private Google Access: Subnet-level setting that lets VMs without external IPs reach `googleapis.com` via Google's network, not the internet. Required for private GKE node pools.
- Firewall rules are stateful: A reply to an allowed connection is automatically allowed back. Rules are filtered by `priority` low-first, by network, by target (tags or service accounts), by source ranges or source tags.
- Load balancer flavors: External global HTTPS LB (Anycast IP, Cloud CDN integration), regional HTTPS, internal HTTPS (for east-west traffic), and TCP/SSL variants. Internal LBs use a private IP only.
- Peering and Shared VPC: Peering joins two VPCs into a single route domain (no transitive routes). Shared VPC centralizes one VPC owned by a host project and shares it with service projects — the standard enterprise pattern.
- Cloud Armor: Sits in front of an external HTTPS LB and applies WAF and rate-limiting rules at the edge.

## Lab

### 1. Prepare

```bash
gcloud config configurations activate cloud-katas
export PROJECT_ID=$(gcloud config get-value project)
export REGION="us-central1"
export VPC="learning-vpc"
gcloud services enable compute.googleapis.com
```

### 2. Create the VPC and Subnets

```bash
gcloud compute networks create "$VPC" --subnet-mode=custom

gcloud compute networks subnets create learning-public \
  --network="$VPC" \
  --region="$REGION" \
  --range="10.10.0.0/24"

gcloud compute networks subnets create learning-private \
  --network="$VPC" \
  --region="$REGION" \
  --range="10.10.1.0/24" \
  --enable-private-ip-google-access \
  --secondary-range="pods=10.20.0.0/16,services=10.30.0.0/20"
```

The secondary ranges on `learning-private` are sized for a future GKE cluster's pod and service IPs.

### 3. Add Firewall Rules

Allow internal traffic inside the VPC.

```bash
gcloud compute firewall-rules create learning-allow-internal \
  --network="$VPC" \
  --action=ALLOW \
  --direction=INGRESS \
  --rules=all \
  --source-ranges="10.10.0.0/16,10.20.0.0/16,10.30.0.0/20"
```

Allow SSH only from Identity-Aware Proxy.

```bash
gcloud compute firewall-rules create learning-allow-iap-ssh \
  --network="$VPC" \
  --action=ALLOW \
  --direction=INGRESS \
  --rules=tcp:22 \
  --source-ranges="35.235.240.0/20"
```

Allow HTTP on instances tagged `web`.

```bash
gcloud compute firewall-rules create learning-allow-http \
  --network="$VPC" \
  --action=ALLOW \
  --direction=INGRESS \
  --rules=tcp:80,tcp:8080 \
  --source-ranges="0.0.0.0/0" \
  --target-tags="web"
```

### 4. Set Up Cloud NAT for Private Egress

```bash
gcloud compute routers create learning-router \
  --network="$VPC" \
  --region="$REGION"

gcloud compute routers nats create learning-nat \
  --router=learning-router \
  --region="$REGION" \
  --nat-all-subnet-ip-ranges \
  --auto-allocate-nat-external-ips
```

### 5. Place a Private VM and Prove Connectivity

```bash
gcloud compute instances create private-vm \
  --subnet=learning-private \
  --region="$REGION" \
  --zone="${REGION}-a" \
  --no-address \
  --machine-type=e2-micro \
  --image-family=debian-12 \
  --image-project=debian-cloud

gcloud compute ssh private-vm --zone="${REGION}-a" --tunnel-through-iap \
  --command='curl -sS -o /dev/null -w "%{http_code}\n" https://www.google.com && curl -sS https://storage.googleapis.com'
```

The first curl exits via Cloud NAT to the public internet. The second curl reaches `googleapis.com` via Private Google Access without consuming NAT capacity.

### 6. Add a Web VM with a Health-Checked Service

```bash
gcloud compute instances create web-vm \
  --subnet=learning-public \
  --region="$REGION" \
  --zone="${REGION}-a" \
  --machine-type=e2-small \
  --tags=web \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --metadata=startup-script='#!/bin/bash
    apt-get update && apt-get install -y python3
    nohup python3 -m http.server 8080 > /tmp/web.log 2>&1 &'
```

After a minute, hit the VM's external IP.

```bash
WEB_IP=$(gcloud compute instances describe web-vm --zone="${REGION}-a" --format='value(networkInterfaces[0].accessConfigs[0].natIP)')
curl -s "http://$WEB_IP:8080" | head -5
```

### 7. Read Load Balancer Options (Concept-Only)

Walk through the load balancer types in the console and note when to pick each. For the lab, do not provision a forwarding rule — the per-hour fee is small but real. Look at:

- External global HTTPS LB: best for public web traffic.
- External regional HTTPS LB: when you must keep traffic in-region.
- Internal HTTPS LB: east-west service-to-service in private subnets.
- TCP/SSL LB: when HTTP termination is wrong (TLS passthrough, non-HTTP protocols).

### 8. Cloud Armor (Concept)

If you want to provision the WAF on top of an external HTTPS LB, the basic shape is:

```bash
# Create a security policy
gcloud compute security-policies create learning-armor

# Add a rate-limit rule
gcloud compute security-policies rules create 1000 \
  --security-policy=learning-armor \
  --action=throttle \
  --src-ip-ranges="*" \
  --rate-limit-threshold-count=100 \
  --rate-limit-threshold-interval-sec=60 \
  --conform-action=allow \
  --exceed-action=deny-429 \
  --enforce-on-key=IP
```

Attaching the policy to a backend service requires the LB to exist. Skip the attach step in this lab to avoid the LB cost.

### 9. Shared VPC vs Peering (Concept)

When two VPCs need to share network reach:

- Peering: Simple, no transitive routes. A and B peered does not mean A reaches C even if B peers with C.
- Shared VPC: Centralized. One host project owns the VPC; many service projects attach. This is the recommended enterprise pattern when many projects need consistent network policy.

Run `gcloud compute networks peerings list --network="$VPC"` if peerings exist on your project.

## Validate

```bash
gcloud compute networks describe "$VPC" --format="value(subnetworks.list())"
gcloud compute routers nats describe learning-nat --router=learning-router --region="$REGION"
gcloud compute firewall-rules list --filter="network:$VPC"
gcloud compute instances list --filter="networkInterfaces.subnetwork:learning-*"
```

Success means:

- The VPC has both public and private subnets, and the private subnet has Private Google Access enabled.
- Cloud NAT is allocating external IPs and serves at least one private VM.
- Firewall rules with targeted tags exist and the web VM responds on its tag-protected port.
- The private VM can reach both `google.com` (via NAT) and `googleapis.com` (via PGA).

## Troubleshooting

- VM cannot reach the internet: Check that Cloud NAT covers the subnet and that the VM has no external IP (otherwise it bypasses NAT and may be blocked by other rules).
- Firewall rule not effective: Confirm the target (`--target-tags` or `--target-service-accounts`) matches the VM. `gcloud compute instances describe VM --format="value(tags.items)"`.
- IAP SSH denied: The user needs `roles/iap.tunnelResourceAccessor`. Without it, SSH over IAP fails despite the firewall rule.
- Secondary range conflict: The `pods`/`services` CIDRs must not overlap with the primary subnet range or with other subnets in the same VPC.
- `googleapis.com` requires Private Google Access: If `curl https://storage.googleapis.com` fails on the private VM, re-check the subnet's `--enable-private-ip-google-access`.

## Cleanup

```bash
gcloud compute instances delete web-vm private-vm --zone="${REGION}-a" --quiet
gcloud compute security-policies delete learning-armor --quiet 2>/dev/null || true
gcloud compute routers nats delete learning-nat --router=learning-router --region="$REGION" --quiet
gcloud compute routers delete learning-router --region="$REGION" --quiet
gcloud compute firewall-rules delete \
  learning-allow-internal learning-allow-iap-ssh learning-allow-http --quiet
gcloud compute networks subnets delete learning-public learning-private --region="$REGION" --quiet
gcloud compute networks delete "$VPC" --quiet
```

Confirm cleanup:

```bash
gcloud compute networks list --filter="name=$VPC" --format=json | grep -q "\\[\\]" && echo "cleanup complete"
```

## Checkpoint

- Explain the practical difference between a firewall rule scoped by tag and one scoped by source CIDR.
- Describe what Private Google Access changes for a VM that has no external IP.
- Identify when to pick an internal HTTPS LB over an external one.
- Explain the security gap that Cloud Armor closes that a firewall rule cannot.

## Further Reading

- [GCP VPC documentation](https://cloud.google.com/vpc/docs)
- [Cloud NAT](https://cloud.google.com/nat/docs/overview)
- [Private Google Access](https://cloud.google.com/vpc/docs/private-google-access)
- [Cloud Load Balancing](https://cloud.google.com/load-balancing/docs)
- [Cloud Armor](https://cloud.google.com/armor/docs)
- [Shared VPC](https://cloud.google.com/vpc/docs/shared-vpc)
