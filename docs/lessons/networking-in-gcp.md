# Networking in GCP

## Overview

This lesson introduces VPCs, subnets, firewall rules, Cloud DNS, load balancing, and private access patterns in GCP.

## Estimated Time

- 90 minutes

## Prerequisites

- Completed [GCP Fundamentals](gcp-fundamentals.md)
- Permission to create networking resources

## Learning Objectives

- Create a custom VPC and subnet
- Understand ingress and egress firewall rules
- Describe load balancer and DNS responsibilities

## Core Concepts

- VPCs are global, while subnets are regional
- Firewall rules are stateful and apply to VM network interfaces
- Load balancers expose services reliably
- DNS maps names to service endpoints

## Lab

### 1. Create a VPC

```bash
export REGION="us-central1"
gcloud compute networks create learning-vpc --subnet-mode=custom
gcloud compute networks subnets create learning-subnet \
  --network=learning-vpc \
  --range=10.10.0.0/24 \
  --region="$REGION"
```

### 2. Add a Firewall Rule

```bash
gcloud compute firewall-rules create learning-allow-http \
  --network=learning-vpc \
  --allow=tcp:80 \
  --source-ranges=0.0.0.0/0 \
  --target-tags=web
```

### 3. Review DNS and Certificates

In the console, inspect Cloud DNS zones and Certificate Manager. Note where DNS, TLS certificates, and load balancer frontend configuration connect.

## Validate

```bash
gcloud compute networks describe learning-vpc
gcloud compute networks subnets describe learning-subnet --region "$REGION"
gcloud compute firewall-rules describe learning-allow-http
```

## Troubleshooting

- CIDR overlap: choose a non-overlapping private range.
- Firewall does not apply: confirm target tags or service account selectors.
- DNS does not resolve: check record type, zone delegation, and TTL.

## Cleanup

```bash
gcloud compute firewall-rules delete learning-allow-http
gcloud compute networks subnets delete learning-subnet --region "$REGION"
gcloud compute networks delete learning-vpc
```

## Further Reading

- [GCP VPC documentation](https://cloud.google.com/vpc/docs)
- [Cloud Load Balancing](https://cloud.google.com/load-balancing/docs)
