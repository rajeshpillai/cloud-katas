# Debugging and Troubleshooting

## Overview

This lesson practices a repeatable Kubernetes debugging workflow against four broken-pod scenarios that cover most real-world incidents: `ImagePullBackOff`, `CrashLoopBackOff`, `OOMKilled`, and `Pending` due to unsatisfiable scheduling. For each scenario you will reproduce the failure with the sample app, diagnose it from logs and events, and apply the fix.

The point is not to memorize commands but to internalize the order: events first, then describe, then logs, then exec or debug containers. Skipping straight to logs hides whole categories of failure.

## Estimated Time

- 75-90 minutes

## Prerequisites

- Completed [Google Kubernetes Engine (GKE)](03-google-kubernetes-engine-gke.md) and [Observability on GCP](09-observability-on-gcp.md)
- A Kubernetes cluster (GKE, kind, or minikube)
- `kubectl` configured for that cluster
- The sample app image available to the cluster (locally loaded or pushed to a reachable registry)

## Cost Notice

No additional cloud cost beyond the cluster you are using. Each broken deployment is torn down at the end of its scenario.

## Learning Objectives

- Diagnose `ImagePullBackOff` and find the root cause in events
- Diagnose `CrashLoopBackOff` using logs of the previous container instance
- Diagnose `OOMKilled` from pod status and node-level signals
- Diagnose unschedulable pods (Pending) using events and resource requests
- Use `kubectl debug` to attach an ephemeral container to a minimal image

## Core Concepts

- The diagnostic order: events first, then `kubectl describe`, then logs (current and previous), then exec or ephemeral debug. Events are the cluster's own narrative; logs are the application's.
- Container restarts and `--previous`: When a pod crashes and restarts, `kubectl logs` returns the new (probably-empty) instance's logs. Use `kubectl logs --previous` to read the crashed instance.
- `OOMKilled` vs CrashLoopBackOff: Both produce restart loops, but `OOMKilled` has a specific termination reason. Inspect `kubectl get pod -o yaml | yq .status.containerStatuses` (or jsonpath) to see it.
- Pending pods and scheduling: A pod is `Pending` until a node can satisfy its requests, tolerations, affinity, and selectors. Events spell out exactly which constraint failed.
- Ephemeral debug containers: `kubectl debug` attaches a sidecar to a running pod, useful when the main container is a minimal image without `sh`, `curl`, or `nslookup`.
- Node-level vs pod-level: A pod that cannot schedule, an `Evicted` pod, a node `NotReady` — these failures live above the pod boundary and need `kubectl describe node` to diagnose.

## Lab

> ### Run locally with floci
>
> This lab is **fully local** — every failure mode you diagnose reproduces in a plain Kubernetes cluster, no cloud account needed. Bring up the harness cluster first:
>
> ```bash
> ./labs/lab.sh up        # creates the "cloud-katas" kind cluster
> kubectl config use-context kind-cloud-katas
> ```
>
> All four scenarios (ImagePullBackOff, CrashLoopBackOff via `CRASH_ON_START`, OOMKilled via `MEMORY_HOG_MB`, and Pending) run unchanged in kind using the sample app's built-in failure flags.
>
> **Not emulated locally:** nothing — these are Kubernetes-level diagnostics that behave identically on GKE.

### 1. Prepare

```bash
kubectl create namespace debug 2>/dev/null
kubectl config set-context --current --namespace=debug
kubectl get nodes
```

### 2. Scenario A: ImagePullBackOff

Create a deployment that references a non-existent tag.

```bash
kubectl create deployment broken-image \
  --image=cloud-katas-sample:does-not-exist
kubectl get pods -l app=broken-image -w
```

Stop watching after the pod hits `ImagePullBackOff`. Diagnose.

```bash
POD=$(kubectl get pod -l app=broken-image -o jsonpath='{.items[0].metadata.name}')
kubectl describe pod "$POD" | sed -n '/Events:/,$p'
kubectl get events --sort-by=.lastTimestamp | tail -10
```

You should see `Failed to pull image ... not found` in the events. Fix by updating the image to a real tag.

```bash
kubectl set image deployment/broken-image cloud-katas-sample=cloud-katas-sample:v1
kubectl rollout status deployment/broken-image
```

If your cluster cannot pull the local tag, use a public image such as `nginx:stable-alpine` to confirm the workflow.

### 3. Scenario B: CrashLoopBackOff

Run the sample app with `CRASH_ON_START=true`.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: crash-loop
  labels: { app: crash-loop }
spec:
  replicas: 1
  selector:
    matchLabels: { app: crash-loop }
  template:
    metadata:
      labels: { app: crash-loop }
    spec:
      containers:
        - name: sample
          image: cloud-katas-sample:v1
          env:
            - name: CRASH_ON_START
              value: "true"
EOF

sleep 20
kubectl get pods -l app=crash-loop
```

Diagnose using the previous instance's logs.

```bash
POD=$(kubectl get pod -l app=crash-loop -o jsonpath='{.items[0].metadata.name}')
kubectl describe pod "$POD" | sed -n '/State:/,/Events:/p'
kubectl logs "$POD" --previous
```

The previous-instance logs show the `CRASH_ON_START=true was set` `RuntimeError`. Fix by removing the env var.

```bash
kubectl set env deployment/crash-loop CRASH_ON_START-
kubectl rollout status deployment/crash-loop
```

### 4. Scenario C: OOMKilled

Run the sample app with a memory hog larger than the container limit.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oom-killed
  labels: { app: oom-killed }
spec:
  replicas: 1
  selector:
    matchLabels: { app: oom-killed }
  template:
    metadata:
      labels: { app: oom-killed }
    spec:
      containers:
        - name: sample
          image: cloud-katas-sample:v1
          env:
            - name: MEMORY_HOG_MB
              value: "256"
          resources:
            limits:
              memory: "64Mi"
              cpu: "200m"
EOF

sleep 25
kubectl get pods -l app=oom-killed
```

Diagnose.

```bash
POD=$(kubectl get pod -l app=oom-killed -o jsonpath='{.items[0].metadata.name}')
kubectl get pod "$POD" -o jsonpath='{.status.containerStatuses[0].lastState}' ; echo
kubectl describe pod "$POD" | grep -E "Reason|State|Limits|Requests"
```

`lastState.terminated.reason` shows `OOMKilled`. Fix by raising the limit or shrinking the hog.

```bash
kubectl set env deployment/oom-killed MEMORY_HOG_MB=8
kubectl patch deployment oom-killed --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/resources/limits/memory","value":"128Mi"}]'
kubectl rollout status deployment/oom-killed
```

### 5. Scenario D: Pending (unsatisfiable scheduling)

Create a deployment that demands a label no node has.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: stuck-pending
  labels: { app: stuck-pending }
spec:
  replicas: 1
  selector:
    matchLabels: { app: stuck-pending }
  template:
    metadata:
      labels: { app: stuck-pending }
    spec:
      nodeSelector:
        cloud-katas/role: "imaginary"
      containers:
        - name: sample
          image: cloud-katas-sample:v1
EOF

sleep 15
kubectl get pods -l app=stuck-pending
```

Diagnose.

```bash
POD=$(kubectl get pod -l app=stuck-pending -o jsonpath='{.items[0].metadata.name}')
kubectl describe pod "$POD" | sed -n '/Events:/,$p'
```

`FailedScheduling` events spell out which constraint cannot be met. Fix by removing the selector or labeling a node.

```bash
kubectl patch deployment stuck-pending --type=json \
  -p='[{"op":"remove","path":"/spec/template/spec/nodeSelector"}]'
kubectl rollout status deployment/stuck-pending
```

### 6. Use kubectl debug

Sometimes the container image is too minimal to investigate from inside (no shell, no `curl`). Use an ephemeral debug container.

```bash
POD=$(kubectl get pod -l app=oom-killed -o jsonpath='{.items[0].metadata.name}')
kubectl debug "$POD" -it --image=busybox:stable --target=sample -- sh
```

From inside busybox:

```sh
ls /proc/1/cmdline
cat /proc/1/status | grep -E "State|VmRSS|VmPeak"
exit
```

Process namespace sharing (the `--target=sample` flag) lets the debug container see the main process. This is how you investigate a running pod whose own image lacks tools.

### 7. Node-Level Quick Look

When pods are healthy but the cluster is not:

```bash
kubectl get nodes
kubectl describe node | sed -n '/Conditions:/,/Addresses:/p' | head -40
kubectl top nodes
kubectl top pods --all-namespaces | sort -k4 -nr | head -10
```

Nodes can be `NotReady` because of disk pressure, memory pressure, or kubelet trouble. `kubectl describe node` makes the reason explicit.

## Validate

```bash
kubectl get deployments
kubectl get pods --all-namespaces --field-selector=status.phase=Running -l app -o name | wc -l
kubectl get events --sort-by=.lastTimestamp | tail -10
```

Success means:

- All four broken scenarios were diagnosed using events + describe + logs.
- Each fix was confirmed by a successful rollout.
- You used `kubectl debug` to inspect a pod's running process from a sidecar container.
- You can name the single jsonpath that reveals an `OOMKilled` reason.

## Troubleshooting

- `kubectl logs --previous` returns nothing: The previous instance was garbage-collected. Check the container restart count (`kubectl get pod -o wide`) and the kubelet's log retention.
- `kubectl debug` returns "ephemeral containers feature not enabled": Older Kubernetes versions need the feature gate. GKE 1.23+, kind/minikube recent versions support it natively.
- Pod stays in `ContainerCreating`: Check the kubelet on the assigned node. Common causes: volume attach delay, image pull from a slow registry, network plugin not ready.
- `OOMKilled` reason missing: The pod was killed by the node, not by the kubelet. `dmesg | tail` on the node (where allowed) confirms a kernel OOM event.
- Events seem out of order: They are deduplicated and aggregated; the `--sort-by=.lastTimestamp` flag is the right one for chronological order.

## Cleanup

```bash
kubectl delete deployment broken-image crash-loop oom-killed stuck-pending --ignore-not-found
kubectl delete namespace debug --ignore-not-found
```

## Checkpoint

- Recite the diagnostic order (events → describe → logs → exec/debug).
- Explain why `kubectl logs --previous` is essential for diagnosing `CrashLoopBackOff`.
- Identify the jsonpath that reveals the termination reason for the last container instance.
- Describe one situation where `kubectl debug` is the only viable tool.

## Further Reading

- [Kubernetes debugging](https://kubernetes.io/docs/tasks/debug/)
- [kubectl debug](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/)
- [Pod lifecycle and termination reasons](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
- [Resource requests and limits](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Cloud Logging for GKE](https://cloud.google.com/stackdriver/docs/solutions/gke)
