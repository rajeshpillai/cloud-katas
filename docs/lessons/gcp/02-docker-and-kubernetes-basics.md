# Docker and Kubernetes Basics

## Overview

This lesson builds a tiny container image, runs it locally, deploys it to Kubernetes, exposes it with a service, and inspects the result.

## Estimated Time

- 90 minutes

## Prerequisites

- Docker or a compatible container runtime
- `kubectl`
- A local Kubernetes cluster such as Docker Desktop Kubernetes, kind, or minikube
- Completed [GCP Fundamentals](01-gcp-fundamentals.md)

## Learning Objectives

- Build and run a container image
- Deploy a workload with Kubernetes
- Inspect pods, services, logs, and events

## Core Concepts

- Images are immutable application packages
- Containers are running instances of images
- Deployments manage replicas and rollouts
- Services provide stable network access to pods

## Lab

### 1. Prepare

Confirm the local toolchain.

```bash
docker --version
kubectl version --client
kubectl cluster-info
```

### 2. Run a Container

Use a small public image first.

```bash
docker run --rm -p 8080:80 nginx:stable-alpine
```

Open `http://localhost:8080`, then stop the container.

### 3. Deploy to Kubernetes

```bash
kubectl create deployment web --image=nginx:stable-alpine
kubectl expose deployment web --port=80 --type=ClusterIP
kubectl get pods,svc
```

Forward the service locally.

```bash
kubectl port-forward service/web 8080:80
```

## Validate

```bash
kubectl get deployment web
kubectl logs deployment/web
kubectl describe service web
```

Success means the deployment is available, logs are readable, and port-forwarding serves the app.

## Troubleshooting

- Image pull errors: check network access and image name.
- Pod pending: inspect `kubectl describe pod` for scheduling or resource problems.
- Port already in use: choose another local port such as `8081:80`.

## Cleanup

```bash
kubectl delete service web
kubectl delete deployment web
```

## Further Reading

- [Docker getting started](https://docs.docker.com/get-started/)
- [Kubernetes basics](https://kubernetes.io/docs/tutorials/kubernetes-basics/)
