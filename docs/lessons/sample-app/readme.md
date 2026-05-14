# Sample App

This tiny HTTP service is used across the hands-on lessons. It returns JSON, exposes health endpoints, emits structured logs, and can be configured to fail for debugging exercises.

## Build

```bash
docker build -f containerfile -t cloud-katas-sample:local .
```

## Run

```bash
docker run --rm -p 8080:8080 \
  -e APP_MESSAGE="hello learner" \
  -e APP_VERSION="v1" \
  cloud-katas-sample:local
```

## Endpoints

- `/`: returns message, version, path, and memory setting.
- `/healthz`: returns health status.
- `/readyz`: returns readiness status.

## Failure Modes

- `CRASH_ON_START=true`: exits during startup.
- `MEMORY_HOG_MB=128`: allocates memory at startup for resource-pressure labs.
