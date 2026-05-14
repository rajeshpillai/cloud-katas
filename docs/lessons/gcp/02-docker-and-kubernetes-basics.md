# Docker and Kubernetes Basics

## Overview

This lesson builds a small container image from real source code, runs it locally with Docker, deploys it to a local Kubernetes cluster with declarative YAML, injects configuration with a `ConfigMap` and a `Secret`, scales the deployment, performs a rolling update, and inspects logs and events.

The sample app at [../sample-app/](../sample-app/) is the workload you will deploy in this and several later lessons. It is intentionally small: one Python file, one container image, and a few environment-driven behaviors. The point is to make every Kubernetes object visible without the noise of a real application.

## Estimated Time

- 90-120 minutes

## Prerequisites

- Completed [GCP Fundamentals](01-gcp-fundamentals.md)
- Docker (or Podman) installed and running
- `kubectl` installed
- A local Kubernetes cluster such as Docker Desktop Kubernetes, kind, minikube, or k3d
- About 2 GB of free memory for the local cluster

## Cost Notice

This lesson runs everything locally. No cloud resources are created and there is no cloud cost. You will use the same workload on GKE in a later lesson.

## Learning Objectives

- Build a container image from a `Containerfile`
- Run the image locally and inspect its logs
- Write `Deployment` and `Service` manifests and apply them with `kubectl`
- Inject configuration with a `ConfigMap` and a mounted `Secret`
- Scale a deployment and perform a rolling update
- Use `kubectl logs`, `describe`, and `get events` to inspect runtime state

## Core Concepts

- Images vs containers: An image is an immutable filesystem and metadata bundle. A container is a running instance of an image with its own process, network, and mount namespaces. Bugs that vanish after a rebuild usually mean a stale image.
- Deployments and ReplicaSets: A `Deployment` declares desired state; the controller creates a `ReplicaSet` to manage pods. Rolling updates create a new `ReplicaSet` and shift replicas across them.
- Services and pod IPs: Pod IPs are unstable; a `Service` provides a stable virtual IP and DNS name that load-balances across the matching pods. The label selector — not the deployment name — is what binds a service to its pods.
- ConfigMaps and Secrets: Both inject configuration into pods, but `Secret` data is base64-encoded at rest and excluded from default `kubectl describe` output. Neither is encrypted in etcd by default; for that you need encryption-at-rest or Workload Identity for runtime secret access.
- Labels and selectors: Labels are how everything connects in Kubernetes — services to pods, deployments to replicasets, network policies to workloads. Mis-typed labels are the most common reason a service has no endpoints.
- Logs and events: `kubectl logs` reads container stdout. `kubectl describe` and `kubectl get events` reveal the cluster's own decisions (scheduling, image pulls, probe failures). Pod-pending failures almost always live in events, not in logs.

## Lab

### 1. Prepare

Confirm the local toolchain and that a Kubernetes cluster is reachable.

```bash
docker --version
kubectl version --client
kubectl cluster-info
kubectl config current-context
```

If `kubectl cluster-info` returns a connection error, start your local cluster (`minikube start`, `kind create cluster --name learning`, `k3d cluster create learning`, or enable Kubernetes in Docker Desktop) before continuing.

### 2. Build the Sample App Image

Move into the sample app directory and build the image.

```bash
cd ../sample-app
docker build -f containerfile -t cloud-katas-sample:v1 .
docker images cloud-katas-sample
```

Run the container locally to confirm it serves traffic before involving Kubernetes.

```bash
docker run --rm -d --name sample -p 8080:8080 \
  -e APP_MESSAGE="hello local" \
  -e APP_VERSION="v1" \
  cloud-katas-sample:v1

curl -s http://localhost:8080/ | tee /dev/stderr
curl -s http://localhost:8080/healthz
docker logs sample --tail=5
docker stop sample
```

You should see JSON responses and a structured access log line.

### 3. Make the Image Visible to the Cluster

How an image gets into the cluster depends on which local runtime you use:

- Docker Desktop Kubernetes: images in the local Docker daemon are already visible.
- minikube: run `minikube image load cloud-katas-sample:v1`.
- kind: run `kind load docker-image cloud-katas-sample:v1 --name learning`.
- k3d: run `k3d image import cloud-katas-sample:v1 -c learning`.

Verify the cluster can see the image, then return to a working folder for the manifests.

```bash
cd -
mkdir -p k8s
```

### 4. Write Declarative Manifests

Create `k8s/configmap.yaml` for non-secret runtime config.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: sample-config
data:
  APP_MESSAGE: "hello from kubernetes"
  APP_VERSION: "v1"
```

Create `k8s/secret.yaml` for an example secret. Real secrets should not be checked into Git; this example value is only for the lab.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: sample-secret
type: Opaque
stringData:
  api-token: "example-token-not-real"
```

Create `k8s/deployment.yaml` with two replicas, env from the ConfigMap, and the secret mounted as a file.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sample
  labels:
    app: sample
spec:
  replicas: 2
  selector:
    matchLabels:
      app: sample
  template:
    metadata:
      labels:
        app: sample
    spec:
      containers:
        - name: sample
          image: cloud-katas-sample:v1
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: sample-config
          volumeMounts:
            - name: secret-volume
              mountPath: /etc/sample-secret
              readOnly: true
          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080
            initialDelaySeconds: 2
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              cpu: "50m"
              memory: "64Mi"
            limits:
              cpu: "200m"
              memory: "128Mi"
      volumes:
        - name: secret-volume
          secret:
            secretName: sample-secret
```

Create `k8s/service.yaml` to expose the deployment inside the cluster.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: sample
spec:
  type: ClusterIP
  selector:
    app: sample
  ports:
    - port: 80
      targetPort: 8080
```

### 5. Apply and Inspect

```bash
kubectl apply -f k8s/
kubectl get deployment sample
kubectl get pods -l app=sample -o wide
kubectl get svc sample
kubectl describe deployment sample | head -40
```

Port-forward the service and exercise the endpoints.

```bash
kubectl port-forward service/sample 8080:80 >/tmp/pf.log 2>&1 &
PF_PID=$!
sleep 1
curl -s http://localhost:8080/
curl -s http://localhost:8080/healthz
kubectl logs deployment/sample --tail=20
kill $PF_PID
```

Confirm the secret was mounted as a file inside one of the pods.

```bash
POD=$(kubectl get pod -l app=sample -o jsonpath='{.items[0].metadata.name}')
kubectl exec "$POD" -- ls /etc/sample-secret
kubectl exec "$POD" -- cat /etc/sample-secret/api-token
```

### 6. Scale and Roll Out a New Version

Scale up.

```bash
kubectl scale deployment sample --replicas=4
kubectl rollout status deployment/sample
kubectl get pods -l app=sample
```

Build a second image to simulate a release, load it into the cluster the same way, then roll it out.

```bash
cd ../sample-app
docker build -f containerfile -t cloud-katas-sample:v2 .
# repeat the load step appropriate for your local runtime, then:
cd -
kubectl set image deployment/sample sample=cloud-katas-sample:v2
kubectl rollout status deployment/sample
kubectl rollout history deployment/sample
```

If the rollout misbehaves, roll back.

```bash
kubectl rollout undo deployment/sample
```

## Validate

```bash
kubectl get deployment sample -o jsonpath='{.status.availableReplicas}{"\n"}'
kubectl get endpoints sample
kubectl logs deployment/sample --tail=10
kubectl get events --sort-by=.lastTimestamp | tail -10
```

Success means:

- `availableReplicas` matches `spec.replicas`.
- The `sample` service has endpoints — proof the label selector matches.
- Logs include the structured `server_started` line.
- Recent events show the rollout transitions you triggered.

## Troubleshooting

- `ImagePullBackOff`: The cluster cannot see the image. Re-run the local-runtime load command in step 3, or set `imagePullPolicy: Never` for a guaranteed-local image.
- Pods `Pending`: Inspect `kubectl describe pod <name>` for `FailedScheduling` events. Local clusters often run out of CPU or memory at default limits.
- Service has no endpoints: Label drift. `kubectl get pods -l app=sample` must return non-empty, and the service `selector` must match.
- Readiness probe fails: Curl `http://localhost:8080/readyz` inside a port-forward; check that the container actually listens on port 8080.
- Port-forward exits with `address already in use`: A previous forward is still running. `lsof -i :8080` and stop it.

## Cleanup

```bash
kubectl delete -f k8s/
docker rmi cloud-katas-sample:v1 cloud-katas-sample:v2 || true
```

Confirm cleanup.

```bash
kubectl get deployment sample 2>&1 | grep -i "not found"
```

## Checkpoint

- Explain what changes between `Deployment`, `ReplicaSet`, and `Pod` during a rolling update.
- Show the single command that proves a service is correctly wired to its pods.
- Explain why `Secret` data is *not* encrypted at rest by default in vanilla Kubernetes.
- Describe one situation where you would prefer `kubectl describe` over `kubectl logs`.

## Further Reading

- [Docker getting started](https://docs.docker.com/get-started/)
- [Kubernetes basics](https://kubernetes.io/docs/tutorials/kubernetes-basics/)
- [Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [ConfigMaps and Secrets](https://kubernetes.io/docs/concepts/configuration/configmap/)
- [Kubernetes probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
