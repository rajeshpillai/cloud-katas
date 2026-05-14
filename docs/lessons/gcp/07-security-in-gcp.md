# Security in GCP

## Overview

This lesson practices the security controls a small GCP-deployed workload should always have: tight IAM, Workload Identity for runtime access, Secret Manager with versioning, Cloud KMS with envelope encryption, audit log review, and an introduction to organization policy.

The mental model is layered. IAM controls who can do what at the API boundary. Workload Identity ensures workloads use short-lived credentials. KMS and Secret Manager protect data at rest. Audit logs make the whole system reviewable.

## Estimated Time

- 90-105 minutes

## Prerequisites

- Completed [GCP Fundamentals](01-gcp-fundamentals.md)
- Either the GKE cluster from [03-google-kubernetes-engine-gke.md](03-google-kubernetes-engine-gke.md) or a local cluster for the Workload Identity demo
- Permission to administer IAM, Secret Manager, KMS, and audit log settings in the project

## Cost Notice

KMS keys and Secret Manager secrets have small per-version monthly fees. Audit log review is free. If you do not run the GKE workload, no cluster cost applies.

## Learning Objectives

- Review and narrow IAM bindings
- Use Workload Identity to grant pod-level access without keys
- Store and retrieve secrets with version pinning
- Create a KMS key and use it to encrypt data at rest
- Read audit logs for IAM and Secret Manager activity
- Recognize when an organization policy applies and how to inspect it

## Core Concepts

- IAM bindings vs roles: A role is a set of permissions. A binding attaches a role to one or more members on a resource. Bindings are inherited down the hierarchy, so a Project Editor at the folder level is an editor of every child project.
- Predefined and custom roles: Predefined roles are curated bundles like `roles/storage.objectViewer`. Custom roles let you express exactly the permissions you need; the cost is governance.
- Workload Identity for keyless workloads: Pods (or Compute Engine VMs) exchange their token for a Google credential. This removes the entire class of leaked-key incidents.
- Secret Manager: Secrets are versioned. Versions are immutable. Code should pin a version or read `latest` knowing rotation requires deploy coordination.
- Cloud KMS and envelope encryption: KMS holds a key encryption key (KEK). Data is encrypted with a data encryption key (DEK), and the DEK is encrypted with the KEK. Buckets, secrets, and disks can be configured to use CMEK.
- Cloud Audit Logs: Three streams — Admin Activity, Data Access, System Event. Admin Activity is always on; Data Access is opt-in and noisy but invaluable for forensics.
- Organization policy: Inherited constraints from above. They restrict what can be created (allowed regions, no external IPs, no service account key creation). Lessons that fail unexpectedly with `FAILED_PRECONDITION` often hit one.

## Lab

### 1. Prepare

```bash
gcloud config configurations activate cloud-katas
export PROJECT_ID=$(gcloud config get-value project)
export REGION="us-central1"

gcloud services enable \
  iam.googleapis.com \
  secretmanager.googleapis.com \
  cloudkms.googleapis.com \
  logging.googleapis.com
```

### 2. Review IAM and Narrow a Grant

List bindings, grouped by member.

```bash
gcloud projects get-iam-policy "$PROJECT_ID" \
  --flatten="bindings[].members" \
  --format="table(bindings.members,bindings.role)" \
  | sort
```

Look for primitive roles (`roles/owner`, `roles/editor`, `roles/viewer`). For each, decide whether the principal needs that breadth. If you find a personal user with `roles/editor`, swap them to a narrower predefined role.

Example narrowing: replace Editor with read-only access to logs.

```bash
gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
  --member="user:teammate@example.com" \
  --role="roles/editor"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="user:teammate@example.com" \
  --role="roles/logging.viewer"
```

Use IAM Recommender for additional suggestions.

```bash
gcloud recommender recommendations list \
  --project="$PROJECT_ID" \
  --location=global \
  --recommender=google.iam.policy.Recommender \
  --format="table(content.overview, primaryImpact.category)"
```

### 3. Create a Workload Service Account

```bash
gcloud iam service-accounts create app-runtime \
  --display-name="App runtime"

export APP_SA="app-runtime@$PROJECT_ID.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$APP_SA" \
  --role="roles/secretmanager.secretAccessor"
```

If you completed lesson 03, the Workload Identity binding pattern looks like this:

```bash
gcloud iam service-accounts add-iam-policy-binding "$APP_SA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:$PROJECT_ID.svc.id.goog[sample/sample]"

kubectl annotate serviceaccount sample -n sample \
  iam.gke.io/gcp-service-account="$APP_SA" --overwrite
```

### 4. Create a KMS Key and Use It

Create a keyring and a key in your region.

```bash
gcloud kms keyrings create app-keyring --location="$REGION"
gcloud kms keys create app-kek \
  --keyring=app-keyring \
  --location="$REGION" \
  --purpose=encryption
```

Encrypt and decrypt a small payload to confirm permissions.

```bash
echo "shhh" > /tmp/plain.txt

gcloud kms encrypt \
  --location="$REGION" \
  --keyring=app-keyring \
  --key=app-kek \
  --plaintext-file=/tmp/plain.txt \
  --ciphertext-file=/tmp/cipher.bin

gcloud kms decrypt \
  --location="$REGION" \
  --keyring=app-keyring \
  --key=app-kek \
  --ciphertext-file=/tmp/cipher.bin \
  --plaintext-file=- ; echo
```

### 5. Create a CMEK-Encrypted Bucket

```bash
export CMEK="projects/$PROJECT_ID/locations/$REGION/keyRings/app-keyring/cryptoKeys/app-kek"

# Grant Cloud Storage's service account the right to use the key
GCS_SA="service-$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')@gs-project-accounts.iam.gserviceaccount.com"
gcloud kms keys add-iam-policy-binding app-kek \
  --location="$REGION" \
  --keyring=app-keyring \
  --member="serviceAccount:$GCS_SA" \
  --role="roles/cloudkms.cryptoKeyEncrypterDecrypter"

gcloud storage buckets create "gs://$PROJECT_ID-cmek-demo" \
  --location="$REGION" \
  --default-encryption-key="$CMEK"

gcloud storage buckets describe "gs://$PROJECT_ID-cmek-demo" --format="value(encryption.defaultKmsKeyName)"
```

### 6. Store a Secret and Pin a Version

```bash
printf "v1-secret" | gcloud secrets create app-secret \
  --replication-policy=automatic \
  --data-file=-

printf "v2-secret" | gcloud secrets versions add app-secret --data-file=-

gcloud secrets versions list app-secret
gcloud secrets versions access 1 --secret=app-secret
gcloud secrets versions access latest --secret=app-secret
```

Grant the app service account read access (already done in step 3 with `secretAccessor`). In a real workload, pin a specific version in your manifest so a rotation does not silently change behavior.

### 7. Audit Log Review

In Logs Explorer, run a query for IAM changes.

```text
protoPayload.serviceName="iam.googleapis.com"
protoPayload.methodName=("SetIamPolicy" OR "CreateServiceAccount" OR "DeleteServiceAccount")
```

And one for secret access.

```text
protoPayload.serviceName="secretmanager.googleapis.com"
protoPayload.methodName="google.cloud.secretmanager.v1.SecretManagerService.AccessSecretVersion"
```

If the secret-access query returns nothing, Data Access logs are off; enable them via Logs Router or in IAM > Audit Logs.

Save both as named queries for future incident investigation.

### 8. Inspect Organization Policy

```bash
gcloud resource-manager org-policies list --project="$PROJECT_ID"
```

Useful constraints to read about even if not present:

- `iam.disableServiceAccountKeyCreation`
- `compute.requireOsLogin`
- `gcp.resourceLocations` (where resources may live)
- `storage.publicAccessPrevention`

If a lesson elsewhere fails with `FAILED_PRECONDITION: Constraint enforced`, look here first.

## Validate

```bash
gcloud iam service-accounts describe "$APP_SA"
gcloud kms keys describe app-kek --location="$REGION" --keyring=app-keyring
gcloud storage buckets describe "gs://$PROJECT_ID-cmek-demo" --format="value(encryption.defaultKmsKeyName)"
gcloud secrets versions list app-secret
```

Success means:

- The workload service account exists with a narrow role and no JSON key.
- The KMS key encrypts and decrypts a payload.
- The bucket is encrypted with the customer-managed key.
- The secret has multiple versions and access logs are queryable.

## Troubleshooting

- `secretmanager.secrets.access` denied: The binding is on a different resource. Re-check whether you granted at project, secret, or version scope.
- KMS bucket creation fails: The Cloud Storage service account does not yet have `cloudkms.cryptoKeyEncrypterDecrypter` on the key. Re-run the grant in step 5.
- Data Access logs missing: They are off by default. Enable for Secret Manager via IAM > Audit Logs, then wait a few minutes.
- Workload Identity token exchange fails: KSA annotation references the wrong GSA, or the IAM binding uses the wrong namespace. Match exactly: `[NAMESPACE/KSA_NAME]`.
- `org-policies list` returns nothing: The project has no inherited or set policies. That is fine for a sandbox; production projects typically inherit several.

## Cleanup

```bash
gcloud storage rm --recursive "gs://$PROJECT_ID-cmek-demo" --quiet
gcloud secrets delete app-secret --quiet
gcloud kms keys versions destroy 1 --key=app-kek --keyring=app-keyring --location="$REGION" --quiet || true
gcloud iam service-accounts delete "$APP_SA" --quiet
```

KMS keys themselves cannot be deleted; you destroy key versions. The empty key has no cost.

## Checkpoint

- Explain why Workload Identity is preferred over the older "service account key file" pattern.
- Describe the difference between Data Access logs and Admin Activity logs and why one is opt-in.
- Identify the IAM binding scope (project, folder, organization) that is hardest to undo accidentally.
- Explain what envelope encryption protects against that single-key encryption does not.

## Further Reading

- [IAM best practices](https://cloud.google.com/iam/docs/using-iam-securely)
- [Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
- [Secret Manager](https://cloud.google.com/secret-manager/docs)
- [Cloud KMS concepts](https://cloud.google.com/kms/docs/concept-topics)
- [Cloud Audit Logs](https://cloud.google.com/logging/docs/audit)
- [Organization policy constraints](https://cloud.google.com/resource-manager/docs/organization-policy/org-policy-constraints)
