# AWS Fundamentals

## Overview

This lesson sets up the operating base for the AWS sequence. You will configure the AWS CLI with named profiles, learn the difference between IAM users and IAM Identity Center (formerly SSO), inspect your effective identity, learn how Organizations + OUs + SCPs constrain accounts from above, place budget guardrails, and confirm regional context before any later lab creates resources.

The habit goal mirrors the GCP fundamentals lesson: know which account you are in, who you are inside it, what the boundary looks like above the account, and what can cost money.

## Estimated Time

- 75-90 minutes

## Prerequisites

- An AWS account (a sandbox or training account is fine; do not use an account that runs real workloads)
- A user identity with rights to view IAM, billing, and Organizations
- AWS CLI v2 installed (`aws --version` shows 2.x)
- A web browser for the console steps

## Cost Notice

This lesson creates no billable infrastructure. Budgets are free; IAM and Organizations queries are free. Costs appear later only when other lessons launch compute, storage, or networking.

## Learning Objectives

- Configure AWS CLI named profiles, both classic access-key style and IAM Identity Center
- Identify which AWS account, region, and identity is active before each command
- Explain accounts as isolation boundaries and Organizations + OUs + SCPs as constraints above the account
- Distinguish IAM users from IAM Identity Center (federated) users
- Set billing alerts and a budget on the account
- Use CloudShell as an in-browser fallback when the local CLI is misconfigured

## Core Concepts

- AWS account as boundary: An AWS account is the strongest isolation boundary in AWS. IAM, resource quotas, billing, and most APIs are scoped to the account. Real organizations use many accounts and join them with Organizations.
- Organizations, OUs, SCPs: An AWS Organization groups accounts into Organizational Units (OUs). Service Control Policies (SCPs) attach to an OU or root and define the *maximum* permissions any identity inside those accounts can have. Even an Administrator cannot exceed an SCP.
- IAM users vs IAM Identity Center: IAM users are long-lived identities inside one account with optional access keys. IAM Identity Center is the recommended model — a directory of human users that gets temporary credentials for any account they have access to. Prefer Identity Center for humans; use IAM roles (no users) for workloads.
- Regions and Availability Zones: A region is a geographic location with multiple AZs (typically 3). AZs are physically isolated data center clusters with low-latency intra-region networking. Cross-region traffic is metered.
- AWS CLI profiles: A profile is a named set of credentials + region + output preferences in `~/.aws/credentials` and `~/.aws/config`. Profiles let you switch contexts without rewriting environment variables.
- Budgets and alerts: A budget tracks actual or forecasted spend and emails when thresholds are crossed. It does not stop usage. Sandbox accounts should always have one.
- CloudShell: A browser-based shell launched from the console with your console identity already exported. Useful when local tooling is broken or when you do not have permission to install software.

## Lab

### 1. Inspect Your Local CLI

```bash
aws --version
aws configure list
aws configure list-profiles
```

If `list-profiles` is empty, configure one. Pick the model that matches your AWS setup.

Option A: IAM Identity Center (preferred for humans).

```bash
aws configure sso
# Follow prompts. Suggested profile name: cloud-katas
aws sso login --profile cloud-katas
```

Option B: classic access key (only if Identity Center is not available).

```bash
aws configure --profile cloud-katas
# Provide access key, secret, region (e.g. us-east-1), and output (json)
```

### 2. Confirm Your Identity, Account, and Region

```bash
export AWS_PROFILE=cloud-katas
export AWS_REGION="us-east-1"

aws sts get-caller-identity
aws configure get region
aws iam list-account-aliases || true
aws ec2 describe-availability-zones --query 'AvailabilityZones[].ZoneName'
```

`get-caller-identity` is the single most important context-check command in AWS. Run it before any destructive operation. The output shows:

- `Account`: numeric account id.
- `UserId`: principal id (cryptic for federated identities).
- `Arn`: the human-readable identity ARN, including role name for assumed roles.

### 3. Inspect IAM at the Account Level

```bash
aws iam list-users --max-items 10
aws iam list-roles --max-items 10
aws iam get-account-summary
```

Look for:

- Unused users with active access keys.
- Roles with `Action: "*"` and `Resource: "*"` in their trust or permission policies.
- Whether MFA is enforced on root.

For details on a specific user or role:

```bash
aws iam list-attached-user-policies --user-name USER_NAME
aws iam list-role-policies --role-name ROLE_NAME
aws iam get-role --role-name ROLE_NAME
```

### 4. Look Up From the Account (Organizations + SCPs)

If your account is part of an organization and you have read access:

```bash
aws organizations describe-organization || echo "not in an org or no access"
aws organizations list-roots
aws organizations list-organizational-units-for-parent --parent-id ROOT_ID
aws organizations list-accounts
aws organizations list-policies --filter SERVICE_CONTROL_POLICY
```

If a later lesson hits `AccessDenied` despite IAM looking permissive, an SCP is the likely cause. SCPs are evaluated *and* IAM is evaluated; the effective permission is the intersection.

If you do not have organizations access, run the listings inside CloudShell from the management account, or skip and note that the boundary exists.

### 5. Set Cost Controls

In the console, open Billing and Cost Management.

- Enable IAM access to Billing (root user → Account → IAM user and role access to Billing information).
- Create a Budget under Budgets:
  - Type: Cost budget.
  - Amount: a low monthly amount appropriate for sandbox.
  - Alerts at 50%, 80%, 100% actual; 100% forecasted.
  - Email notifications to yourself.
- Enable CloudWatch billing alarms (Region: `us-east-1` — billing metrics live there only).

CLI verification:

```bash
aws budgets describe-budgets --account-id "$(aws sts get-caller-identity --query Account --output text)" || true
```

### 6. Try CloudShell

In the AWS console, click the CloudShell icon (top right). A terminal opens with your console identity already exported.

```bash
aws sts get-caller-identity
aws s3 ls
```

CloudShell is the fastest way to recover when local credentials are broken or when you do not have install rights on a machine.

### 7. Add a Second Named Profile

Many real workflows touch multiple accounts. Add a second profile to practice switching.

```bash
aws configure --profile cloud-katas-check
# Same identity for now; just to demonstrate switching
aws sts get-caller-identity --profile cloud-katas
aws sts get-caller-identity --profile cloud-katas-check
```

To avoid forgetting which profile is active, add a tiny shell function to your `.bashrc` or `.zshrc`:

```bash
awswhoami() {
  aws sts get-caller-identity --query 'Arn' --output text
  echo "region: $(aws configure get region)"
  echo "profile: ${AWS_PROFILE:-default}"
}
```

## Validate

```bash
aws sts get-caller-identity
aws configure get region
aws configure list-profiles
aws ec2 describe-availability-zones --query 'AvailabilityZones[0:3].ZoneName'
aws budgets describe-budgets --account-id "$(aws sts get-caller-identity --query Account --output text)" --max-results 5 2>/dev/null
```

Success means:

- `cloud-katas` is the active profile.
- A region is set and matches your intent.
- The account has at least one budget alert.
- You can identify whether your account is in an Organization, and if so, whether SCPs apply.

## Troubleshooting

- `Unable to locate credentials`: Profile is set in `~/.aws/config` but not `~/.aws/credentials`. Run `aws configure --profile cloud-katas` again, or `aws sso login --profile cloud-katas` for Identity Center.
- `ExpiredToken`: SSO sessions expire. `aws sso login --profile cloud-katas` to refresh.
- `AccessDenied` on `describe-organization`: You are not in the management account, or your role does not have `organizations:DescribeOrganization`. Skip and continue.
- Budgets do not appear in CLI: They take a few minutes to propagate after creation. The console shows them immediately.
- Wrong account suddenly: A second profile shadowed the first via `AWS_PROFILE` env var. `echo $AWS_PROFILE` and `unset AWS_PROFILE` to recover.

## Cleanup

No infrastructure was created. Optionally remove a second test profile:

```bash
aws configure --profile cloud-katas-check
# Press Enter through prompts and clear values, or edit ~/.aws/config + ~/.aws/credentials directly
```

## Cross-Cloud Callout

- AWS account ↔ GCP project: similar isolation boundary; both isolate billing, IAM, and most APIs.
- AWS Organizations + OUs + SCPs ↔ GCP organizations + folders + Org Policies: the structural pattern is similar; the policy language and binding model differ.
- AWS IAM Identity Center ↔ GCP Cloud Identity / federated workforce: both provide federated short-lived credentials.
- AWS CloudShell ↔ GCP Cloud Shell: both are browser-based shells with auto-exported credentials.

## Checkpoint

- Explain why `aws sts get-caller-identity` is the most important command in your shell.
- Describe what an SCP can do that an IAM policy cannot, and vice versa.
- Identify the single AWS region that hosts billing metrics for CloudWatch alarms.
- Explain when you would use IAM Identity Center versus an IAM user with access keys.

## Further Reading

- [AWS account management](https://docs.aws.amazon.com/accounts/latest/reference/accounts-welcome.html)
- [AWS Organizations](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_introduction.html)
- [Service Control Policies](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html)
- [IAM Identity Center](https://docs.aws.amazon.com/singlesignon/latest/userguide/what-is.html)
- [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html)
- [AWS CLI named profiles](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)
