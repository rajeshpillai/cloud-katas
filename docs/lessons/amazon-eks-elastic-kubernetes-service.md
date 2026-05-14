# Amazon EKS

## Overview

This lesson creates an EKS cluster, deploys a sample workload, and introduces managed node groups, Fargate, autoscaling, and IAM Roles for Service Accounts.

## Estimated Time

- 120 minutes

## Prerequisites

- Completed [Docker and Kubernetes Basics](docker-and-kubernetes-basics.md)
- Completed [AWS Fundamentals](aws-fundamentals.md)
- `aws`, `kubectl`, and `eksctl`

## Learning Objectives

- Create an EKS cluster
- Deploy and expose a workload
- Understand node groups and workload identity

## Core Concepts

- EKS manages the Kubernetes control plane
- Managed node groups run worker nodes in your account
- Fargate can run pods without managing nodes
- IRSA grants AWS permissions to Kubernetes service accounts

## Lab

### 1. Prepare

```bash
export AWS_REGION="us-east-1"
aws sts get-caller-identity
eksctl version
```

### 2. Create a Small Cluster

```bash
eksctl create cluster \
  --name learning-eks \
  --region "$AWS_REGION" \
  --nodes 2 \
  --node-type t3.small \
  --managed
```

### 3. Deploy an Application

```bash
kubectl create deployment web --image=nginx:stable-alpine
kubectl expose deployment web --port=80 --type=LoadBalancer
kubectl get pods,svc
```

## Validate

```bash
kubectl get nodes
kubectl rollout status deployment/web
aws eks describe-cluster --name learning-eks --region "$AWS_REGION"
```

## Troubleshooting

- Cluster creation fails: check IAM permissions, VPC quotas, and EC2 limits.
- Nodes not joining: inspect managed node group events in the EKS console.
- Load balancer pending: confirm subnet tags and controller permissions.

## Cleanup

```bash
kubectl delete service web
kubectl delete deployment web
eksctl delete cluster --name learning-eks --region "$AWS_REGION"
```

## Further Reading

- [Amazon EKS user guide](https://docs.aws.amazon.com/eks/latest/userguide/what-is-eks.html)
- [IAM roles for service accounts](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)
