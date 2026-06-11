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

- Build a container image with a multi-stage `Containerfile`
- Apply Docker production practices: non-root user, `tini` as PID 1, `HEALTHCHECK`, `.dockerignore`
- Run the image locally and inspect its logs
- Write `Deployment` and `Service` manifests and apply them with `kubectl`
- Inject configuration with a `ConfigMap` and a mounted `Secret`
- Harden the pod with `securityContext`, drop capabilities, and a read-only root filesystem
- Add `PodDisruptionBudget`, `topologySpreadConstraints`, and a default-deny `NetworkPolicy`
- Scale a deployment and perform a rolling update with graceful shutdown
- Use `kubectl logs`, `describe`, and `get events` to inspect runtime state

## Core Concepts

- Images vs containers: An image is an immutable filesystem and metadata bundle. A container is a running instance of an image with its own process, network, and mount namespaces. Bugs that vanish after a rebuild usually mean a stale image.
- Multi-stage builds: One `FROM` per stage. The `build` stage installs compilers, dev libs, and dependencies; the `runtime` stage copies only the artifacts it needs. The final image is smaller, faster to pull, and has a smaller attack surface — none of the build tools ship.
- Layer caching: Each Dockerfile instruction is a layer. The cache invalidates on the first changed instruction. Put rarely-changing instructions (deps install) before frequently-changing ones (source copy) so a one-line code edit does not re-install dependencies.
- PID 1 and signals: A container's entrypoint runs as PID 1. PID 1 has special signal handling — most language runtimes ignore signals they did not register for. Without an init like `tini`, a Kubernetes `SIGTERM` may not reach your app and the pod will be killed forcibly after the grace period.
- Non-root and `securityContext`: A container running as root inside its namespace is still root-mapped (mostly) on the node. The Pod Security Standards `restricted` profile bans this; production-grade clusters enforce non-root, dropped capabilities, no privilege escalation, and read-only root filesystems.
- Deployments and ReplicaSets: A `Deployment` declares desired state; the controller creates a `ReplicaSet` to manage pods. Rolling updates create a new `ReplicaSet` and shift replicas across them.
- Services and pod IPs: Pod IPs are unstable; a `Service` provides a stable virtual IP and DNS name that load-balances across the matching pods. The label selector — not the deployment name — is what binds a service to its pods.
- ConfigMaps and Secrets: Both inject configuration into pods, but `Secret` data is base64-encoded at rest and excluded from default `kubectl describe` output. Neither is encrypted in etcd by default; for that you need encryption-at-rest or Workload Identity for runtime secret access.
- Labels and selectors: Labels are how everything connects in Kubernetes — services to pods, deployments to replicasets, network policies to workloads. Mis-typed labels are the most common reason a service has no endpoints.
- Probes — startup, readiness, liveness: Startup gates the other two during slow boots. Readiness controls whether the pod gets traffic. Liveness controls whether the pod gets killed. Misusing liveness for "is anything wrong" causes restart storms.
- Disruption budgets and spread: A `PodDisruptionBudget` (PDB) prevents voluntary disruptions (node drains, autoscaler) from taking too many replicas at once. `topologySpreadConstraints` spread replicas across zones or nodes so one failure does not become an outage.
- Default-deny networking: A `NetworkPolicy` selects pods and only then permits the listed ingress/egress. Without policies, every pod can reach every service in the cluster — a useful sandbox default and a bad production default.
- Logs and events: `kubectl logs` reads container stdout. `kubectl describe` and `kubectl get events` reveal the cluster's own decisions (scheduling, image pulls, probe failures). Pod-pending failures almost always live in events, not in logs.

## Lab

> ### Run locally with floci
>
> This lab is already **fully local** — it needs only Docker and a Kubernetes cluster, no cloud account. The Cloud Katas lab harness gives you a ready cluster ([kind](https://kind.sigs.k8s.io/)) plus a local image registry:
>
> ```bash
> ./labs/lab.sh up        # creates the "cloud-katas" kind cluster + local registry
> kubectl config use-context kind-cloud-katas
> ```
>
> Wherever this lesson says "load the image into a local cluster", use the kind form against the harness cluster:
>
> ```bash
> kind load docker-image cloud-katas-sample:v1 --name cloud-katas
> ```
>
> **Not emulated locally:** nothing — this lab has no cloud dependency.

### 1. Prepare

Confirm the local toolchain and that a Kubernetes cluster is reachable.

```bash
docker --version
kubectl version --client
kubectl cluster-info
kubectl config current-context
```

If `kubectl cluster-info` returns a connection error, start your local cluster (`minikube start`, `kind create cluster --name learning`, `k3d cluster create learning`, or enable Kubernetes in Docker Desktop) before continuing.

### 2. Read the Multi-Stage Containerfile

Open [../sample-app/containerfile](../sample-app/containerfile) and trace what each stage does:

- `FROM python:${PYTHON_VERSION}-alpine${ALPINE_VERSION} AS build` — the **build stage**. Installs deps into a virtualenv at `/opt/venv` and pre-compiles the app's bytecode. Anything we install here (pip, build tools, dev libs) lives only in this stage and never ships.
- `FROM ... AS runtime` — the **runtime stage**. Starts from the same minimal base, adds `tini`, creates a non-root `app` user, then `COPY --from=build` brings in only the venv and the source. Build tools stay behind.
- `USER app` — final process runs as a non-root user with no shell (`/sbin/nologin`).
- `ENTRYPOINT ["/sbin/tini", "--"]` — `tini` is PID 1. It reaps zombies and forwards `SIGTERM` so Kubernetes-initiated shutdowns drain cleanly.
- `HEALTHCHECK ...` — Docker marks the container unhealthy if `/healthz` is unreachable. Kubernetes uses its own probes (we wire them in step 5) but `HEALTHCHECK` is useful for local runs and `docker-compose`.

Look at the cache-friendliness: `COPY requirements.txt ./` happens before `COPY app.py ./`. A change to `app.py` does *not* re-install dependencies — that layer stays cached.

Also notice `.dockerignore` next to the containerfile. It keeps `.git`, IDE files, and local virtualenvs out of the build context so they cannot leak into the image and cannot bust unrelated layers.

Build the image:

```bash
cd ../sample-app
docker build -f containerfile -t cloud-katas-sample:v1 .
docker images cloud-katas-sample
docker history cloud-katas-sample:v1 --no-trunc | head -20
```

Inspect what the runtime image carries.

```bash
# Image size in bytes (Docker prints raw bytes; on Linux, pipe through `numfmt --to=iec` if you want a human-readable size)
docker image inspect cloud-katas-sample:v1 --format '{{.Size}}'

# Non-root user: command runs after the tini entrypoint, so `id` reports the runtime UID/GID
docker run --rm cloud-katas-sample:v1 id

# Tini as PID 1: do NOT override the entrypoint, otherwise PID 1 becomes the new command
docker run --rm cloud-katas-sample:v1 sh -c 'cat /proc/1/comm'
```

`id` should print `uid=65532(app) gid=65532(app)`. `/proc/1/comm` should print `tini`.

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

Create `k8s/serviceaccount.yaml` — a dedicated service account is the anchor for Workload Identity / IRSA in later cloud lessons. Even in this local lesson, do not pile workloads onto the `default` SA.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: sample
  labels:
    app.kubernetes.io/name: sample
```

Create `k8s/deployment.yaml`. Note the recommended labels, the `securityContext` block, `terminationGracePeriodSeconds`, the `startupProbe`, the `topologySpreadConstraints`, and the writable `emptyDir` for `/tmp` paired with a read-only root filesystem.

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
      automountServiceAccountToken: false
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
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              app.kubernetes.io/name: sample
      containers:
        - name: sample
          image: cloud-katas-sample:v1
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: 8080
              protocol: TCP
          envFrom:
            - configMapRef:
                name: sample-config
          volumeMounts:
            - name: secret-volume
              mountPath: /etc/sample-secret
              readOnly: true
            - name: tmp
              mountPath: /tmp
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
          startupProbe:
            httpGet:
              path: /healthz
              port: http
            failureThreshold: 30
            periodSeconds: 1
          readinessProbe:
            httpGet:
              path: /readyz
              port: http
            initialDelaySeconds: 2
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /healthz
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 5"]
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
            defaultMode: 0440
        - name: tmp
          emptyDir: {}
```

Why each addition matters:

- `securityContext` at pod level enforces non-root, matches the Pod Security Standards `restricted` profile, and applies a default `seccomp` profile.
- `securityContext` at container level drops every Linux capability, disables privilege escalation, and locks the root filesystem to read-only. The `tmp` volume gives the app one writable spot.
- `automountServiceAccountToken: false` — this app does not call the Kubernetes API, so it should not have a projected SA token mountable. Later lessons re-enable this only when needed.
- `startupProbe` gives the app up to 30 seconds (`failureThreshold` × `periodSeconds`) before liveness starts gating it. Useful for slow-start apps; harmless for fast ones.
- `lifecycle.preStop` sleeps 5 seconds before `SIGTERM` so in-flight requests and load balancer deregistration complete cleanly. With `tini` as PID 1, the subsequent `SIGTERM` reaches Python correctly.
- `RollingUpdate` with `maxUnavailable: 0` keeps full capacity during rollouts.
- `topologySpreadConstraints` ask the scheduler to spread replicas across nodes. With one node it is a no-op; with several it prevents all replicas landing on one node.
- `app.kubernetes.io/*` labels are the conventional set that tools like Argo CD, Helm, and Lens use to discover and group resources.

Create `k8s/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: sample
  labels:
    app.kubernetes.io/name: sample
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: sample
  ports:
    - name: http
      port: 80
      targetPort: http
```

Create `k8s/pdb.yaml` so node drains and the cluster autoscaler cannot take all replicas at once.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: sample
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: sample
```

Create `k8s/networkpolicy.yaml` — default-deny ingress to the namespace, then explicitly allow traffic to the `sample` pods on port 8080.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
spec:
  podSelector: {}
  policyTypes: [Ingress]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-sample-http
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: sample
  policyTypes: [Ingress]
  ingress:
    - from:
        - namespaceSelector: {}
      ports:
        - port: 8080
          protocol: TCP
```

Notes on `NetworkPolicy`:

- Many local Kubernetes distros (Docker Desktop, kind without Calico) do not enforce `NetworkPolicy`. The manifest is still correct and will enforce as soon as you deploy to a cluster with a CNI that supports it (GKE Dataplane V2, EKS with Calico, Cilium, etc.).
- The default-deny rule applies to *every* pod in the namespace because `podSelector: {}` matches all. The allow rule then re-permits the specific traffic you want.

### 5. Apply and Inspect

```bash
kubectl apply -f k8s/
kubectl get deployment sample
kubectl get pods -l app.kubernetes.io/name=sample -o wide
kubectl get svc sample
kubectl get pdb sample
kubectl get networkpolicy
kubectl describe deployment sample | head -50
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

Confirm hardening took effect from inside a pod.

```bash
POD=$(kubectl get pod -l app.kubernetes.io/name=sample -o jsonpath='{.items[0].metadata.name}')

# Non-root
kubectl exec "$POD" -- id

# Read-only root filesystem: this should fail
kubectl exec "$POD" -- sh -c 'touch /root-must-fail 2>&1 || echo OK-readonly'

# /tmp is writable (emptyDir)
kubectl exec "$POD" -- sh -c 'touch /tmp/ok && ls /tmp'

# Secret mounted as a file, with restricted perms
kubectl exec "$POD" -- ls -l /etc/sample-secret
kubectl exec "$POD" -- cat /etc/sample-secret/api-token
```

`id` should print `uid=65532(app) gid=65532(app)`. The root-filesystem write should fail. The `/tmp` write should succeed.

### 6. Scale and Roll Out a New Version

Scale up.

```bash
kubectl scale deployment sample --replicas=4
kubectl rollout status deployment/sample
kubectl get pods -l app.kubernetes.io/name=sample
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
kubectl get pdb sample -o jsonpath='{.status.currentHealthy}{"\n"}'
kubectl logs deployment/sample --tail=10
kubectl get events --sort-by=.lastTimestamp | tail -10

# Hardening proofs
kubectl get pod -l app.kubernetes.io/name=sample \
  -o jsonpath='{.items[0].spec.securityContext}{"\n"}'
kubectl get pod -l app.kubernetes.io/name=sample \
  -o jsonpath='{.items[0].spec.containers[0].securityContext}{"\n"}'
```

Success means:

- `availableReplicas` matches `spec.replicas`.
- The `sample` service has endpoints — proof the label selector matches.
- The PDB reports a healthy count matching the replicas.
- Pod-level `securityContext` shows `runAsNonRoot: true` and a UID.
- Container-level `securityContext` shows `readOnlyRootFilesystem: true` and `capabilities.drop: ["ALL"]`.
- Logs include the structured `server_started` line.
- Recent events show the rollout transitions you triggered.

## Troubleshooting

- `ImagePullBackOff`: The cluster cannot see the image. Re-run the local-runtime load command in step 3, or set `imagePullPolicy: Never` for a guaranteed-local image.
- Pods `Pending`: Inspect `kubectl describe pod <name>` for `FailedScheduling` events. Local clusters often run out of CPU or memory at default limits.
- Service has no endpoints: Label drift. `kubectl get pods -l app.kubernetes.io/name=sample` must return non-empty, and the service `selector` must match.
- Readiness probe fails: Curl `http://localhost:8080/readyz` inside a port-forward; check that the container actually listens on port 8080.
- Container fails to start with `permission denied`: The image must support running as the UID set in `runAsUser`. Our containerfile creates the `app` user with UID 65532; if you swap the image, adjust `runAsUser` to match or rebuild with a matching UID.
- Read-only filesystem trips up the app: Some libraries (matplotlib, certain caches) write to `$HOME` at import time. Add an `emptyDir` mounted at `/home/app` or wherever the library wants to write.
- `NetworkPolicy` does not seem to deny anything: The cluster CNI must support enforcement. Docker Desktop and minikube's default CNI do not. The policy still applies once you reach GKE or EKS.
- `tini`-related Docker run says `exec /sbin/tini: no such file`: The runtime stage forgot to `apk add tini`. The supplied containerfile does this; rebuild without cache if you edited it.
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

- Explain what each stage of the multi-stage `containerfile` is responsible for and which files cross the stage boundary.
- Describe what `tini` as PID 1 fixes that running `python` directly does not.
- Identify the single field on the container that makes the root filesystem read-only, and the single volume entry that gives the app one writable spot.
- Explain what `PodDisruptionBudget` and `topologySpreadConstraints` each prevent.
- Show the single command that proves a service is correctly wired to its pods.
- Explain what changes between `Deployment`, `ReplicaSet`, and `Pod` during a rolling update.
- Describe one situation where you would prefer `kubectl describe` over `kubectl logs`.

## Further Reading

- [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [Dockerfile best practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [tini](https://github.com/krallin/tini) (signals and zombie reaping at PID 1)
- [Kubernetes Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- [Pod and container `securityContext`](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)
- [`PodDisruptionBudget`](https://kubernetes.io/docs/tasks/run-application/configure-pdb/)
- [`topologySpreadConstraints`](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/)
- [`NetworkPolicy`](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
- [Kubernetes probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Recommended labels](https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/)
