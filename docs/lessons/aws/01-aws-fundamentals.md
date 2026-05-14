# AWS Fundamentals

## Overview

This lesson introduces AWS accounts, IAM, billing controls, regions, Availability Zones, and basic console navigation.

## Estimated Time

- 60 minutes

## Prerequisites

- An AWS account or access to a sandbox account
- AWS CLI installed for command-line validation

## Learning Objectives

- Explain accounts, organizations, regions, and Availability Zones
- Configure CLI access safely
- Set billing alerts and review core services

## Core Concepts

- Accounts are strong isolation boundaries
- IAM controls identities, permissions, and access policies
- Regions contain multiple Availability Zones
- Budgets and alerts are required guardrails for learning accounts

## Lab

### 1. Prepare

Configure the AWS CLI with a least-privilege user, role, or federated identity.

```bash
aws --version
aws sts get-caller-identity
```

### 2. Choose a Region

```bash
export AWS_REGION="us-east-1"
aws configure set region "$AWS_REGION"
aws ec2 describe-availability-zones --region "$AWS_REGION"
```

### 3. Add Cost Controls

In the AWS Console, open Billing and Cost Management. Create a budget for the learning account and configure email alerts.

## Validate

```bash
aws sts get-caller-identity
aws service-quotas list-services --max-results 5
```

Success means your CLI identity works and you can inspect account-level information.

## Troubleshooting

- Access denied: confirm the active identity and attached policies.
- Wrong account: check `aws sts get-caller-identity` before creating resources.
- Billing page unavailable: ask for billing console access or use an administrator account.

## Cleanup

No AWS resources are required for this lesson. Remove temporary CLI profiles that are no longer needed.

## Further Reading

- [AWS account management](https://docs.aws.amazon.com/accounts/latest/reference/accounts-welcome.html)
- [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html)
