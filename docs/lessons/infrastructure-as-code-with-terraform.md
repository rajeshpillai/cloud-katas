# Infrastructure as Code with Terraform

## Overview

This lesson introduces Terraform by creating a simple GCP resource, reviewing plan/apply workflow, and discussing remote state.

## Estimated Time

- 75 minutes

## Prerequisites

- Completed [GCP Fundamentals](gcp-fundamentals.md)
- Terraform installed
- `gcloud` authenticated

## Learning Objectives

- Write a Terraform configuration
- Run `init`, `plan`, `apply`, and `destroy`
- Explain state and why remote locking matters

## Core Concepts

- Providers connect Terraform to cloud APIs
- State maps configuration to real resources
- Plans show proposed changes before execution
- Remote state is required for team workflows

## Lab

### 1. Prepare

Create a temporary lab folder outside the repository if you do not want Terraform state in source control.

```bash
terraform version
gcloud auth application-default login
```

### 2. Create a Configuration

Create `main.tf` in your lab folder.

```hcl
provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {}
variable "region" {
  default = "us-central1"
}

resource "google_storage_bucket" "lesson" {
  name          = "${var.project_id}-terraform-lesson"
  location      = "US"
  force_destroy = true
}
```

### 3. Apply

```bash
terraform init
terraform plan -var="project_id=$PROJECT_ID"
terraform apply -var="project_id=$PROJECT_ID"
```

## Validate

```bash
terraform state list
gcloud storage buckets list --project "$PROJECT_ID"
```

## Troubleshooting

- Bucket name conflict: use a globally unique suffix.
- Authentication errors: rerun `gcloud auth application-default login`.
- API disabled: enable the Cloud Storage API.

## Cleanup

```bash
terraform destroy -var="project_id=$PROJECT_ID"
```

## Further Reading

- [Terraform Google provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
- [Terraform state](https://developer.hashicorp.com/terraform/language/state)
