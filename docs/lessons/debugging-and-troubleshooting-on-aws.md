# Debugging and Troubleshooting on AWS

## Overview

This lesson practices troubleshooting EKS workloads using Kubernetes commands, CloudWatch Logs, Container Insights, and AWS X-Ray.

## Estimated Time

- 60 minutes

## Prerequisites

- Completed [Amazon EKS](amazon-eks-elastic-kubernetes-service.md)
- Completed [Observability on AWS](observability-on-aws.md)

## Learning Objectives

- Diagnose failing EKS pods
- Correlate Kubernetes state with CloudWatch logs
- Identify where tracing helps application debugging

## Core Concepts

- Kubernetes events reveal scheduling and image pull issues
- CloudWatch shows workload and platform logs
- Container Insights helps spot resource pressure
- X-Ray helps inspect distributed request paths

## Lab

### 1. Create a Broken Deployment

```bash
kubectl create deployment broken --image=nginx:missing-tag
kubectl get pods
```

### 2. Inspect Kubernetes State

```bash
kubectl describe pod -l app=broken
kubectl get events --sort-by=.lastTimestamp
```

### 3. Fix and Watch Rollout

```bash
kubectl set image deployment/broken nginx=nginx:stable-alpine
kubectl rollout status deployment/broken
```

### 4. Correlate With AWS Signals

Open CloudWatch Logs and Container Insights for the cluster. Look for image pull errors, restart counts, or workload resource pressure.

## Validate

```bash
kubectl get deployment broken
kubectl logs deployment/broken --tail=20
```

Success means the deployment is healthy and logs are visible.

## Troubleshooting

- CloudWatch logs missing: confirm logging add-ons and IAM permissions.
- Pod pending: inspect node capacity, taints, and selectors.
- Requests failing with healthy pods: inspect service, ingress, and load balancer target health.

## Cleanup

```bash
kubectl delete deployment broken
```

## Further Reading

- [EKS troubleshooting](https://docs.aws.amazon.com/eks/latest/userguide/troubleshooting.html)
- [CloudWatch Container Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ContainerInsights.html)
