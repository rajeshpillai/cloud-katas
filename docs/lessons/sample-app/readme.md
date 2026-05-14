# Sample App

A tiny HTTP service used across the hands-on lessons. It returns JSON, exposes health endpoints, emits structured logs, and can be configured to fail for debugging exercises.

The container image is built with a multi-stage `containerfile` that demonstrates the production patterns lessons reference: dependency layer separation, non-root user, `tini` as PID 1, and a `HEALTHCHECK`.

## Files

- `app.py` — Python stdlib HTTP server.
- `requirements.txt` — placeholder for runtime dependencies (none today).
- `containerfile` — multi-stage build (Docker/Podman-compatible).
- `.dockerignore` — excludes local clutter from the build context.

## Build

```bash
docker build -f containerfile -t cloud-katas-sample:local .
```

To pin Python version explicitly:

```bash
docker build -f containerfile \
  --build-arg PYTHON_VERSION=3.13 \
  --build-arg ALPINE_VERSION=3.20 \
  -t cloud-katas-sample:local .
```

## Run

```bash
docker run --rm -p 8080:8080 \
  -e APP_MESSAGE="hello learner" \
  -e APP_VERSION="v1" \
  cloud-katas-sample:local
```

## Endpoints

- `/`: message, version, path, memory setting.
- `/healthz`: liveness.
- `/readyz`: readiness.

## Failure Modes

- `CRASH_ON_START=true`: exits during startup. Used in CrashLoopBackOff scenarios.
- `MEMORY_HOG_MB=128`: allocates memory at startup. Used in OOMKilled scenarios.

## What the containerfile demonstrates

- **Multi-stage build**: `build` stage installs deps and pre-compiles bytecode; `runtime` stage copies only what is needed and carries no build tools.
- **Non-root user**: image runs as the `app` user (UID/GID created in the runtime stage).
- **`tini` as PID 1**: forwards signals correctly so `SIGTERM` from Kubernetes triggers a clean shutdown.
- **`HEALTHCHECK`**: lets Docker mark the container unhealthy. Kubernetes uses its own probes; this matters for local runs and docker-compose.
- **Layer cache**: `requirements.txt` is copied before `app.py`, so source-only changes do not bust the dependency layer.
- **`PYTHONUNBUFFERED=1`**: stdout flushes immediately so `kubectl logs` shows output without delay.
