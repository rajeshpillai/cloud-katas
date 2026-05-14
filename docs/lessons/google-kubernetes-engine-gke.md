# Google Kubernetes Engine (GKE)

## Overview

This lesson creates a small GKE cluster, deploys a sample workload, and reviews node pools, autoscaling, and Workload Identity concepts.

## Estimated Time

- 90 minutes

## Prerequisites

- Completed [Docker and Kubernetes Basics](docker-and-kubernetes-basics.md)
- A GCP project with billing enabled
- `gcloud` and `kubectl`

## Learning Objectives

- Create a GKE cluster
- Deploy and expose a workload
- Understand Standard, Autopilot, node pools, and autoscaling

## Core Concepts

- GKE manages the Kubernetes control plane
- Autopilot reduces node management; Standard exposes more infrastructure control
- Workload Identity lets Kubernetes workloads access Google Cloud APIs without long-lived keys

## Lab

### 1. Prepare

```bash
export PROJECT_ID="replace-with-your-project-id"
export REGION="us-central1"
gcloud config set project "$PROJECT_ID"
gcloud services enable container.googleapis.com
```

### 2. Create a Low-Cost Cluster

For learning, prefer Autopilot unless you specifically need node-level control.

```bash
gcloud container clusters create-auto learning-gke --region "$REGION"
gcloud container clusters get-credentials learning-gke --region "$REGION"
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
kubectl get service web
```

Success means nodes are ready, the deployment rolled out, and the service exists.

## Troubleshooting

- Cluster creation fails: confirm billing, API enablement, quotas, and region availability.
- Load balancer stays pending: wait a few minutes and check service events.
- `kubectl` uses the wrong cluster: rerun `gcloud container clusters get-credentials`.

## Cleanup

```bash
kubectl delete service web
kubectl delete deployment web
gcloud container clusters delete learning-gke --region "$REGION"
```

## Further Reading

- [GKE documentation](https://cloud.google.com/kubernetes-engine/docs)
- [GKE Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
