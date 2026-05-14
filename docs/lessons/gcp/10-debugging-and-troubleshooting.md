# Debugging and Troubleshooting

## Overview

This lesson practices a repeatable Kubernetes troubleshooting workflow using `kubectl`, logs, events, and ephemeral debug containers.

## Estimated Time

- 60 minutes

## Prerequisites

- Completed [Google Kubernetes Engine (GKE)](03-google-kubernetes-engine-gke.md)
- Completed [Observability on GCP](09-observability-on-gcp.md)
- Access to a Kubernetes cluster

## Learning Objectives

- Diagnose pod scheduling and startup issues
- Use logs, events, and descriptions effectively
- Attach an ephemeral debug container when needed

## Core Concepts

- Events show cluster decisions
- Logs show application output
- `describe` shows resource state and recent errors
- Ephemeral containers help debug minimal images

## Lab

### 1. Create a Broken Pod

```bash
kubectl create deployment broken --image=nginx:missing-tag
kubectl get pods
```

### 2. Inspect the Failure

```bash
kubectl describe deployment broken
kubectl describe pod -l app=broken
kubectl get events --sort-by=.lastTimestamp
```

### 3. Fix the Image

```bash
kubectl set image deployment/broken nginx=nginx:stable-alpine
kubectl rollout status deployment/broken
```

### 4. Use Debug Tools

For a running pod, start an ephemeral debug container when the cluster supports it.

```bash
kubectl debug deployment/broken -it --image=busybox:stable --target=nginx
```

## Validate

```bash
kubectl get deployment broken
kubectl logs deployment/broken --tail=20
```

## Troubleshooting

- `kubectl debug` fails: confirm Kubernetes version and cluster policy.
- No logs: the container may not have started; inspect events first.
- Rollout stuck: use `kubectl rollout history` and `kubectl describe`.

## Cleanup

```bash
kubectl delete deployment broken
```

## Further Reading

- [Kubernetes debugging](https://kubernetes.io/docs/tasks/debug/)
- [kubectl debug](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/)
