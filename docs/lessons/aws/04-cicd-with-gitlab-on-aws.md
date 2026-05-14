# CI/CD with GitLab on AWS

## Overview

This lesson builds a four-stage GitLab pipeline targeting AWS. The CI job authenticates to AWS using OIDC federation — no AWS access keys stored as CI variables. The build job pushes to Amazon ECR. The scan job runs Trivy. The deploy job assumes a deployment role, updates the EKS deployment via `kubectl set image`, and the environment is protected with manual approval.

The pattern mirrors the GCP version of this lesson but with AWS-native trust glue: an IAM OIDC identity provider for GitLab, an IAM role with a trust policy keyed on the GitLab `project_path` claim, and `aws sts assume-role-with-web-identity` invoked from the runner.

## Estimated Time

- 90-120 minutes

## Prerequisites

- Completed [CI/CD with GitLab](../gcp/06-cicd-with-gitlab.md) and [Amazon EKS](02-amazon-eks-elastic-kubernetes-service.md)
- An EKS cluster (from lesson 02) and an ECR repository
- A GitLab account and the ability to create a project under a known group path
- `aws` and `kubectl` authenticated locally

## Cost Notice

GitLab shared runners are free up to a monthly minute budget for most accounts. ECR storage costs cents per month for this lab. EKS continues to bill while the cluster runs.

## Learning Objectives

- Create an IAM OIDC identity provider for GitLab
- Author an IAM role with a trust policy scoped to one GitLab project
- Use `id_tokens` in `.gitlab-ci.yml` to obtain an OIDC JWT per job
- Exchange the JWT for AWS credentials via `aws sts assume-role-with-web-identity`
- Build and push to ECR from CI
- Deploy to EKS from CI against a protected environment

## Core Concepts

- OIDC federation between GitLab and AWS: GitLab issues a signed JWT per job. AWS IAM, configured with GitLab's issuer as an OIDC identity provider, exchanges that JWT for temporary AWS credentials scoped by an IAM role's trust policy.
- IAM OIDC identity provider: A one-time setup per AWS account. The provider's URL is `https://gitlab.com` and its thumbprint is computed automatically by AWS.
- Trust policy claim conditions: The role's trust policy restricts which subjects can assume it. Pin to `project_path` and `ref_type:branch` plus `ref:main` to keep the role usable only from main-branch pipelines.
- `id_tokens` in GitLab CI: Each job that declares `id_tokens.NAME.aud` gets a `NAME` environment variable with a per-job JWT signed by GitLab.
- `assume-role-with-web-identity`: The STS call that takes a web identity token plus a role ARN and returns temporary credentials.
- Protected environments: GitLab gates deploy jobs behind manual approval, restricted to protected branches. This is the human-in-the-loop control that complements the role's trust policy.

## Lab

### 1. Prepare

```bash
export AWS_PROFILE=cloud-katas
export AWS_REGION="us-east-1"
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export CLUSTER_NAME="learning-eks"
export ECR_REPO="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/cloud-katas-sample"
```

Ensure the cluster and ECR repository from lesson 02 exist.

```bash
aws eks describe-cluster --name "$CLUSTER_NAME" --query 'cluster.status'
aws ecr describe-repositories --repository-names cloud-katas-sample
```

### 2. Create the GitLab IAM OIDC Provider

```bash
aws iam create-open-id-connect-provider \
  --url https://gitlab.com \
  --client-id-list https://gitlab.com \
  --thumbprint-list b3dd7606d2b5a8b4a13771dbecc9ee1cecafa38a 2>&1 | head -5

# Use the thumbprint from gitlab.com's certificate if AWS does not accept the canned one:
# echo | openssl s_client -servername gitlab.com -showcerts -connect gitlab.com:443 2>/dev/null \
#   | openssl x509 -fingerprint -sha1 -noout
```

The provider ARN follows a predictable shape:

```bash
export PROVIDER_ARN="arn:aws:iam::$ACCOUNT_ID:oidc-provider/gitlab.com"
aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" \
  --query 'Url' --output text
```

### 3. Create the Deployment Role and Trust Policy

Replace `YOUR_GROUP/cloud-katas` with your real GitLab project path.

```bash
cat > gitlab-trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "$PROVIDER_ARN" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "gitlab.com:aud": "https://gitlab.com"
      },
      "StringLike": {
        "gitlab.com:sub": "project_path:YOUR_GROUP/cloud-katas:ref_type:branch:ref:main"
      }
    }
  }]
}
EOF

aws iam create-role \
  --role-name gitlab-ci-deploy \
  --assume-role-policy-document file://gitlab-trust.json

# Attach narrow policies for the work the pipeline does
aws iam attach-role-policy --role-name gitlab-ci-deploy \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser

aws iam attach-role-policy --role-name gitlab-ci-deploy \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy

# Give the role kubectl access via the cluster's aws-auth ConfigMap (lesson-02 cluster)
eksctl create iamidentitymapping \
  --cluster "$CLUSTER_NAME" \
  --region "$AWS_REGION" \
  --arn "arn:aws:iam::$ACCOUNT_ID:role/gitlab-ci-deploy" \
  --username gitlab-deployer \
  --group system:masters
```

> Use `system:masters` only for the sandbox. In production, bind to a custom RBAC group with narrow Role/RoleBinding permissions on the target namespace.

### 4. Configure the GitLab Project

In the GitLab UI:

- Create or open the project (under `YOUR_GROUP/cloud-katas`).
- Settings → CI/CD → Variables, add:
  - `AWS_REGION` = `us-east-1`
  - `AWS_ACCOUNT_ID` = your account ID
  - `AWS_DEPLOY_ROLE_ARN` = `arn:aws:iam::ACCOUNT_ID:role/gitlab-ci-deploy`
  - `ECR_REPOSITORY` = `cloud-katas-sample`
  - `EKS_CLUSTER` = `learning-eks`
- Protect the `main` branch and add a protected environment named `production` requiring manual approval.

### 5. Author `.gitlab-ci.yml`

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
    AWS_ID_TOKEN:
      aud: https://gitlab.com

.aws_auth: &aws_auth
  - apk add --no-cache aws-cli >/dev/null 2>&1 || true
  - echo "$AWS_ID_TOKEN" > /tmp/web-identity-token
  - >
    CREDS=$(aws sts assume-role-with-web-identity
      --role-arn "$AWS_DEPLOY_ROLE_ARN"
      --role-session-name "gitlab-${CI_PIPELINE_IID}"
      --web-identity-token "$(cat /tmp/web-identity-token)"
      --duration-seconds 1800
      --output json)
  - export AWS_ACCESS_KEY_ID=$(echo "$CREDS" | jq -r '.Credentials.AccessKeyId')
  - export AWS_SECRET_ACCESS_KEY=$(echo "$CREDS" | jq -r '.Credentials.SecretAccessKey')
  - export AWS_SESSION_TOKEN=$(echo "$CREDS" | jq -r '.Credentials.SessionToken')
  - aws sts get-caller-identity

test:
  stage: test
  image: python:3.13-alpine
  script:
    - python -m compileall app.py
    - echo "no unit tests yet"

build:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  variables:
    DOCKER_HOST: tcp://docker:2375
    DOCKER_TLS_CERTDIR: ""
  before_script:
    - apk add --no-cache aws-cli jq
    - *aws_auth
    - aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
  script:
    - docker build -t "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG" .
    - docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG"
    - echo "IMAGE=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG" > build.env
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
  image: alpine:3.19
  needs:
    - job: build
      artifacts: true
  environment:
    name: production
    deployment_tier: production
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
  before_script:
    - apk add --no-cache aws-cli jq curl
    - curl -LO https://dl.k8s.io/release/v1.30.0/bin/linux/amd64/kubectl
    - install kubectl /usr/local/bin/kubectl
    - *aws_auth
    - aws eks update-kubeconfig --name "$EKS_CLUSTER" --region "$AWS_REGION"
  script:
    - kubectl -n sample set image deployment/sample sample="$IMAGE"
    - kubectl -n sample rollout status deployment/sample --timeout=180s
```

### 6. Run the Pipeline

Commit and push to `main`.

```bash
git add .gitlab-ci.yml
git commit -m "Add AWS CI/CD pipeline"
git push origin main
```

In GitLab, watch the pipeline run. The `deploy` job pauses for approval. Approve it. After it runs, confirm:

```bash
kubectl -n sample get deployment sample \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

Then bump the version and watch a second pipeline.

```bash
git commit --allow-empty -m "Bump sample"
git push
```

## Validate

```bash
# Trust policy refers to the right project_path/branch
aws iam get-role --role-name gitlab-ci-deploy \
  --query 'Role.AssumeRolePolicyDocument.Statement[0].Condition'

# Latest pushed image is what is running
kubectl -n sample get deployment sample \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

Success means:

- No `AWS_SECRET_ACCESS_KEY` exists as a GitLab variable; credentials come from `assume-role-with-web-identity` per job.
- The trust policy scopes the role to one GitLab project and the `main` branch.
- The deploy step requires manual approval.
- The deployed image tag matches `$CI_COMMIT_SHORT_SHA`.

## Troubleshooting

- `AccessDenied: Not authorized to perform sts:AssumeRoleWithWebIdentity`: The trust policy `sub` condition does not match. Print `$CI_JOB_JWT` (carefully) and compare its `sub` claim to your `StringLike` pattern.
- `InvalidIdentityToken`: The `aud` in `id_tokens` must equal `https://gitlab.com` exactly. AWS rejects mismatched audiences.
- ECR `unauthorized`: `aws ecr get-login-password` must run *after* `assume-role-with-web-identity` exports credentials.
- kubectl `Unauthorized`: The role ARN was not added to `aws-auth`. Re-run `eksctl create iamidentitymapping`. Confirm with `kubectl describe configmap aws-auth -n kube-system`.
- Pipeline hangs at deploy: The protected environment requires approval. Approve in the GitLab UI.

## Cleanup

```bash
eksctl delete iamidentitymapping \
  --cluster "$CLUSTER_NAME" \
  --region "$AWS_REGION" \
  --arn "arn:aws:iam::$ACCOUNT_ID:role/gitlab-ci-deploy"

aws iam detach-role-policy --role-name gitlab-ci-deploy --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser
aws iam detach-role-policy --role-name gitlab-ci-deploy --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy
aws iam delete-role --role-name gitlab-ci-deploy

aws iam delete-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN"
```

## Cross-Cloud Callout

- AWS IAM OIDC provider for GitLab ↔ GCP Workload Identity Federation pool + provider: same architecture, different control plane.
- AWS `assume-role-with-web-identity` ↔ GCP `iam workload-identity-pools create-cred-config`: both produce short-lived credentials from a federated JWT.
- AWS ECR ↔ GCP Artifact Registry: managed container registries with IAM-gated access.

## Checkpoint

- Identify the single condition in the role's trust policy that prevents another GitLab project from assuming this role.
- Explain why the `aud` value matters even though it looks like a constant.
- Describe what `aws-auth` does in EKS and why a federated role still needs an entry there.
- Explain one failure mode that a static `AWS_SECRET_ACCESS_KEY` has that OIDC federation does not.

## Further Reading

- [GitLab + AWS OIDC federation](https://docs.gitlab.com/ee/ci/cloud_services/aws/)
- [AWS IAM OIDC identity providers](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_oidc.html)
- [STS AssumeRoleWithWebIdentity](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithWebIdentity.html)
- [Amazon ECR](https://docs.aws.amazon.com/AmazonECR/latest/userguide/what-is-ecr.html)
- [GitLab protected environments](https://docs.gitlab.com/ee/ci/environments/protected_environments.html)
