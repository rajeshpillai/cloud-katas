# GitOps with Argo CD

## Overview

This lesson installs Argo CD into a Kubernetes cluster, registers a Git repository as the source of truth, syncs an `Application` manifest, demonstrates drift detection by editing live state, and shows how sync waves order multi-resource rollouts.

GitOps changes the operating model: instead of imperatively pushing changes with `kubectl apply`, you commit changes to Git and a controller reconciles the cluster toward the committed state. Rollbacks are reverts. The audit trail is the Git log.

## Estimated Time

- 90-105 minutes

## Prerequisites

- Completed [Docker and Kubernetes Basics](02-docker-and-kubernetes-basics.md)
- A Kubernetes cluster: GKE from [03-google-kubernetes-engine-gke.md](03-google-kubernetes-engine-gke.md), kind, or minikube
- `kubectl` configured for that cluster
- A GitHub or GitLab account and the ability to create a public repository for the lab
- Comfort with basic Git (`clone`, `add`, `commit`, `push`, `revert`) — this whole lesson drives a cluster from a Git repo

> **Background you need (brush-up):** New to any of these? Skim the linked primer — the lab won't stop to explain them.
>
> - [CLI & data formats](../primers/cli-and-data-formats.md) — YAML manifests, `base64 -d` (to read the admin secret), and `kubectl port-forward`.
> - Argo CD's `Application` is a **CRD** (a custom Kubernetes object type Argo installs); the `https://localhost:8080` cert warning is its self-signed TLS — `--insecure` is lab-only.

## Cost Notice

Argo CD itself is free. If you run this against the GKE cluster from lesson 03, the cluster keeps charging until you tear it down. If you prefer zero cost, run against a local cluster.

## Learning Objectives

- Install Argo CD into a cluster and access its UI
- Register a Git repository as the source of truth
- Create an `Application` resource that syncs manifests from Git
- Demonstrate drift detection and automatic remediation
- Order multi-resource rollouts with sync waves
- Recognize the pattern that scales to many apps: app-of-apps

## Core Concepts

- Desired state in Git: The Git repository contains Kubernetes manifests. Whatever is in the tracked path is what the controller will create or update.
- Reconciliation loop: Argo CD polls Git (default every three minutes) and compares hashes to the live cluster. Differences become a `Synced`/`OutOfSync` status the controller can either auto-heal or wait for manual sync.
- Application CR: An `Application` resource points at a Git path, a target revision, and a destination cluster + namespace. It is the unit Argo CD reconciles.
- Sync waves: An annotation `argocd.argoproj.io/sync-wave: "N"` makes Argo CD apply resources in groups, low N first. Useful when a CRD must exist before its custom resources.
- Auto-sync vs manual: `automated.selfHeal=true` reverts drift; `automated.prune=true` deletes resources removed from Git. Both are powerful; turn them on deliberately.
- App-of-apps: A single Argo CD `Application` whose source is a folder of more `Application` manifests. This is how teams manage dozens of apps without dozens of one-off scripts.

## Lab

> ### Run locally with floci
>
> This lab is **fully local** — Argo CD installs straight into a Kubernetes cluster, no cloud account needed. Bring up the harness cluster first:
>
> ```bash
> ./labs/lab.sh up        # creates the "cloud-katas" kind cluster
> kubectl config use-context kind-cloud-katas
> ```
>
> Then run every `kubectl` command in this lab unchanged. Use any **public Git repo** of your own as Argo CD's source of truth.
>
> **Not emulated locally:** nothing — Argo CD's reconciliation loop, drift detection, and self-heal all work the same in kind.

### 1. Install Argo CD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl -n argocd rollout status deployment/argocd-server
kubectl -n argocd rollout status deployment/argocd-application-controller || true
kubectl -n argocd rollout status statefulset/argocd-application-controller
```

Expose the UI for the lab.

```bash
kubectl -n argocd port-forward service/argocd-server 8080:443 >/tmp/argo-pf.log 2>&1 &
ARGO_PF=$!
```

Retrieve the bootstrap admin password.

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d; echo
```

Open `https://localhost:8080` (accept the local TLS warning), log in as `admin` with that password.

Install the `argocd` CLI and log in from the terminal for the rest of the lab.

```bash
brew install argocd 2>/dev/null || \
  curl -sSL -o argocd \
    https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64 \
  && chmod +x argocd && sudo mv argocd /usr/local/bin/

argocd login localhost:8080 --insecure --username admin \
  --password "$(kubectl -n argocd get secret argocd-initial-admin-secret \
                 -o jsonpath='{.data.password}' | base64 -d)"
```

### 2. Prepare the Git Source Repository

Create a new public repository, for example `cloud-katas-gitops`. Clone it locally and add a `sample/` folder with the manifests you used in lesson 02 (Deployment, Service, ConfigMap). Commit and push.

```bash
git clone https://github.com/YOUR_USER/cloud-katas-gitops.git
cd cloud-katas-gitops
mkdir -p sample
cp ../path/to/k8s/*.yaml sample/
git add sample/
git commit -m "Initial sample app manifests"
git push origin main
```

If the deployment image references a private registry, set `imagePullPolicy: IfNotPresent` and ensure the cluster can resolve it. For the public sample, you can use any small image (e.g., `ghcr.io/cloud-katas/sample:v1` if you pushed there, or the original `cloud-katas-sample:v1` if the cluster can pull it).

### 3. Create an Argo CD Application

Create `argo/sample-app.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: sample
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/YOUR_USER/cloud-katas-gitops.git
    targetRevision: main
    path: sample
  destination:
    server: https://kubernetes.default.svc
    namespace: sample
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

Apply it.

```bash
kubectl apply -f argo/sample-app.yaml
argocd app get sample
argocd app sync sample
argocd app wait sample --health
```

Inspect the resulting workload.

```bash
kubectl get all -n sample
```

### 4. Demonstrate Drift Detection

With `selfHeal: true`, edit the live deployment and watch Argo CD revert your change.

```bash
kubectl -n sample scale deployment sample --replicas=5
sleep 10
kubectl -n sample get deployment sample -o jsonpath='{.spec.replicas}{"\n"}'
```

Argo CD should reset replicas to whatever is in Git (likely `2`). The Argo CD UI shows the temporary `OutOfSync` state and the self-heal action.

To make a real change, edit the manifest in Git, push, and let Argo CD pick it up. Force a refresh to avoid waiting for the next poll.

```bash
# In the cloud-katas-gitops repo:
sed -i.bak 's/replicas: 2/replicas: 3/' sample/deployment.yaml
git add sample/deployment.yaml
git commit -m "Scale to 3 replicas"
git push origin main

argocd app sync sample
kubectl -n sample get deployment sample -o jsonpath='{.spec.replicas}{"\n"}'
```

### 5. Use Sync Waves

Add an annotation to the `Service` so it is created in a later wave than the `Deployment`. Modify `sample/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: sample
  annotations:
    argocd.argoproj.io/sync-wave: "1"
spec: { ... }
```

Add `argocd.argoproj.io/sync-wave: "0"` to the `Deployment` to make the order explicit. Commit, push, and sync. Watch the order in the Argo CD UI's "Sync Status" panel.

### 6. Pattern: App-of-Apps

Create `argo/root-app.yaml` that points at a folder containing many `Application` files. This is how teams manage many services from one entry point.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/YOUR_USER/cloud-katas-gitops.git
    targetRevision: main
    path: apps
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

Place individual `Application` manifests under `apps/` in the Git repo. The root app reconciles those, which in turn reconcile workloads.

## Validate

```bash
argocd app get sample -o yaml | grep -E "status:|sync:|health:" | head -10
kubectl -n sample get deployment sample -o jsonpath='{.status.availableReplicas}{"\n"}'
argocd app history sample
```

Success means:

- `argocd app get sample` reports `Sync Status: Synced` and `Health Status: Healthy`.
- Drift to live state is reverted automatically.
- Pushing a change to Git triggers a new revision and rolls out cleanly.
- The app history shows at least two revisions.

## Troubleshooting

- Argo cannot reach the repo: For private repos add credentials with `argocd repo add` and a personal access token. For public repos check the URL and `targetRevision`.
- `ComparisonError`: The manifest is invalid. Run `kubectl apply -f sample/ --dry-run=client` locally to surface the error.
- App is `OutOfSync` but Argo will not heal it: Auto-sync was not enabled, or `prune: false` blocks deletions. Check `spec.syncPolicy.automated`.
- Port-forward dies after a long lab: The Argo CD server pod restarted. Re-run `kubectl port-forward`.
- Sync waves seem ignored: Annotations must be on the resource manifest itself, not the `Application`. Confirm `kubectl get deployment sample -o yaml` shows the annotation.

## Cleanup

```bash
kubectl delete application sample -n argocd --ignore-not-found
kubectl delete application root -n argocd --ignore-not-found
kubectl delete namespace sample --ignore-not-found
kubectl delete namespace argocd --ignore-not-found
kill $ARGO_PF 2>/dev/null || true
```

## Checkpoint

- Explain what a real rollback looks like in GitOps and why it is the same operation as a roll-forward.
- Describe the difference between `selfHeal: true` and `prune: true`.
- Identify the single field in an `Application` that decides which cluster the app deploys to.
- Explain when sync waves are necessary versus when they only add complexity.

## Further Reading

- [Argo CD getting started](https://argo-cd.readthedocs.io/en/stable/getting_started/)
- [Argo CD Application CRD](https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/#applications)
- [Sync phases and waves](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/)
- [App-of-apps pattern](https://argo-cd.readthedocs.io/en/stable/operator-manual/cluster-bootstrapping/)
- [GitOps principles](https://opengitops.dev/)
