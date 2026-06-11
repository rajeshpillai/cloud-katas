# Security in AWS

## Overview

This lesson practices the security controls a small AWS-deployed workload should always have: IAM review with Access Analyzer, IRSA for keyless workload access, KMS keys, Secrets Manager with versioning, S3 Block Public Access, CloudTrail review, and a concept-level introduction to GuardDuty and Security Hub.

The model mirrors GCP's: IAM at the API boundary, IRSA (or Pod Identity) for runtime, KMS for data at rest, audit logs for everything. The components have different names but the layered approach is the same.

## Estimated Time

- 90-105 minutes

## Prerequisites

- Completed [AWS Fundamentals](01-aws-fundamentals.md)
- Either the EKS cluster from [02-amazon-eks-elastic-kubernetes-service.md](02-amazon-eks-elastic-kubernetes-service.md) or a willingness to skip the IRSA cross-reference
- Permission to inspect IAM, CloudTrail, Secrets Manager, and KMS in the account

## Cost Notice

KMS keys cost $1/month per key plus per-request fees. Secrets Manager charges $0.40/month per secret plus per-API fees. GuardDuty has a 30-day free trial. The total for the lab is under $5 if cleaned up promptly.

## Learning Objectives

- Review IAM identities and policies, including IAM Access Analyzer findings
- Wire IRSA so an EKS pod gets temporary credentials without keys
- Create a KMS customer-managed key and encrypt a secret + an S3 bucket with it
- Store and version-pin a secret in Secrets Manager
- Verify that S3 Block Public Access is enforced
- Query CloudTrail for IAM, KMS, and Secrets Manager activity
- Recognize what GuardDuty and Security Hub do at the concept level

## Core Concepts

- IAM policies and policy boundaries: Identity policies attach to users, groups, and roles. Resource policies attach to resources (S3, KMS, Secrets Manager). Effective permission is the intersection of allowed actions, minus any explicit deny.
- IAM Access Analyzer: A service that scans resource policies for unintended external access. Free, opt-in per region. Findings highlight S3 buckets, IAM roles, KMS keys, and other resources reachable from outside the trust zone.
- IRSA (cross-link to lesson 02): The runtime keyless access mechanism for EKS workloads. Production AWS Kubernetes traffic should authenticate via IRSA or EKS Pod Identity, never via shared keys in env vars.
- KMS keys: Customer-managed keys (CMKs) are explicit, rotatable, and have IAM-style key policies. AWS-managed keys are convenient but cannot be audited as deeply.
- Secrets Manager versions: Each `PutSecretValue` creates a new `VersionId`. Versions are tagged with stages (`AWSCURRENT`, `AWSPREVIOUS`). Production code should reference a stage, not `latest`.
- S3 Block Public Access: A bucket-level (and account-level) override. With all four settings on, no policy, ACL, or future misconfiguration can make objects public.
- CloudTrail: The AWS audit log of API calls. Management events are on by default; data events (S3 object reads, Lambda invokes) are opt-in. Forensics-grade investigations always need both.
- GuardDuty and Security Hub: GuardDuty is anomaly detection on VPC flow logs, DNS, and CloudTrail. Security Hub aggregates findings across GuardDuty, Access Analyzer, Inspector, and Macie, plus a benchmark library (CIS, PCI).

## Lab

> ### Run locally with floci
>
> **Partly local.** The [floci](https://github.com/floci-io/floci) AWS emulator covers KMS, Secrets Manager, IAM, and S3 Block Public Access.
>
> ```bash
> ./labs/lab.sh up        # starts the floci emulator
> source labs/env.sh      # exports AWS_ENDPOINT_URL + fake creds
> ```
>
> With the env sourced, **skip the `AWS_PROFILE` line** and run the KMS CMK, Secrets Manager versioning, IAM, and S3 Block Public Access commands unchanged.
>
> **Not emulated locally:** CloudTrail, IAM Access Analyzer, GuardDuty, and Security Hub are partial or simulate-only.

### 1. Prepare

```bash
export AWS_PROFILE=cloud-katas
export AWS_REGION="us-east-1"
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

### 2. Review Caller Identity and IAM

```bash
aws sts get-caller-identity
aws iam list-users --max-items 10
aws iam list-roles --query 'Roles[?contains(RoleName,`learning`)||contains(RoleName,`sample`)]'
aws iam get-account-summary
```

Look at one of your own roles:

```bash
aws iam get-role --role-name SOMETHING
aws iam list-role-policies --role-name SOMETHING
aws iam list-attached-role-policies --role-name SOMETHING
```

Run Access Analyzer in your region.

```bash
aws accessanalyzer list-analyzers
# If none exist, create one (free):
aws accessanalyzer create-analyzer --analyzer-name cloud-katas --type ACCOUNT
aws accessanalyzer list-findings --analyzer-arn "$(aws accessanalyzer list-analyzers --query 'analyzers[0].arn' --output text)"
```

Read any HIGH findings. The most common in a fresh account: an EBS snapshot or AMI shared with another account.

### 3. Apply IRSA to the Sample Workload

If the EKS cluster from lesson 02 is still running, the IRSA wiring is already in place. Verify it.

```bash
kubectl -n sample get sa sample -o jsonpath='{.metadata.annotations.eks\.amazonaws\.com/role-arn}{"\n"}'
aws iam get-role --role-name sample-irsa --query 'Role.AssumeRolePolicyDocument'
```

The trust policy's `Condition.StringEquals` should reference the cluster's OIDC issuer and `sub` `system:serviceaccount:sample:sample`. If this is missing, return to lesson 02, section 5.

### 4. Create a KMS Customer-Managed Key

```bash
aws kms create-key \
  --description "cloud-katas application key" \
  --tags TagKey=Project,TagValue=cloud-katas \
  --query 'KeyMetadata.{Id:KeyId,Arn:Arn}'

export KEY_ID=$(aws kms list-keys --query 'Keys[-1].KeyId' --output text)

aws kms create-alias \
  --alias-name alias/cloud-katas-app \
  --target-key-id "$KEY_ID"
```

Test encrypt/decrypt round trip.

```bash
echo "shhh" | aws kms encrypt \
  --key-id alias/cloud-katas-app \
  --plaintext fileb:///dev/stdin \
  --query CiphertextBlob --output text \
  | base64 -d > /tmp/cipher.bin

aws kms decrypt \
  --ciphertext-blob fileb:///tmp/cipher.bin \
  --key-id alias/cloud-katas-app \
  --query Plaintext --output text | base64 -d ; echo
```

### 5. Store a Secret With KMS Encryption

```bash
aws secretsmanager create-secret \
  --name cloud-katas/app-secret \
  --description "Sample application secret" \
  --kms-key-id alias/cloud-katas-app \
  --secret-string '{"api_token":"v1-not-real"}'

# Rotate the value, creating a new version
aws secretsmanager put-secret-value \
  --secret-id cloud-katas/app-secret \
  --secret-string '{"api_token":"v2-not-real"}'

aws secretsmanager describe-secret --secret-id cloud-katas/app-secret \
  --query 'VersionIdsToStages'

# Reads
aws secretsmanager get-secret-value --secret-id cloud-katas/app-secret --version-stage AWSCURRENT --query SecretString --output text
aws secretsmanager get-secret-value --secret-id cloud-katas/app-secret --version-stage AWSPREVIOUS --query SecretString --output text
```

### 6. Create a CMEK-Encrypted Bucket With Public Access Blocked

```bash
export DEMO_BUCKET="cloud-katas-cmek-$ACCOUNT_ID-$(date +%s)"

aws s3api create-bucket \
  --bucket "$DEMO_BUCKET" \
  --region "$AWS_REGION" \
  $( [ "$AWS_REGION" != "us-east-1" ] && echo "--create-bucket-configuration LocationConstraint=$AWS_REGION" )

aws s3api put-public-access-block \
  --bucket "$DEMO_BUCKET" \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

aws s3api put-bucket-encryption \
  --bucket "$DEMO_BUCKET" \
  --server-side-encryption-configuration \
    "{\"Rules\":[{\"ApplyServerSideEncryptionByDefault\":{\"SSEAlgorithm\":\"aws:kms\",\"KMSMasterKeyID\":\"alias/cloud-katas-app\"}}]}"

aws s3api get-bucket-encryption --bucket "$DEMO_BUCKET"
aws s3api get-public-access-block --bucket "$DEMO_BUCKET"
```

Verify a public-grant attempt is rejected.

```bash
aws s3api put-bucket-acl --bucket "$DEMO_BUCKET" --acl public-read 2>&1 | head -5
```

The command should fail with `AccessDenied` because of the Block Public Access setting.

### 7. CloudTrail Review

```bash
aws cloudtrail describe-trails
aws cloudtrail get-event-selectors --trail-name TRAIL_NAME
```

Use Athena or the CloudTrail console to search recent events. CLI lookup (last 50):

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventSource,AttributeValue=iam.amazonaws.com \
  --max-results 50 --query 'Events[].{Time:EventTime,Name:EventName,User:Username}'
```

Look for unexpected `CreateAccessKey`, `AttachUserPolicy`, or `PutBucketPolicy` events.

Data events on KMS:

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventSource,AttributeValue=kms.amazonaws.com \
  --max-results 10
```

If the KMS query returns nothing, KMS data events are not configured on the trail. Most production trails enable them.

### 8. GuardDuty and Security Hub (Concept)

Enable GuardDuty in this region (it has a free trial; remember to disable in cleanup if you would otherwise be charged):

```bash
aws guardduty create-detector --enable
aws guardduty list-detectors
```

It begins analyzing CloudTrail, VPC flow logs, and DNS logs immediately. Findings appear in the GuardDuty console.

Security Hub aggregates findings across services.

```bash
aws securityhub enable-security-hub
aws securityhub get-findings --max-results 5 --query 'Findings[].{Title:Title,Severity:Severity.Label}'
```

Look at one finding's details to understand the standard fields (resource, severity, compliance status).

## Validate

```bash
aws iam get-account-summary
aws kms describe-key --key-id alias/cloud-katas-app --query 'KeyMetadata.{Id:KeyId,State:KeyState,Rot:KeyRotationStatus}'
aws kms get-key-rotation-status --key-id alias/cloud-katas-app
aws secretsmanager describe-secret --secret-id cloud-katas/app-secret --query 'KmsKeyId'
aws s3api get-bucket-encryption --bucket "$DEMO_BUCKET" --query 'ServerSideEncryptionConfiguration.Rules[0]'
aws accessanalyzer list-analyzers
```

Success means:

- A customer-managed KMS key exists with a friendly alias.
- The bucket and the secret are both encrypted with it.
- S3 Block Public Access is enforced — a public ACL attempt is rejected.
- The IRSA role for `sample/sample` is intact (if the EKS cluster is running).
- Access Analyzer is active and findings (if any) are triaged.

## Troubleshooting

- `MalformedPolicyDocument` on KMS key policy: KMS key policies require an explicit allow for the root user; do not over-restrict yourself out of your own key.
- `kms:Decrypt` denied from the sample pod: The IRSA role does not have `kms:Decrypt` on the key. Add `arn:aws:kms:REGION:ACCOUNT:key/KEY_ID` to a role policy.
- `InvalidParameterValueException: KMS key not found`: Always use the key ARN or alias prefix; bare key IDs sometimes fail across services.
- Block Public Access does not block a policy: Check the *account-level* `s3:PutAccountPublicAccessBlock` is set. Bucket-level settings can be overridden by account-level being permissive.
- CloudTrail returns no recent events: Most trails have a 5-15 minute ingestion delay. Wait, do not assume nothing happened.

## Cleanup

```bash
aws secretsmanager delete-secret --secret-id cloud-katas/app-secret --force-delete-without-recovery

aws s3 rm "s3://$DEMO_BUCKET" --recursive
aws s3api delete-bucket --bucket "$DEMO_BUCKET"

aws kms delete-alias --alias-name alias/cloud-katas-app
aws kms schedule-key-deletion --key-id "$KEY_ID" --pending-window-in-days 7

# Disable GuardDuty if you do not plan to keep the trial running
DETECTOR_ID=$(aws guardduty list-detectors --query 'DetectorIds[0]' --output text)
aws guardduty delete-detector --detector-id "$DETECTOR_ID"

aws securityhub disable-security-hub
aws accessanalyzer delete-analyzer --analyzer-name cloud-katas
```

KMS keys cannot be deleted immediately; they enter a 7-30 day pending-deletion window.

## Cross-Cloud Callout

- AWS IAM ↔ GCP IAM: bindings differ in shape; AWS uses identity-based + resource-based policies with explicit deny; GCP has IAM Conditions and a single binding model.
- IRSA ↔ GKE Workload Identity: both make pods trustable to the cloud IAM system without keys.
- AWS KMS ↔ GCP Cloud KMS: same envelope-encryption pattern. AWS keys have a built-in rotation toggle (`get-key-rotation-status`); GCP has explicit primary versions.
- AWS Secrets Manager ↔ GCP Secret Manager: nearly identical UX.
- AWS CloudTrail ↔ GCP Cloud Audit Logs: same three streams (admin, data, system).
- AWS GuardDuty + Security Hub ↔ GCP Security Command Center: detection + aggregation.

## Checkpoint

- Explain what an explicit `Deny` in an IAM policy does that a missing `Allow` does not.
- Describe what Access Analyzer can find that a developer reading a policy by hand will miss.
- Identify the field on a Secrets Manager secret that pins a specific version safely.
- Explain why S3 Block Public Access exists separately from bucket and object ACLs.

## Further Reading

- [IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [IAM Access Analyzer](https://docs.aws.amazon.com/IAM/latest/UserGuide/what-is-access-analyzer.html)
- [AWS KMS](https://docs.aws.amazon.com/kms/latest/developerguide/overview.html)
- [Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)
- [S3 Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)
- [CloudTrail](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html)
- [GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html)
