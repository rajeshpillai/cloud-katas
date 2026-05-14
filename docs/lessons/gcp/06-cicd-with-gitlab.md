# CI/CD with GitLab

## Overview

This lesson builds a four-stage GitLab pipeline for the sample app: test, build-and-push, scan, deploy. The pipeline authenticates to GCP using OIDC federation — no long-lived service account keys checked into CI variables. The build job pushes to Artifact Registry, and the deploy job updates the GKE deployment via `kubectl set image` against a protected environment.

The recurring theme: production access in CI should come from short-lived tokens granted by trust, not from a static key sitting in a CI variable.

## Estimated Time

- 90-120 minutes

## Prerequisites

- Completed [Docker and Kubernetes Basics](02-docker-and-kubernetes-basics.md) and [Google Kubernetes Engine (GKE)](03-google-kubernetes-engine-gke.md)
- A GitLab account with permission to create a project and CI/CD variables
- GKE cluster from lesson 03 still running, or a fresh one
- An Artifact Registry repository (created in lesson 03)
- `gcloud` and `kubectl` authenticated locally

## Cost Notice

GitLab shared runners are free up to a monthly minute budget for most accounts. Artifact Registry storage and GKE compute continue to bill while the cluster runs.

## Learning Objectives

- Write a `.gitlab-ci.yml` with stages, dependencies, and artifacts
- Authenticate from GitLab to GCP using Workload Identity Federation (OIDC), no JSON keys
- Build and push a container image to Artifact Registry from CI
- Add a basic vulnerability scan stage
- Deploy to GKE from CI against a protected environment

## Core Concepts

- Stages and jobs: A pipeline is a DAG of jobs grouped into stages. Jobs in one stage run in parallel; the next stage starts only when all jobs in the previous stage pass.
- Artifacts and cache: Artifacts are job outputs that downstream jobs consume. Cache is opportunistic disk reuse across pipelines (`node_modules`, `~/.gradle`, etc.).
- OIDC federation: GitLab CI issues a signed JWT for each job. GCP can be configured to trust GitLab's issuer and grant a service account token in exchange, scoped by `sub` claim. No secret material lives in GitLab.
- Protected environments and variables: Variables marked protected are only available on protected branches. Environments record where each job deploys and can require manual approval.
- Image promotion: Images move forward through registries or tags, never recompiled. The deploy job pins a digest, not a moving `latest` tag.
- Pipeline observability: Even a passing pipeline can hide flaky steps. Always print the things you care about, especially the image tag being deployed.

## Lab

### 1. Prepare

```bash
gcloud config configurations activate cloud-katas
export PROJECT_ID=$(gcloud config get-value project)
export PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
export REGION="us-central1"
export REPO="cloud-katas"
export CLUSTER_NAME="learning-gke"
```

Confirm the Artifact Registry repository and GKE cluster exist (from lesson 03). If not, recreate them.

### 2. Set Up Workload Identity Federation for GitLab

Create a workload identity pool and a GitLab OIDC provider.

```bash
gcloud iam workload-identity-pools create gitlab-pool \
  --location=global \
  --display-name="GitLab Pool"

gcloud iam workload-identity-pools providers create-oidc gitlab \
  --location=global \
  --workload-identity-pool=gitlab-pool \
  --issuer-uri="https://gitlab.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.project_path=assertion.project_path,attribute.ref=assertion.ref,attribute.ref_type=assertion.ref_type" \
  --attribute-condition="assertion.project_path=='YOUR_GROUP/cloud-katas'"
```

Create a service account for CI and grant it the roles it needs.

```bash
gcloud iam service-accounts create gitlab-ci \
  --display-name="GitLab CI deployer"

export CI_SA="gitlab-ci@$PROJECT_ID.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$CI_SA" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$CI_SA" \
  --role="roles/container.developer"
```

Allow the GitLab project to impersonate the service account.

```bash
gcloud iam service-accounts add-iam-policy-binding "$CI_SA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/gitlab-pool/attribute.project_path/YOUR_GROUP/cloud-katas"
```

Record these values for the pipeline:

- `WIF_PROVIDER`: `projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/gitlab-pool/providers/gitlab`
- `WIF_SERVICE_ACCOUNT`: `$CI_SA`

### 3. Configure the GitLab Project

In the GitLab UI:

- Create a project (the sample app from lesson 02 is a good starting point).
- Add CI/CD variables under Settings > CI/CD > Variables:
  - `WIF_PROVIDER` (the full resource name above) — masked, not protected
  - `WIF_SERVICE_ACCOUNT` (the service account email) — masked, not protected
  - `GCP_PROJECT_ID` — `$PROJECT_ID`
  - `GAR_REPOSITORY` — `$REGION-docker.pkg.dev/$PROJECT_ID/$REPO`
  - `GKE_CLUSTER` — `$CLUSTER_NAME`
  - `GKE_REGION` — `$REGION`
- Mark the `main` branch as protected (Settings > Repository > Protected branches).
- Add an environment called `production` (Operate > Environments) and mark it protected, requiring approval to deploy.

### 4. Author the Pipeline

Create `.gitlab-ci.yml` at the repository root.

```yaml
stages:
  - test
  - build
  - scan
  - deploy

variables:
  IMAGE_TAG: $CI_COMMIT_SHORT_SHA

default:
  id_tokens:
    GCP_ID_TOKEN:
      aud: https://iam.googleapis.com/$WIF_PROVIDER

.gcloud_auth: &gcloud_auth
  - |
    echo "$GCP_ID_TOKEN" > /tmp/oidc.token
    gcloud iam workload-identity-pools create-cred-config "$WIF_PROVIDER" \
      --service-account="$WIF_SERVICE_ACCOUNT" \
      --output-file=/tmp/credentials.json \
      --credential-source-file=/tmp/oidc.token
    export GOOGLE_APPLICATION_CREDENTIALS=/tmp/credentials.json
    gcloud auth login --cred-file=/tmp/credentials.json

test:
  stage: test
  image: python:3.13-alpine
  script:
    - python -m compileall app.py
    - echo "no unit tests yet, exiting clean"

build:
  stage: build
  image: google/cloud-sdk:alpine
  services:
    - docker:dind
  variables:
    DOCKER_HOST: tcp://docker:2375
    DOCKER_TLS_CERTDIR: ""
  before_script:
    - apk add --no-cache docker-cli
    - *gcloud_auth
    - gcloud auth configure-docker "$GKE_REGION-docker.pkg.dev" --quiet
  script:
    - docker build -t "$GAR_REPOSITORY/sample:$IMAGE_TAG" .
    - docker push "$GAR_REPOSITORY/sample:$IMAGE_TAG"
    - echo "IMAGE=$GAR_REPOSITORY/sample:$IMAGE_TAG" > build.env
  artifacts:
    reports:
      dotenv: build.env

scan:
  stage: scan
  image: aquasec/trivy:latest
  needs:
    - job: build
      artifacts: true
  script:
    - trivy image --exit-code 0 --severity HIGH,CRITICAL "$IMAGE"
  allow_failure: true

deploy:
  stage: deploy
  image: google/cloud-sdk:alpine
  needs:
    - job: build
      artifacts: true
  environment:
    name: production
    deployment_tier: production
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
  before_script:
    - apk add --no-cache kubectl
    - *gcloud_auth
    - gcloud container clusters get-credentials "$GKE_CLUSTER" --region "$GKE_REGION"
  script:
    - kubectl -n sample set image deployment/sample sample="$IMAGE"
    - kubectl -n sample rollout status deployment/sample --timeout=180s
```

### 5. Run the Pipeline

Commit `.gitlab-ci.yml` and push to `main`.

```bash
git add .gitlab-ci.yml
git commit -m "Add CI/CD pipeline"
git push origin main
```

Watch the pipeline in GitLab. The `deploy` job should pause for approval (because the environment is protected). Approve it. After it runs, verify the new image is deployed.

```bash
kubectl -n sample get deployment sample \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

### 6. Make a Deployment Change

Bump the sample app version, push, and watch the full pipeline run end-to-end.

```bash
# Edit app.py or version in your build args
git add .
git commit -m "Bump sample to v2"
git push origin main
```

## Validate

```bash
# In CI logs: `gcloud auth list` should print the federated service account
# In the cluster:
kubectl -n sample rollout status deployment/sample
kubectl -n sample get deployment sample \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

Success means:

- Pipeline ran without any GCP_SERVICE_ACCOUNT_KEY-style secret in GitLab variables.
- The image tag deployed matches `$CI_COMMIT_SHORT_SHA`.
- The deploy job required manual approval in the protected environment.
- The scan job produced a Trivy report and did not block the pipeline.

## Troubleshooting

- `iam.workloadIdentityUser` denied: The `attribute.project_path` in the binding must exactly match `YOUR_GROUP/cloud-katas`. GitLab uses lowercase paths.
- `oidc: token validation failed`: The `aud` in `id_tokens` must equal `https://iam.googleapis.com/$WIF_PROVIDER` exactly, including the URL.
- Docker push fails with `unauthorized`: `gcloud auth configure-docker` was run before the federated credential was set as `GOOGLE_APPLICATION_CREDENTIALS`.
- `kubectl` returns `Unauthorized`: The GKE plugin needs federated creds too. Re-run `gcloud container clusters get-credentials` after federation, before any kubectl call.
- Trivy times out: Image pull from Artifact Registry inside the runner may need `gcloud auth configure-docker`. Pull the image explicitly before scanning.

## Cleanup

```bash
gcloud iam service-accounts delete "$CI_SA" --quiet
gcloud iam workload-identity-pools providers delete gitlab \
  --location=global --workload-identity-pool=gitlab-pool --quiet
gcloud iam workload-identity-pools delete gitlab-pool --location=global --quiet
```

Delete the GitLab project if you do not plan to reuse it.

## Checkpoint

- Explain what GitLab gives to GCP when a job runs, and what GCP returns in exchange.
- Identify the configuration field that scopes the federation to one GitLab project.
- Describe one failure mode that a long-lived service account key has that OIDC federation does not.
- Explain why the build job pins a tag derived from the commit SHA instead of `latest`.

## Further Reading

- [GitLab CI/CD pipelines](https://docs.gitlab.com/ee/ci/pipelines/)
- [GitLab OIDC + GCP federation](https://docs.gitlab.com/ee/ci/cloud_services/google_cloud/)
- [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)
- [Artifact Registry](https://cloud.google.com/artifact-registry/docs)
- [GitLab protected environments](https://docs.gitlab.com/ee/ci/environments/protected_environments.html)
