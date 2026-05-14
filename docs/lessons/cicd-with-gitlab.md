# CI/CD with GitLab

## Overview

This lesson creates a basic GitLab CI/CD pipeline that builds, tests, scans, and prepares a container image for deployment.

## Estimated Time

- 75 minutes

## Prerequisites

- Completed [Docker and Kubernetes Basics](docker-and-kubernetes-basics.md)
- A GitLab project
- A GitLab runner or GitLab shared runners

## Learning Objectives

- Create a `.gitlab-ci.yml` pipeline
- Understand stages, jobs, artifacts, and cache
- Prepare a container build for a cloud registry

## Core Concepts

- Pipelines are composed of stages and jobs
- Runners execute jobs
- Artifacts preserve job outputs
- Protected variables and environments reduce deployment risk

## Lab

### 1. Prepare

Create a small app repository or use an existing containerized project. Confirm that GitLab CI/CD is enabled for the project.

### 2. Add a Pipeline

Create `.gitlab-ci.yml`.

```yaml
stages:
  - test
  - build

test:
  image: node:22-alpine
  stage: test
  script:
    - npm ci
    - npm test --if-present

build-image:
  image: docker:stable
  stage: build
  services:
    - docker:dind
  script:
    - docker build -t "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA" .
```

### 3. Add Variables

Configure registry credentials and deployment variables as protected CI/CD variables when deploying to shared environments.

## Validate

- Push a branch and confirm the pipeline starts
- Confirm the test job passes
- Confirm the build job produces an image tag

## Troubleshooting

- Runner unavailable: check runner registration and project runner settings.
- Docker build fails: confirm `Dockerfile` path and Docker-in-Docker permissions.
- Secrets exposed: move hard-coded values into masked protected variables.

## Cleanup

Delete experimental branches and remove temporary CI/CD variables that are no longer needed.

## Further Reading

- [GitLab CI/CD pipelines](https://docs.gitlab.com/ee/ci/pipelines/)
- [GitLab CI/CD variables](https://docs.gitlab.com/ee/ci/variables/)
