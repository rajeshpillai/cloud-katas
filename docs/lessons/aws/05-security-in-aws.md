# Security in AWS

## Overview

This lesson practices AWS IAM review, Secrets Manager, CloudTrail, security groups, WAF, and Security Hub concepts.

## Estimated Time

- 75 minutes

## Prerequisites

- Completed [AWS Fundamentals](01-aws-fundamentals.md)
- Permission to inspect IAM, CloudTrail, and Secrets Manager

## Learning Objectives

- Review IAM identities and policies
- Store and retrieve a secret
- Inspect CloudTrail events
- Explain network and application security layers

## Core Concepts

- IAM policies should grant least privilege
- Roles are preferred for workloads
- CloudTrail records AWS API activity
- Security groups control traffic at the resource boundary

## Lab

### 1. Review Caller Identity

```bash
aws sts get-caller-identity
aws iam list-account-aliases
```

### 2. Store a Secret

```bash
aws secretsmanager create-secret \
  --name cloud-katas/app-secret \
  --secret-string "example-secret"
aws secretsmanager get-secret-value --secret-id cloud-katas/app-secret
```

### 3. Review CloudTrail

```bash
aws cloudtrail lookup-events --max-results 10
```

### 4. Inspect Security Groups

```bash
aws ec2 describe-security-groups --max-results 5
```

## Validate

- The secret exists and can be retrieved by authorized identities
- CloudTrail shows recent API activity
- Security group rules are understandable and not overly broad

## Troubleshooting

- CloudTrail has no events: confirm region and account.
- Secret access denied: check identity policy and resource policy.
- Security group too open: replace `0.0.0.0/0` with narrower ranges where possible.

## Cleanup

```bash
aws secretsmanager delete-secret \
  --secret-id cloud-katas/app-secret \
  --force-delete-without-recovery
```

## Further Reading

- [IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)
- [AWS CloudTrail](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html)
