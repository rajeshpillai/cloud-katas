# Security in GCP

## Overview

This lesson practices least privilege IAM, service accounts, Secret Manager, Cloud Audit Logs, and network security controls.

## Estimated Time

- 75 minutes

## Prerequisites

- Completed [GCP Fundamentals](01-gcp-fundamentals.md)
- A GCP project where you can manage IAM and secrets

## Learning Objectives

- Identify broad IAM grants
- Create a service account for workload identity
- Store and retrieve an application secret
- Review audit activity

## Core Concepts

- Prefer predefined or custom roles over primitive Owner, Editor, and Viewer grants
- Service accounts represent workloads, not people
- Secrets should be stored in a managed secrets service
- Audit logs help answer who did what and when

## Lab

### 1. Review IAM

```bash
gcloud projects get-iam-policy "$PROJECT_ID" --format="table(bindings.role)"
```

Look for primitive roles and overly broad grants.

### 2. Create a Service Account

```bash
gcloud iam service-accounts create app-runtime --display-name="App runtime"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:app-runtime@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"
```

### 3. Store a Secret

```bash
printf "example-secret" | gcloud secrets create app-secret --data-file=-
gcloud secrets versions access latest --secret=app-secret
```

### 4. Review Audit Logs

Use Logs Explorer and filter for IAM or Secret Manager activity.

## Validate

```bash
gcloud iam service-accounts describe "app-runtime@$PROJECT_ID.iam.gserviceaccount.com"
gcloud secrets describe app-secret
```

## Troubleshooting

- IAM binding fails: confirm you have permission to administer IAM.
- Secret creation fails: enable the Secret Manager API.
- Logs are missing: confirm audit logs are enabled for the activity you expect.

## Cleanup

```bash
gcloud secrets delete app-secret
gcloud iam service-accounts delete "app-runtime@$PROJECT_ID.iam.gserviceaccount.com"
```

## Further Reading

- [IAM best practices](https://cloud.google.com/iam/docs/using-iam-securely)
- [Secret Manager](https://cloud.google.com/secret-manager/docs)
