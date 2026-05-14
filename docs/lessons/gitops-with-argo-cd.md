# GitOps with Argo CD

## Overview

This lesson introduces GitOps by installing Argo CD into a Kubernetes cluster and syncing an application from Git.

## Estimated Time

- 75 minutes

## Prerequisites

- Completed [Docker and Kubernetes Basics](docker-and-kubernetes-basics.md)
- Access to a Kubernetes cluster such as GKE, EKS, kind, or minikube
- `kubectl`

## Learning Objectives

- Explain desired state and reconciliation
- Install Argo CD
- Create and sync an Argo CD application

## Core Concepts

- Git is the source of truth
- A controller reconciles cluster state to match Git
- Drift is detected when live state differs from desired state
- Rollbacks happen by reverting Git changes or syncing an earlier revision

## Lab

### 1. Install Argo CD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl -n argocd rollout status deployment/argocd-server
```

### 2. Access the UI

```bash
kubectl -n argocd port-forward service/argocd-server 8080:443
```

Open `https://localhost:8080`. The browser may warn about the local certificate.

### 3. Create an Application

Apply a sample application from the Argo CD examples repository.

```bash
kubectl apply -f https://raw.githubusercontent.com/argoproj/argocd-example-apps/master/guestbook/guestbook-ui-deployment.yaml
kubectl apply -f https://raw.githubusercontent.com/argoproj/argocd-example-apps/master/guestbook/guestbook-ui-svc.yaml
```

For a full GitOps workflow, define an Argo CD `Application` that points at a Git path and let Argo CD create the workload.

## Validate

```bash
kubectl -n argocd get pods
kubectl get deployments,services
```

Success means Argo CD is healthy and the sample app exists in the cluster.

## Troubleshooting

- Pods not ready: check `kubectl -n argocd describe pod`.
- Cannot access UI: confirm port-forward is still running.
- Sync errors: review the application events and repository path.

## Cleanup

```bash
kubectl delete deployment guestbook-ui --ignore-not-found
kubectl delete service guestbook-ui --ignore-not-found
kubectl delete namespace argocd
```

## Further Reading

- [Argo CD getting started](https://argo-cd.readthedocs.io/en/stable/getting_started/)
- [GitOps principles](https://opengitops.dev/)
