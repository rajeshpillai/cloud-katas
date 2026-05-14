# GCP Fundamentals

## Overview

This lesson introduces the GCP resource hierarchy, console navigation, billing controls, regions, zones, and the basic operating habits needed before creating infrastructure.

## Estimated Time

- 60 minutes

## Prerequisites

- A Google account with permission to create or access a GCP project
- `gcloud` CLI installed if you want to use command-line validation

## Learning Objectives

- Explain organizations, folders, projects, and resources
- Create or identify a safe learning project
- Configure billing visibility and budget alerts

## Core Concepts

- Projects are the main boundary for resources, IAM, APIs, and billing
- Regions and zones determine locality, availability, and cost
- Budgets and alerts reduce the risk of surprise spend

## Lab

### 1. Prepare

Choose a unique project id and billing account. Prefer a dedicated learning project so cleanup is simple.

```bash
gcloud auth login
gcloud config list
```

### 2. Create or Select a Project

Use the console or CLI to create a project, then set it as the active project.

```bash
export PROJECT_ID="replace-with-your-project-id"
gcloud config set project "$PROJECT_ID"
gcloud projects describe "$PROJECT_ID"
```

### 3. Configure Safety Controls

In the console, open Billing and create a budget alert for the learning project. Use a low threshold suitable for your account. Review IAM and confirm you know which identities have Owner, Editor, or Viewer access.

## Validate

```bash
gcloud config get-value project
gcloud services list --enabled
```

Success means the active project is correct, billing visibility is available, and you can see enabled APIs.

## Troubleshooting

- Permission denied: ask for Project Creator, Billing Account User, or a narrower role needed for the task.
- Billing account missing: use an existing billed project or ask an administrator to link billing.
- Wrong project selected: run `gcloud config set project PROJECT_ID` again.

## Cleanup

If you created a disposable project, shut it down from IAM & Admin > Manage Resources after later labs are complete.

## Further Reading

- [Google Cloud resource hierarchy](https://cloud.google.com/resource-manager/docs/cloud-platform-resource-hierarchy)
- [Google Cloud budgets](https://cloud.google.com/billing/docs/how-to/budgets)
