# Debugging and Troubleshooting on AWS

## Overview

This lesson practices a repeatable EKS debugging workflow against five scenarios: the four canonical pod failures (`ImagePullBackOff`, `CrashLoopBackOff`, `OOMKilled`, `Pending`) and one AWS-specific failure — an unhealthy ALB target group caused by a misconfigured security group or readiness probe. Each scenario is diagnosed using `kubectl`, CloudWatch Logs Insights, and Container Insights.

The mental model is identical to the GCP debugging lesson: events first, then describe, then logs (current and previous), then exec or debug. The AWS twist is that the LB lives outside the cluster, so when traffic stops flowing you must look at AWS target health in parallel with Kubernetes state.

## Estimated Time

- 90 minutes

## Prerequisites

- Completed [Amazon EKS](02-amazon-eks-elastic-kubernetes-service.md) and [Observability on AWS](07-observability-on-aws.md)
- The EKS cluster from lesson 02 still running
- `kubectl`, `aws` authenticated; CloudWatch Logs Insights queries available

## Cost Notice

No additional cost beyond the running cluster. Each broken deployment is torn down at the end of its scenario.

## Learning Objectives

- Diagnose four canonical pod failures with `kubectl` and CloudWatch Logs Insights
- Diagnose an unhealthy ALB/NLB target group using AWS target health, not just Kubernetes state
- Recognize VPC CNI IP exhaustion as a common EKS node-level failure
- Use `kubectl debug --target` against minimal images
- Correlate Kubernetes events to CloudWatch Container Insights metrics

## Core Concepts

- Diagnostic order: events → `kubectl describe` → logs (current + previous) → exec / debug. Each step answers a different question; skipping makes you guess.
- Pod restarts and `--previous`: When a container crashes, `kubectl logs` returns the new (often empty) instance. `kubectl logs --previous` reads the crashed instance.
- `OOMKilled` reason: Pod status `containerStatuses[].lastState.terminated.reason`. The kubelet records this whether the kernel killed the process or the cgroup did.
- AWS target group health: Distinct from Kubernetes readiness. An LB target can be `unhealthy` even if the pod's readiness probe passes, because the LB performs its *own* health check from outside the cluster.
- VPC CNI IP exhaustion: Each EKS node has a max-pods limit set by ENI count × IPs per ENI for its instance type. When pods exceed this, new pods sit in `ContainerCreating` waiting for an IP.
- CloudWatch Container Insights structured logs: Each pod's stdout is in `/aws/containerinsights/CLUSTER/application` indexed by namespace and pod name. Logs Insights queries surface multi-pod patterns faster than `kubectl logs`.

## Lab

### 1. Prepare

```bash
export AWS_PROFILE=cloud-katas
export AWS_REGION="us-east-1"
export CLUSTER_NAME="learning-eks"
kubectl create namespace debug 2>/dev/null
kubectl config set-context --current --namespace=debug
kubectl get nodes
```

### 2. Scenario A: ImagePullBackOff

```bash
kubectl create deployment broken-image \
  --image="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/cloud-katas-sample:not-a-real-tag"

sleep 15
kubectl get pods -l app=broken-image
```

Diagnose:

```bash
POD=$(kubectl get pod -l app=broken-image -o jsonpath='{.items[0].metadata.name}')
kubectl describe pod "$POD" | sed -n '/Events:/,$p'
kubectl get events --sort-by=.lastTimestamp | tail -10
```

Fix with a real tag.

```bash
kubectl set image deployment/broken-image cloud-katas-sample="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/cloud-katas-sample:v1"
kubectl rollout status deployment/broken-image
```

If your account does not have `cloud-katas-sample:v1` in ECR, use a public image such as `public.ecr.aws/nginx/nginx:stable-alpine` to confirm the workflow.

### 3. Scenario B: CrashLoopBackOff

```bash
cat <<EOF | kubectl apply -f -
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
          image: $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/cloud-katas-sample:v1
          env:
            - name: CRASH_ON_START
              value: "true"
EOF

sleep 25
kubectl get pods -l app=crash-loop
```

Diagnose with previous-instance logs:

```bash
POD=$(kubectl get pod -l app=crash-loop -o jsonpath='{.items[0].metadata.name}')
kubectl describe pod "$POD" | sed -n '/State:/,/Events:/p'
kubectl logs "$POD" --previous
```

The previous-instance log shows the `RuntimeError`. Fix:

```bash
kubectl set env deployment/crash-loop CRASH_ON_START-
kubectl rollout status deployment/crash-loop
```

Bonus: query the same failure from Logs Insights to see what teammates would see during a real incident.

```text
fields @timestamp, log
| filter kubernetes.pod_name like /crash-loop/
| filter log like /CRASH_ON_START/
| sort @timestamp desc
```

### 4. Scenario C: OOMKilled

```bash
cat <<EOF | kubectl apply -f -
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
          image: $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/cloud-katas-sample:v1
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

Diagnose:

```bash
POD=$(kubectl get pod -l app=oom-killed -o jsonpath='{.items[0].metadata.name}')
kubectl get pod "$POD" -o jsonpath='{.status.containerStatuses[0].lastState}'; echo
kubectl describe pod "$POD" | grep -E "Reason|State|Limits|Requests"
```

`lastState.terminated.reason` is `OOMKilled`. Container Insights also exposes `pod_memory_utilization` you can graph in CloudWatch.

Fix:

```bash
kubectl set env deployment/oom-killed MEMORY_HOG_MB=8
kubectl patch deployment oom-killed --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/resources/limits/memory","value":"128Mi"}]'
kubectl rollout status deployment/oom-killed
```

### 5. Scenario D: Pending (impossible scheduling)

```bash
cat <<EOF | kubectl apply -f -
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
          image: $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/cloud-katas-sample:v1
EOF

sleep 15
kubectl get pods -l app=stuck-pending
```

Diagnose:

```bash
POD=$(kubectl get pod -l app=stuck-pending -o jsonpath='{.items[0].metadata.name}')
kubectl describe pod "$POD" | sed -n '/Events:/,$p'
```

`FailedScheduling` events name the missing label. Fix:

```bash
kubectl patch deployment stuck-pending --type=json \
  -p='[{"op":"remove","path":"/spec/template/spec/nodeSelector"}]'
kubectl rollout status deployment/stuck-pending
```

### 6. Scenario E: Unhealthy NLB target group

Even when pods are `Ready`, the LB performs its own health check. Misconfigure the readiness probe to a path the app does not serve and watch the LB drop targets.

```bash
cat <<EOF | kubectl apply -f - -n sample
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sample
spec:
  template:
    spec:
      containers:
        - name: sample
          readinessProbe:
            httpGet:
              path: /nope-not-served
              port: 8080
EOF
kubectl -n sample rollout status deployment/sample --timeout=120s || true
```

In a separate terminal, inspect AWS target health:

```bash
SVC=$(kubectl -n sample get svc sample -o jsonpath='{.metadata.annotations.service\.kubernetes\.io/aws-load-balancer-name}' 2>/dev/null)
# If the in-tree NLB is used, target group is auto-named; find it via:
aws elbv2 describe-target-groups --query 'TargetGroups[].{Name:TargetGroupName,Arn:TargetGroupArn}'

# Pick the target group matching the sample service, then:
TG_ARN="arn:aws:elasticloadbalancing:..."
aws elbv2 describe-target-health --target-group-arn "$TG_ARN" \
  --query 'TargetHealthDescriptions[].{Id:Target.Id,State:TargetHealth.State,Reason:TargetHealth.Reason}'
```

Targets should show `unhealthy` with reason `Target.FailedHealthChecks`. Two things to confirm in this case:

- LB health-check path must match a real endpoint on the pod. Reset to `/healthz`.
- Security groups on the nodes (or the pod ENIs, in IRSA scenarios) must allow the LB's traffic.

Restore the readiness probe and watch targets become `healthy`.

### 7. VPC CNI IP Exhaustion (Concept + Diagnosis)

If pods stay in `ContainerCreating` with no scheduling error in events, it is often IP exhaustion on the node's ENIs.

```bash
# What is the node's max-pods limit?
NODE=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
kubectl describe node "$NODE" | grep -E "Capacity|Allocatable" -A 5 | grep pods

# How many pods are on the node?
kubectl get pods --all-namespaces --field-selector spec.nodeName="$NODE" --no-headers | wc -l
```

Fixes (production):

- Use a larger instance type with more ENIs.
- Enable VPC CNI prefix delegation (`ENABLE_PREFIX_DELEGATION=true`) — gives nodes far more IPs by assigning /28 CIDRs.
- Use Karpenter to right-size by pod density requirements.

### 8. Use kubectl debug

```bash
POD=$(kubectl get pod -l app=oom-killed -o jsonpath='{.items[0].metadata.name}')
kubectl debug "$POD" -it --image=busybox:stable --target=sample -- sh
```

Inside:

```sh
ls /proc/1/cmdline
cat /proc/1/status | grep -E "State|VmRSS|VmPeak"
exit
```

The `--target=sample` flag joins the main container's process namespace, letting you see the running process from the debug sidecar.

### 9. Node-Level Quick Look

```bash
kubectl get nodes
kubectl describe node | sed -n '/Conditions:/,/Addresses:/p' | head -40
kubectl top nodes
kubectl top pods --all-namespaces | sort -k4 -nr | head -10
```

`NotReady` nodes need `kubectl describe node`. Common EKS-specific causes: VPC CNI not initialized, kubelet certificate signing pending, or AMI version skew after an upgrade.

## Validate

```bash
kubectl get deployments -n debug
kubectl get pods --all-namespaces --field-selector=status.phase=Pending -o name | wc -l
kubectl get events --sort-by=.lastTimestamp -n debug | tail -10
```

Success means:

- All five scenarios were diagnosed using events, describe, logs, and target health where relevant.
- You identified `OOMKilled` from pod status and used `lastState.terminated.reason`.
- You correlated a pod-level readiness failure to AWS target group unhealthy state.
- You named one cause of `ContainerCreating` that is invisible to `kubectl logs` alone.

## Troubleshooting

- `kubectl logs --previous` empty: the previous instance was GC'd. Inspect Container Insights logs in CloudWatch — they retain history.
- `kubectl debug` rejected: older EKS versions need feature flags. Newer EKS 1.25+ supports ephemeral containers natively.
- Target group health command fails: you may not have permission to call `elasticloadbalancing:DescribeTargetHealth`. Ask for it or check via the AWS console.
- Pods stuck `ContainerCreating`: not always IP exhaustion. Check `kubectl describe pod` and the VPC CNI daemonset logs in `kube-system`.
- Logs Insights returns nothing: the namespace might be filtered out by the addon's default Fluent Bit config. Confirm via `aws logs describe-log-streams`.

## Cleanup

```bash
kubectl delete deployment broken-image crash-loop oom-killed stuck-pending --ignore-not-found
kubectl delete namespace debug --ignore-not-found
# Restore the sample app's readiness probe if you changed it
```

## Cross-Cloud Callout

- AWS LB target health ↔ GCP backend service health: same idea, different surface. GCP's load balancer health checks live in Cloud Logging and the LB UI.
- VPC CNI IP exhaustion ↔ GKE pod IP exhaustion via secondary range: GKE pre-reserves CIDR; AWS allocates from ENIs at runtime.
- CloudWatch Logs Insights ↔ Cloud Logging queries: similar query languages, similar mental model.

## Checkpoint

- Recite the diagnostic order in one sentence.
- Identify the jsonpath that reveals `OOMKilled`.
- Explain why `kubectl logs --previous` matters for `CrashLoopBackOff`.
- Describe one situation where AWS target group health tells you something Kubernetes cannot.

## Further Reading

- [EKS troubleshooting](https://docs.aws.amazon.com/eks/latest/userguide/troubleshooting.html)
- [CloudWatch Container Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ContainerInsights.html)
- [kubectl debug](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/)
- [VPC CNI prefix delegation](https://docs.aws.amazon.com/eks/latest/userguide/cni-increase-ip-addresses.html)
- [Pod lifecycle and termination reasons](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
