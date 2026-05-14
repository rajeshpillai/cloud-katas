# CI/CD with GitLab on AWS

## Overview

This lesson adapts a GitLab CI/CD pipeline for AWS by building a container image, pushing it to Amazon ECR, and preparing deployment to EKS.

## Estimated Time

- 90 minutes

## Prerequisites

- Completed [CI/CD with GitLab](../gcp/06-cicd-with-gitlab.md)
- Completed [Amazon EKS](02-amazon-eks-elastic-kubernetes-service.md)
- An ECR repository and AWS credentials suitable for CI

## Learning Objectives

- Authenticate GitLab CI to AWS
- Build and push an image to ECR
- Prepare an EKS deployment job

## Core Concepts

- CI credentials should be short-lived when possible
- ECR stores container images
- Deployment jobs should target protected environments
- Pipelines should separate build, test, scan, and deploy stages

## Lab

### 1. Create ECR Repository

```bash
export AWS_REGION="us-east-1"
aws ecr create-repository --repository-name cloud-katas/web
```

### 2. Configure GitLab Variables

Add protected and masked variables for AWS access, account id, region, and ECR repository name. Prefer OIDC federation over static keys when available.

### 3. Add Build Job

```yaml
build-ecr:
  image: docker:stable
  services:
    - docker:dind
  script:
    - aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
    - docker build -t "$ECR_REPOSITORY:$CI_COMMIT_SHORT_SHA" .
    - docker tag "$ECR_REPOSITORY:$CI_COMMIT_SHORT_SHA" "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$CI_COMMIT_SHORT_SHA"
    - docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$CI_COMMIT_SHORT_SHA"
```

## Validate

```bash
aws ecr describe-images --repository-name cloud-katas/web
```

## Troubleshooting

- Login fails: verify account id, region, and ECR permissions.
- Push denied: confirm repository policy and IAM permissions.
- Deploy job fails: confirm kubeconfig generation and EKS access mappings.

## Cleanup

```bash
aws ecr delete-repository --repository-name cloud-katas/web --force
```

## Further Reading

- [Amazon ECR](https://docs.aws.amazon.com/AmazonECR/latest/userguide/what-is-ecr.html)
- [GitLab AWS deployments](https://docs.gitlab.com/ee/ci/cloud_deployment/)
