# Observability on GCP

## Overview

This lesson shows how to reason about metrics, logs, traces, alerts, and dashboards using Google Cloud observability tools.

## Estimated Time

- 75 minutes

## Prerequisites

- Completed [Google Kubernetes Engine (GKE)](google-kubernetes-engine-gke.md)
- A running workload or sample application

## Learning Objectives

- Locate logs and metrics for a workload
- Create a simple dashboard
- Create an alerting policy
- Describe where tracing and profiling fit

## Core Concepts

- Metrics answer what changed
- Logs explain what happened
- Traces show request flow across services
- Alerts should describe user-impacting symptoms

## Lab

### 1. Generate Workload Signals

Use any running deployment and generate requests.

```bash
kubectl get pods
kubectl logs deployment/web --tail=20
```

### 2. Explore Cloud Logging

In Logs Explorer, filter for your cluster, namespace, or deployment. Save a useful query for later troubleshooting.

### 3. Create a Dashboard

In Cloud Monitoring, create a dashboard with CPU, memory, request count, or log-based metrics relevant to the workload.

### 4. Add an Alert

Create a low-risk alert such as high container restart count or failed health checks. Send notifications to a test channel.

## Validate

- Logs Explorer returns workload logs
- The dashboard shows recent data
- The alert policy is enabled and documented

## Troubleshooting

- No metrics: confirm the workload is running and the cluster has observability enabled.
- No logs: check namespace filters and logging agent health.
- Alert too noisy: adjust threshold, duration, or grouping.

## Cleanup

Delete test alert policies and dashboards that are no longer useful.

## Further Reading

- [Cloud Monitoring](https://cloud.google.com/monitoring/docs)
- [Cloud Logging](https://cloud.google.com/logging/docs)
- [Cloud Trace](https://cloud.google.com/trace/docs)
