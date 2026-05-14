# Networking in AWS

## Overview

This lesson introduces VPCs, subnets, route tables, security groups, load balancers, Route 53, CloudFront, VPN, Direct Connect, and VPC endpoints.

## Estimated Time

- 90 minutes

## Prerequisites

- Completed [AWS Fundamentals](aws-fundamentals.md)
- Permission to create VPC resources

## Learning Objectives

- Create a simple VPC and subnet
- Explain route tables and security groups
- Identify where DNS and load balancing fit

## Core Concepts

- VPCs are regional network boundaries
- Subnets live in Availability Zones
- Route tables control where packets go
- Security groups are stateful resource firewalls

## Lab

### 1. Create a VPC

```bash
export AWS_REGION="us-east-1"
VPC_ID=$(aws ec2 create-vpc --cidr-block 10.20.0.0/16 --query "Vpc.VpcId" --output text)
aws ec2 create-tags --resources "$VPC_ID" --tags Key=Name,Value=learning-vpc
```

### 2. Create a Subnet

```bash
AZ=$(aws ec2 describe-availability-zones --query "AvailabilityZones[0].ZoneName" --output text)
SUBNET_ID=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --cidr-block 10.20.1.0/24 --availability-zone "$AZ" --query "Subnet.SubnetId" --output text)
aws ec2 create-tags --resources "$SUBNET_ID" --tags Key=Name,Value=learning-subnet
```

### 3. Inspect Related Networking

```bash
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$VPC_ID"
aws ec2 describe-security-groups --filters "Name=vpc-id,Values=$VPC_ID"
```

## Validate

```bash
aws ec2 describe-vpcs --vpc-ids "$VPC_ID"
aws ec2 describe-subnets --subnet-ids "$SUBNET_ID"
```

## Troubleshooting

- CIDR conflict: choose a different private range.
- Resource limit reached: clean up old lab VPCs.
- Cannot delete VPC: remove dependent resources first.

## Cleanup

```bash
aws ec2 delete-subnet --subnet-id "$SUBNET_ID"
aws ec2 delete-vpc --vpc-id "$VPC_ID"
```

## Further Reading

- [Amazon VPC](https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html)
- [Elastic Load Balancing](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/what-is-load-balancing.html)
