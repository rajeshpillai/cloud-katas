# Google Kubernetes Engine (GKE)

## Overview

This lesson creates a managed GKE cluster, deploys the sample app, configures Workload Identity so the pod can call Google Cloud APIs without a service account key, enables a Horizontal Pod Autoscaler, and inspects node-level configuration.

The goal is to move from the local cluster in [02-docker-and-kubernetes-basics.md](02-docker-and-kubernetes-basics.md) to a cloud cluster while keeping the same workload. Pay attention to the new things GKE adds: managed control plane, node pools, Workload Identity, and built-in load balancing.

## Estimated Time

- 90-120 minutes

## Prerequisites

- Completed [GCP Fundamentals](01-gcp-fundamentals.md) and [Docker and Kubernetes Basics](02-docker-and-kubernetes-basics.md)
- A GCP project with billing enabled
- `gcloud` authenticated and the `cloud-katas` configuration active
- `kubectl` installed
- The GKE auth plugin: `gcloud components install gke-gcloud-auth-plugin`

## Cost Notice

GKE Autopilot bills per pod CPU/memory request; Standard bills per node. A small Autopilot cluster running this lab is typically a small handful of US dollars per day; tear it down at the end. The cluster control plane has a per-hour management fee.

## Learning Objectives

- Create a GKE cluster (Autopilot for low-touch, Standard when you need node control)
- Deploy a workload and expose it with a managed external load balancer
- Configure Workload Identity to grant the pod IAM permissions safely
- Enable a Horizontal Pod Autoscaler and trigger it with load
- Read node and pod placement, including taints and labels

## Core Concepts

- Control plane vs nodes: GKE manages the control plane. You see only the API server endpoint and credentials. Nodes (in Standard) or pod sandboxes (in Autopilot) run your workloads.
- Autopilot vs Standard: Autopilot hides node management and bills per pod resource request — it is the right default for learning and most production workloads. Standard exposes node pools, machine types, GPUs, and DaemonSets; choose it when you need that control.
- Node pools and machine types (Standard only): Each pool is a uniformly configured group of nodes. Use multiple pools for GPU vs CPU workloads, spot vs on-demand, or different network surface (private nodes vs public). Taints + tolerations keep certain workloads on certain pools.
- Workload Identity: Kubernetes ServiceAccount tokens are exchanged for short-lived Google credentials. No long-lived JSON keys, no `imagePullSecrets`-style juggling. This is the GCP equivalent of AWS IRSA.
- Horizontal Pod Autoscaler: HPA scales replicas based on metrics (CPU, memory, or custom). It will not scale below the deployment's `minReplicas` or above `maxReplicas`. It cannot scale nodes; that is the Cluster Autoscaler or Autopilot's job.
- Managed load balancers: A `Service` of type `LoadBalancer` provisions a real Google Cloud Load Balancer. It can take 1-3 minutes to get an external IP. Inspect `kubectl describe service` events while waiting.

## Lab

### 1. Prepare

Activate the course configuration and set variables.

```bash
gcloud config configurations activate cloud-katas
export PROJECT_ID=$(gcloud config get-value project)
export REGION="us-central1"
export CLUSTER_NAME="learning-gke"
export NAMESPACE="sample"
```

Enable required APIs.

```bash
gcloud services enable \
  container.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com
```

### 2. Create an Autopilot Cluster

Autopilot is the recommended default. Workload Identity is on automatically.

```bash
gcloud container clusters create-auto "$CLUSTER_NAME" \
  --region "$REGION" \
  --release-channel=regular
```

This step takes several minutes. While you wait, read the next section so you know what to do as soon as the cluster is ready.

Get credentials.

```bash
gcloud container clusters get-credentials "$CLUSTER_NAME" --region "$REGION"
kubectl config current-context
kubectl get nodes
```

### 3. Push the Sample App to Artifact Registry

Create a Docker repository in Artifact Registry, configure Docker auth, and push the image.

```bash
gcloud artifacts repositories create cloud-katas \
  --repository-format=docker \
  --location="$REGION" \
  --description="Cloud Katas images" || true

gcloud auth configure-docker "$REGION-docker.pkg.dev"

export IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/cloud-katas/sample:v1"

cd ../sample-app
docker build -f containerfile -t "$IMAGE" .
docker push "$IMAGE"
cd -
```

### 4. Deploy the Workload

Create a namespace and apply manifests that carry forward the hardening baseline from [02-docker-and-kubernetes-basics.md](02-docker-and-kubernetes-basics.md). The cloud-specific differences are the registry image URL, a `LoadBalancer` service, and `automountServiceAccountToken: true` so Workload Identity can project a token.

```bash
kubectl create namespace "$NAMESPACE"
kubectl config set-context --current --namespace "$NAMESPACE"
```

Create `gke/sa.yaml`:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: sample
  labels:
    app.kubernetes.io/name: sample
```

Create `gke/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sample
  labels:
    app.kubernetes.io/name: sample
    app.kubernetes.io/version: "v1"
    app.kubernetes.io/component: backend
    app.kubernetes.io/part-of: cloud-katas
spec:
  replicas: 2
  revisionHistoryLimit: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app.kubernetes.io/name: sample
  template:
    metadata:
      labels:
        app.kubernetes.io/name: sample
        app.kubernetes.io/version: "v1"
    spec:
      serviceAccountName: sample
      # Workload Identity needs the projected SA token, so leave automount at the default (true).
      terminationGracePeriodSeconds: 30
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        runAsGroup: 65532
        fsGroup: 65532
        seccompProfile:
          type: RuntimeDefault
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              app.kubernetes.io/name: sample
      containers:
        - name: sample
          image: REPLACE_WITH_IMAGE
          ports:
            - name: http
              containerPort: 8080
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
          volumeMounts:
            - name: tmp
              mountPath: /tmp
          startupProbe:
            httpGet: { path: /healthz, port: http }
            failureThreshold: 30
            periodSeconds: 1
          readinessProbe:
            httpGet: { path: /readyz, port: http }
          livenessProbe:
            httpGet: { path: /healthz, port: http }
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 5"]
          resources:
            requests: { cpu: "100m", memory: "128Mi" }
            limits: { cpu: "500m", memory: "256Mi" }
      volumes:
        - name: tmp
          emptyDir: {}
```

Create `gke/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: sample
  labels:
    app.kubernetes.io/name: sample
spec:
  type: LoadBalancer
  selector:
    app.kubernetes.io/name: sample
  ports:
    - name: http
      port: 80
      targetPort: http
```

Substitute the image URL and apply.

```bash
sed -i.bak "s|REPLACE_WITH_IMAGE|$IMAGE|" gke/deployment.yaml
kubectl apply -f gke/
kubectl rollout status deployment/sample
```

Wait for the external IP to appear (this can take a couple of minutes).

```bash
kubectl get service sample -w
```

When `EXTERNAL-IP` shows an address, exit with Ctrl-C and curl it.

```bash
EXTERNAL_IP=$(kubectl get service sample -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
curl -s "http://$EXTERNAL_IP/"
curl -s "http://$EXTERNAL_IP/healthz"
```

### 5. Wire Up Workload Identity

Create a Google service account, grant it a narrow role, and bind it to the Kubernetes service account.

```bash
export GSA="sample-gke@$PROJECT_ID.iam.gserviceaccount.com"
gcloud iam service-accounts create sample-gke --display-name="GKE sample workload"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$GSA" \
  --role="roles/logging.logWriter"

gcloud iam service-accounts add-iam-policy-binding "$GSA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:$PROJECT_ID.svc.id.goog[$NAMESPACE/sample]"

kubectl annotate serviceaccount sample \
  iam.gke.io/gcp-service-account="$GSA" --overwrite

kubectl rollout restart deployment/sample
kubectl rollout status deployment/sample
```

Prove the token exchange works inside the pod.

```bash
POD=$(kubectl get pod -l app.kubernetes.io/name=sample -o jsonpath='{.items[0].metadata.name}')
kubectl exec "$POD" -- sh -c '
  apk add --no-cache curl jq >/dev/null 2>&1 || true
  curl -s -H "Metadata-Flavor: Google" \
    http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email
'
```

The output should be the email of `sample-gke@...`, not the default Compute Engine service account.

### 6. Enable Horizontal Pod Autoscaler

```bash
kubectl autoscale deployment sample --cpu-percent=50 --min=2 --max=6
kubectl get hpa sample
```

Generate load and watch the autoscaler react.

```bash
kubectl run loadgen --rm -it --image=busybox:stable --restart=Never -- \
  sh -c 'while true; do wget -q -O- http://sample/; done'
```

In another terminal:

```bash
kubectl get hpa sample -w
kubectl get pods -l app.kubernetes.io/name=sample -w
```

Stop the load generator with Ctrl-C and observe the scale-down (HPA scale-down has a default 5-minute stabilization window).

### 7. Inspect Node Placement and Pod Identity

```bash
kubectl get nodes -o wide
kubectl get pod -l app.kubernetes.io/name=sample -o wide
kubectl describe pod -l app.kubernetes.io/name=sample | grep -E "Node:|Labels:|ServiceAccount:"
```

For Standard clusters only, you would explore node pools, taints, and `nodeSelector` here. Autopilot abstracts those away.

## Validate

```bash
kubectl get deployment sample -o jsonpath='{.status.availableReplicas}{"\n"}'
kubectl get service sample -o jsonpath='{.status.loadBalancer.ingress[0].ip}{"\n"}'
kubectl get hpa sample
kubectl get sa sample -o jsonpath='{.metadata.annotations.iam\.gke\.io/gcp-service-account}{"\n"}'
```

Success means:

- The deployment is fully available.
- The load balancer has an external IP and serves JSON over HTTP.
- The HPA reports a current CPU utilization figure.
- The Kubernetes service account is annotated with the Google service account email.

## Troubleshooting

- Cluster create fails with `INVALID_ARGUMENT`: Check region availability for Autopilot and that the Compute Engine and Kubernetes Engine APIs are enabled.
- `EXTERNAL-IP` stuck on `<pending>`: Inspect `kubectl describe service sample`. Typical causes: project does not have load balancer quota in the region, or the cluster's network has a stuck reservation.
- Pod cannot call Google APIs: Confirm both bindings exist. The Workload Identity user binding must reference exactly `serviceAccount:$PROJECT_ID.svc.id.goog[$NAMESPACE/$KSA]`.
- HPA shows `<unknown>` for CPU: Metrics Server is still warming up, or the pod has no CPU `requests`. HPA needs a request to compute utilization.

## Cleanup

```bash
kubectl delete -f gke/ --ignore-not-found
kubectl delete sa sample --ignore-not-found
kubectl delete namespace "$NAMESPACE" --ignore-not-found
gcloud container clusters delete "$CLUSTER_NAME" --region "$REGION" --quiet
gcloud iam service-accounts delete "$GSA" --quiet
gcloud artifacts repositories delete cloud-katas --location="$REGION" --quiet
```

Confirm the cluster is gone:

```bash
gcloud container clusters list --filter="name=$CLUSTER_NAME" --format=json | grep -q "\\[\\]" && echo "cleanup complete"
```

## Checkpoint

- Explain why Workload Identity is preferred over downloading a JSON key for the service account.
- Describe the difference between scaling pods (HPA) and scaling nodes (Cluster Autoscaler or Autopilot).
- Name the single field that determines which Google service account a pod runs as.
- Explain when you would pick Standard over Autopilot.

## Further Reading

- [GKE documentation](https://cloud.google.com/kubernetes-engine/docs)
- [GKE Autopilot vs Standard](https://cloud.google.com/kubernetes-engine/docs/concepts/choose-cluster-mode)
- [GKE Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
- [Horizontal Pod Autoscaler](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
