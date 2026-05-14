# GCP Fundamentals

## Overview

This lesson sets up the operating base for the rest of the GCP sequence. You will create or select a learning project, configure `gcloud` safely, add billing guardrails, inspect IAM, review quotas, and learn how the GCP resource hierarchy affects every later lab.

The goal is not to memorize every GCP service. The goal is to build the habits that keep hands-on cloud learning controlled: know which project you are in, know who has access, know what can cost money, and know how to validate your active context before creating resources.

## Estimated Time

- 75-90 minutes

## Prerequisites

- A Google account with permission to create or access a GCP project
- Billing access for the learning project, or an existing sandbox project with billing already linked
- `gcloud` CLI installed
- Optional: access to an organization or folder if you are working in a company-owned Google Cloud environment

## Cost Notice

This lesson should create little to no billable infrastructure. Budgets and IAM checks are free. Costs can appear later if you enable resources in the selected project, so create a budget before moving on.

## Learning Objectives

- Explain organizations, folders, projects, and resources
- Create or identify a safe learning project
- Configure a dedicated `gcloud` CLI profile for this course
- Configure billing visibility and budget alerts
- Inspect IAM grants, enabled APIs, and quota signals
- Validate that you are operating in the intended project before later labs

## Core Concepts

- Resource hierarchy: GCP resources live under projects, and projects can live under folders and organizations. Policies can be inherited from higher levels, so a project may have restrictions you did not set directly.
- Projects as blast-radius boundaries: Projects isolate APIs, IAM bindings, quotas, logs, and billing attribution. A dedicated learning project makes experiments easier to understand and safer to clean up.
- IAM and least privilege: IAM grants identities roles on resources. Primitive roles like Owner and Editor are broad; later lessons will favor narrowly scoped predefined roles and workload identities.
- Billing guardrails: A linked billing account allows resources to run, while budgets and alerts make spending visible. Budgets do not automatically stop all usage, so cleanup discipline still matters.
- Regions and zones: Regions represent geographic locations, and zones are isolated locations inside regions. Region choice affects latency, availability, service support, carbon footprint, and cost.
- Quotas and APIs: Many GCP services must be enabled before use, and quotas limit resource creation. Quotas are safety rails, not just obstacles.
- CLI configurations: `gcloud` configurations let you switch between projects and accounts without constantly rewriting defaults. A named course configuration prevents accidental work in the wrong project.

## Lab

### 1. Prepare Your Local CLI

Sign in and inspect your current context before making changes.

```bash
gcloud auth login
gcloud auth list
gcloud config configurations list
gcloud config list
```

Create a dedicated configuration for this course.

```bash
gcloud config configurations create cloud-katas
gcloud config configurations activate cloud-katas
```

If the configuration already exists, activate it instead:

```bash
gcloud config configurations activate cloud-katas
```

### 2. Choose Project and Region Variables

Use a unique project id if you are creating a new project. Project ids are global and cannot be reused immediately after deletion.

```bash
export PROJECT_ID="replace-with-your-project-id"
export DEFAULT_REGION="us-central1"
export DEFAULT_ZONE="us-central1-a"
```

Set these values into your `cloud-katas` CLI configuration.

```bash
gcloud config set project "$PROJECT_ID"
gcloud config set compute/region "$DEFAULT_REGION"
gcloud config set compute/zone "$DEFAULT_ZONE"
```

Validate the active configuration.

```bash
gcloud config configurations describe cloud-katas
gcloud config get-value project
gcloud config get-value compute/region
gcloud config get-value compute/zone
```

### 3. Create or Select a Learning Project

If you already have a sandbox project, skip project creation and describe it.

```bash
gcloud projects describe "$PROJECT_ID"
```

If you have permission to create projects, create one.

```bash
gcloud projects create "$PROJECT_ID" --name="Cloud Katas"
gcloud config set project "$PROJECT_ID"
gcloud projects describe "$PROJECT_ID"
```

If you work inside an organization, your administrator may require an organization or folder id:

```bash
gcloud organizations list
gcloud resource-manager folders list --organization="ORGANIZATION_ID"
```

Then create the project under the correct parent:

```bash
gcloud projects create "$PROJECT_ID" \
  --name="Cloud Katas" \
  --folder="FOLDER_ID"
```

### 4. Link Billing or Confirm Billing

List billing accounts that you can see.

```bash
gcloud billing accounts list
```

If billing is already linked, confirm it:

```bash
gcloud billing projects describe "$PROJECT_ID"
```

If you have permission to link billing, set the billing account:

```bash
export BILLING_ACCOUNT_ID="replace-with-billing-account-id"
gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT_ID"
gcloud billing projects describe "$PROJECT_ID"
```

### 5. Create a Budget Alert

Budgets are easiest to configure in the console for a first pass.

1. Open Billing > Budgets & alerts.
2. Create a budget scoped to the learning project.
3. Set a low monthly amount appropriate for your sandbox.
4. Add alerts at 50%, 90%, and 100%.
5. Confirm the alert email destination.

Optional CLI discovery:

```bash
gcloud billing budgets list --billing-account="$BILLING_ACCOUNT_ID"
```

Budget creation through CLI requires a JSON budget definition and billing permissions. For this first lesson, the console workflow is more learner-friendly.

### 6. Inspect IAM Grants

Review who has access to the project.

```bash
gcloud projects get-iam-policy "$PROJECT_ID" \
  --format="table(bindings.role, bindings.members)"
```

Look for broad roles:

- `roles/owner`
- `roles/editor`
- `roles/viewer`

Write down why each broad grant exists. If you cannot explain a grant, do not remove it yet; flag it for review.

### 7. Enable Only Basic APIs

The rest of the course will enable APIs as needed. For now, enable a small baseline used by common validation commands.

```bash
gcloud services enable \
  cloudresourcemanager.googleapis.com \
  serviceusage.googleapis.com \
  billingbudgets.googleapis.com
```

Inspect enabled APIs.

```bash
gcloud services list --enabled --format="table(config.name,state)"
```

### 8. Review Quotas

List quota-related service metadata and inspect the console quota page.

```bash
gcloud services quota list \
  --service=compute.googleapis.com \
  --consumer="projects/$PROJECT_ID" \
  --limit=20
```

If the command reports that the Compute Engine API is disabled, that is acceptable for this lesson. Later compute-focused lessons will enable it intentionally.

In the console, open IAM & Admin > Quotas and filter by:

- Service: Compute Engine API
- Region: your default region
- Metric: CPUs

The important habit is knowing where quota failures will show up before a cluster or VM lab fails.

### 9. Understand Organization Policy

If your project belongs to an organization, inherited policies may prevent actions such as public IP creation, service account key creation, or unrestricted locations.

```bash
gcloud resource-manager org-policies list --project="$PROJECT_ID"
```

If this command returns policies, skim them and note anything related to:

- Service account keys
- Allowed resource locations
- External IP addresses
- Public access prevention

## Validate

Run this final context check before moving to the next lesson:

```bash
gcloud config configurations list
gcloud config get-value project
gcloud config get-value compute/region
gcloud billing projects describe "$PROJECT_ID"
gcloud services list --enabled --format="value(config.name)" | sort
```

Create a second temporary CLI configuration to prove you can switch safely:

```bash
gcloud config configurations create cloud-katas-check
gcloud config configurations activate cloud-katas-check
gcloud config set project "$PROJECT_ID"
gcloud config configurations activate cloud-katas
gcloud config configurations list
```

Success means:

- `cloud-katas` is the active configuration.
- The expected project id is active.
- A default region and zone are set.
- Billing is linked or intentionally managed by an administrator.
- Budget alerts are configured in the console.
- You can explain the broad IAM grants on the project.

## Troubleshooting

- `PERMISSION_DENIED` on project creation: You do not have Project Creator permissions. Use an existing sandbox project or ask an administrator for a project.
- Billing account not visible: You may not have Billing Account Viewer or Billing Account User. Ask the billing administrator to link the project or grant the needed role.
- `gcloud` uses the wrong account: Run `gcloud auth list`, then `gcloud config set account ACCOUNT_EMAIL`.
- `gcloud` uses the wrong project: Run `gcloud config configurations activate cloud-katas`, then `gcloud config set project "$PROJECT_ID"`.
- API enablement fails: Confirm billing is linked and you have Service Usage Admin or an equivalent permission.
- Quota command fails for a disabled service: Enable that service only when the relevant lesson needs it. Do not enable every API up front.

## Cleanup

Keep the project if you will continue the course.

Remove the temporary validation configuration:

```bash
gcloud config configurations delete cloud-katas-check
```

If you created a disposable project and want to stop here, shut it down:

```bash
gcloud projects delete "$PROJECT_ID"
```

Validate cleanup:

```bash
gcloud projects describe "$PROJECT_ID"
```

After deletion starts, the project is marked for deletion and cannot be used for the next lessons.

## Checkpoint

- Explain the difference between a GCP project and a folder.
- Explain why a budget alert is not the same thing as an automatic spending limit.
- Show the command that proves which project your CLI will modify.
- Identify one IAM grant in your project and explain why it is needed.
- Name the default region you selected and why.

## Further Reading

- [Google Cloud resource hierarchy](https://cloud.google.com/resource-manager/docs/cloud-platform-resource-hierarchy)
- [Google Cloud budgets](https://cloud.google.com/billing/docs/how-to/budgets)
- [gcloud CLI configurations](https://cloud.google.com/sdk/docs/configurations)
- [IAM basic and predefined roles](https://cloud.google.com/iam/docs/understanding-roles)
- [Quotas and limits](https://cloud.google.com/docs/quotas)
- [Organization policy constraints](https://cloud.google.com/resource-manager/docs/organization-policy/org-policy-constraints)
