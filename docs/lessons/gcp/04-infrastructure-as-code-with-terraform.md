# Infrastructure as Code with Terraform

## Overview

This lesson introduces Terraform on GCP by building a small, real-world configuration: a versioned GCS bucket, configured through input variables, with state held in a remote GCS backend that supports locking through object versioning. You will also see the `plan → save → apply` workflow that protects production changes, and a small reusable module.

The goal is to leave with a habit, not just commands: never apply without reviewing a plan, never store state in source control, and never let one configuration sprawl into one giant `main.tf`.

## Estimated Time

- 90 minutes

## Prerequisites

- Completed [GCP Fundamentals](01-gcp-fundamentals.md)
- Terraform 1.6+ installed (`terraform version`)
- `gcloud` authenticated and the `cloud-katas` configuration active
- `gcloud auth application-default login` already run so Terraform can use ADC

## Cost Notice

A GCS bucket has a free tier suitable for this lab. Storing a few KB of state and a few small test objects costs effectively nothing. The bucket can be deleted at the end with `terraform destroy`.

## Learning Objectives

- Write a multi-file Terraform configuration with variables, outputs, and a module
- Use a GCS remote backend with object versioning for state and locking
- Drive changes through `plan → save → apply` with explicit plan artifacts
- Use a module to encapsulate one piece of reusable infrastructure
- Recover from a state mistake without losing real resources

## Core Concepts

- Provider, configuration, state: The provider is the SDK that talks to a cloud. Configuration is your desired state in HCL. State is Terraform's view of reality. The three must agree before `apply` becomes a no-op.
- Backends: A backend stores state. Local state is fine for solo experiments but loses safety guarantees the moment two people apply at once. Remote state (GCS, S3, Terraform Cloud) gives concurrency control.
- State locking: GCS uses object generations and Cloud Storage's strongly consistent metadata to lock. While one user holds the lock, others get a `state locked` error rather than a corrupted merge.
- Plans and plan files: `terraform plan -out plan.tfplan` produces a binary plan that `apply plan.tfplan` will execute exactly. This is how teams review changes before they happen.
- Variables and outputs: Variables are inputs; outputs are exports for other configurations to consume. Keeping them in separate files (`variables.tf`, `outputs.tf`) keeps `main.tf` legible.
- Modules: A module is a reusable bundle of resources with its own inputs and outputs. Even a tiny `modules/bucket` shows the boundary you would use in a real codebase.

## Lab

> ### Run locally with floci
>
> **Partly local.** The GCS remote-state backend runs against the [floci-gcp](https://github.com/floci-io/floci-gcp) emulator via `STORAGE_EMULATOR_HOST`.
>
> ```bash
> ./labs/lab.sh up        # starts the floci-gcp emulator
> source labs/env.sh      # exports STORAGE_EMULATOR_HOST + GOOGLE_CLOUD_PROJECT
> ```
>
> Create the state bucket against the emulator (the Google SDKs and Terraform's GCS backend honor `STORAGE_EMULATOR_HOST`). Keep the resources you manage to Cloud Storage buckets/objects, which the emulator supports.
>
> **Not emulated locally:** provider coverage for arbitrary GCP resources is partial — stick to Cloud Storage resources locally.

### 1. Prepare

```bash
gcloud config configurations activate cloud-katas
export PROJECT_ID=$(gcloud config get-value project)
export REGION="us-central1"
export STATE_BUCKET="${PROJECT_ID}-tfstate"
gcloud services enable storage.googleapis.com cloudresourcemanager.googleapis.com
terraform version
```

### 2. Create the State Bucket

Create a GCS bucket for Terraform state. Enable object versioning so a corrupted state can be rolled back.

```bash
gcloud storage buckets create "gs://$STATE_BUCKET" \
  --location="$REGION" \
  --uniform-bucket-level-access \
  --public-access-prevention

gcloud storage buckets update "gs://$STATE_BUCKET" --versioning
```

Add a `.gitignore` for any local lab folder so state and plans never reach Git.

```bash
mkdir -p tf
cat > tf/.gitignore <<'EOF'
.terraform/
*.tfstate
*.tfstate.*
*.tfplan
EOF
```

### 3. Write the Configuration

Create `tf/backend.tf` for the remote backend.

```hcl
terraform {
  required_version = ">= 1.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  backend "gcs" {
    prefix = "lessons/04-terraform"
  }
}
```

Create `tf/variables.tf`.

```hcl
variable "project_id" {
  description = "GCP project id"
  type        = string
}

variable "region" {
  description = "Default region"
  type        = string
  default     = "us-central1"
}

variable "bucket_suffix" {
  description = "Globally unique suffix for the lab bucket"
  type        = string
}
```

Create `tf/main.tf`.

```hcl
provider "google" {
  project = var.project_id
  region  = var.region
}

module "lab_bucket" {
  source        = "./modules/bucket"
  name          = "${var.project_id}-lesson-${var.bucket_suffix}"
  location      = "US"
  force_destroy = true
}
```

Create `tf/outputs.tf`.

```hcl
output "lab_bucket_name" {
  description = "Name of the lab bucket"
  value       = module.lab_bucket.name
}

output "lab_bucket_url" {
  description = "gs:// URL of the lab bucket"
  value       = module.lab_bucket.url
}
```

Create the bucket module at `tf/modules/bucket/main.tf`.

```hcl
variable "name" {
  type = string
}

variable "location" {
  type    = string
  default = "US"
}

variable "force_destroy" {
  type    = bool
  default = false
}

resource "google_storage_bucket" "this" {
  name                        = var.name
  location                    = var.location
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = var.force_destroy

  versioning {
    enabled = true
  }
}

output "name" {
  value = google_storage_bucket.this.name
}

output "url" {
  value = google_storage_bucket.this.url
}
```

### 4. Initialize, Plan, Apply

Initialize with the backend bucket on the command line so the value never lands in source control.

```bash
cd tf
terraform init \
  -backend-config="bucket=$STATE_BUCKET"
```

Build a `terraform.tfvars` (local only; ignored by Git).

```bash
cat > terraform.tfvars <<EOF
project_id    = "$PROJECT_ID"
region        = "$REGION"
bucket_suffix = "$(date +%s)"
EOF
```

Produce a plan file, review it, then apply that exact plan.

```bash
terraform plan -out lab.tfplan
terraform show lab.tfplan | head -40
terraform apply lab.tfplan
terraform output
```

### 5. Demonstrate State Locking

Open a second terminal in the same `tf/` folder and run another `apply`. The second invocation should fail with a clear `Error acquiring the state lock` message. Cancel it and continue.

### 6. Make a Safe Change

Change the bucket module call in `main.tf` to add an additional setting, for example a lifecycle rule. Re-plan to see exactly what will change.

Edit `tf/modules/bucket/main.tf` to add a lifecycle rule.

```hcl
  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }
```

Re-plan and apply.

```bash
terraform plan -out lab.tfplan
terraform apply lab.tfplan
```

### 7. Inspect State (Safely)

```bash
terraform state list
terraform state show module.lab_bucket.google_storage_bucket.this
```

Never edit state directly. If you make a mistake, `terraform import` or `terraform state rm` are the recovery tools.

## Validate

```bash
terraform output lab_bucket_name
gcloud storage buckets describe "gs://$(terraform output -raw lab_bucket_name)"
gcloud storage objects list "gs://$STATE_BUCKET/lessons/04-terraform/"
```

Success means:

- The bucket exists with versioning and PAP enforced.
- Terraform state is stored in `gs://$STATE_BUCKET/lessons/04-terraform/default.tfstate`.
- The plan-then-apply flow worked twice without errors.
- A concurrent apply was correctly blocked by the state lock.

## Troubleshooting

- `error loading backend`: The state bucket does not exist or you do not have permission. Re-run the bucket creation step and confirm `gcloud storage buckets list`.
- `Bucket name already exists`: GCS bucket names are global. Change `bucket_suffix` to something unique and re-plan.
- `Permission denied (insufficient scopes)`: Re-run `gcloud auth application-default login`. Terraform uses ADC, not your `gcloud` user credentials by default.
- Plan looks unrelated to your change: Run `terraform refresh` first, then plan. Drift is real and worth diagnosing before applying.
- Cannot acquire lock: An old apply was killed. `terraform force-unlock LOCK_ID` releases it, but verify no other apply is actually running first.

## Cleanup

```bash
terraform destroy
rm -f lab.tfplan terraform.tfvars
cd ..
```

Optionally delete the state bucket once you are sure no other lessons need it.

```bash
gcloud storage rm --recursive "gs://$STATE_BUCKET" --quiet
```

## Checkpoint

- Explain why `terraform apply plan.tfplan` is safer than `terraform apply -auto-approve` even in a CI pipeline.
- Describe the two things stored in the GCS state bucket and why versioning matters.
- Show one signal that tells you a `plan` is about to destroy resources you do not want to lose.
- Explain when to use a module versus a single `resource` block.

## Further Reading

- [Terraform Google provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
- [Terraform GCS backend](https://developer.hashicorp.com/terraform/language/backend/gcs)
- [Module composition](https://developer.hashicorp.com/terraform/language/modules/develop)
- [State management](https://developer.hashicorp.com/terraform/language/state)
