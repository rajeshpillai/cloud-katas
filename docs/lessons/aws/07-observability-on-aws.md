# Observability on AWS

## Overview

This lesson uses CloudWatch, Container Insights, X-Ray, OpenTelemetry, Managed Prometheus, and Managed Grafana concepts to build an AWS observability mental model.

## Estimated Time

- 75 minutes

## Prerequisites

- Completed [Amazon EKS](02-amazon-eks-elastic-kubernetes-service.md)
- A running workload or sample application

## Learning Objectives

- Find logs, metrics, and alarms in CloudWatch
- Explain traces with X-Ray and OpenTelemetry
- Describe Prometheus and Grafana roles

## Core Concepts

- CloudWatch centralizes many AWS metrics and logs
- Container Insights adds cluster-level visibility
- Traces help connect service-to-service latency
- Prometheus and Grafana support Kubernetes-native metrics workflows

## Lab

### 1. Inspect Cluster Logs

```bash
kubectl get pods --all-namespaces
aws logs describe-log-groups --log-group-name-prefix /aws/eks
```

### 2. Review CloudWatch Metrics

Open CloudWatch Metrics and find EKS, EC2, or load balancer metrics for the lab environment.

### 3. Create an Alarm

Create a test alarm on a low-risk metric, such as high CPU for a test node or target group unhealthy host count.

### 4. Review Tracing Options

Identify where your application would emit traces: AWS X-Ray SDK, ADOT Collector, or OpenTelemetry instrumentation.

## Validate

- CloudWatch has relevant metrics
- Logs are visible for the cluster or workload
- The alarm exists and has a clear threshold

## Troubleshooting

- No logs: confirm logging add-ons and IAM permissions.
- No metrics: confirm namespace, region, and service dimensions.
- Alarm noisy: increase evaluation periods or refine dimensions.

## Cleanup

Delete test alarms and dashboards that are no longer needed.

## Further Reading

- [Amazon CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html)
- [AWS Distro for OpenTelemetry](https://aws-otel.github.io/docs/introduction)
- [Amazon Managed Grafana](https://docs.aws.amazon.com/grafana/latest/userguide/what-is-Amazon-Managed-Service-Grafana.html)
