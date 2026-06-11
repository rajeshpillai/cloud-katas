# Infrastructure as Code with Terraform on AWS

## Overview

This lesson translates the Terraform habits from the GCP track to AWS. You will set up an S3 + DynamoDB remote backend (the lock table is the entire point, not an afterthought), build a multi-file configuration with variables, outputs, and a small module, and demonstrate that concurrent applies are correctly blocked by the lock.

The cross-cloud transfer is direct: the workflow is identical, the backend mechanics differ. GCS uses object versioning for locking; AWS uses a DynamoDB item for the lock. Get the DynamoDB table wrong and your team will eventually corrupt state.

## Estimated Time

- 90 minutes

## Prerequisites

- Completed [AWS Fundamentals](01-aws-fundamentals.md) and [Infrastructure as Code with Terraform](../gcp/04-infrastructure-as-code-with-terraform.md)
- Terraform 1.6+ installed
- AWS CLI v2 with the `cloud-katas` profile
- Permission to create S3 buckets, DynamoDB tables, and IAM resources

## Cost Notice

S3 storage and DynamoDB on-demand for a state lock are pennies per month at this scale. Buckets created by the lab are deleted in cleanup.

## Learning Objectives

- Provision a Terraform remote backend with S3 + DynamoDB for state and locking
- Author a multi-file Terraform configuration with variables, outputs, and a module
- Demonstrate that the DynamoDB lock prevents concurrent applies
- Use the `assume_role` provider configuration to operate against a different account or role
- Inspect and recover state safely without editing it by hand

## Core Concepts

- S3 + DynamoDB backend: State files live in S3 with versioning. A DynamoDB table provides the atomic compare-and-swap lock — its primary key holds the lock identifier and any second writer fails to acquire.
- Versioning on the state bucket: Mandatory. Without it, a botched apply is unrecoverable. With it, you can roll back to a previous state object by ID.
- `assume_role` provider: AWS environments span many accounts. The provider can be told to assume a specific role rather than use the caller's identity directly. This is how a deployment role limits the blast radius of a CI pipeline.
- Terraform modules: A module is a reusable bundle of resources with inputs and outputs. Even a tiny one signals where the boundary should be in a real codebase.
- Tagging strategy: AWS bills are read by tags. A consistent set of tags (`Project`, `Environment`, `Owner`, `CostCenter`) is the difference between an interpretable bill and a guessing game.
- Drift and `terraform plan`: A plan compares state to reality and shows the diff. Plans that "want to change everything" usually mean someone edited resources by hand. Reconcile before applying.

## Lab

> ### Run locally with floci
>
> This lab runs **end-to-end** against the local [floci](https://github.com/floci-io) AWS emulator — S3, DynamoDB, and STS are all supported, so no AWS account or cost is involved.
>
> ```bash
> ./labs/lab.sh up        # starts the floci emulator
> source labs/env.sh      # exports AWS_ENDPOINT_URL + fake creds
> ```
>
> With the env sourced, **skip the `export AWS_PROFILE=cloud-katas` line** below (floci needs no profile) and run every `aws …` command in this lab unchanged. For the Terraform backend and provider, point them at the emulator:
>
> ```hcl
> # backend.tf — add to the `backend "s3"` block
> #   endpoints                   = { s3 = "http://localhost:4566", dynamodb = "http://localhost:4566" }
> #   skip_credentials_validation = true
> #   skip_metadata_api_check     = true
> #   skip_requesting_account_id  = true
> #   use_path_style              = true
>
> # provider.tf — add to the `provider "aws"` block
> #   endpoints { s3 = "http://localhost:4566" dynamodb = "http://localhost:4566" sts = "http://localhost:4566" iam = "http://localhost:4566" }
> #   skip_credentials_validation = true
> #   skip_requesting_account_id  = true
> #   s3_use_path_style           = true
> ```
>
> **Not emulated locally:** cross-account `assume_role` against a real second account — the call succeeds against floci's STS but does not enforce real trust policies.

### 1. Prepare

```bash
export AWS_PROFILE=cloud-katas
export AWS_REGION="us-east-1"
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export STATE_BUCKET="terraform-state-$ACCOUNT_ID"
export LOCK_TABLE="terraform-locks"
terraform version
```

### 2. Create the State Bucket and Lock Table

Create the S3 bucket with versioning, public-access block, and SSE.

```bash
aws s3api create-bucket \
  --bucket "$STATE_BUCKET" \
  --region "$AWS_REGION" \
  $( [ "$AWS_REGION" != "us-east-1" ] && echo "--create-bucket-configuration LocationConstraint=$AWS_REGION" )

aws s3api put-bucket-versioning \
  --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-public-access-block \
  --bucket "$STATE_BUCKET" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

aws s3api put-bucket-encryption \
  --bucket "$STATE_BUCKET" \
  --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
```

Create the DynamoDB lock table. The primary key must be named `LockID` and be a string — Terraform's S3 backend hard-codes this.

```bash
aws dynamodb create-table \
  --table-name "$LOCK_TABLE" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

aws dynamodb wait table-exists --table-name "$LOCK_TABLE"
```

### 3. Write the Configuration

Create `tf/.gitignore`:

```text
.terraform/
*.tfstate
*.tfstate.*
*.tfplan
terraform.tfvars
```

Create `tf/backend.tf`:

```hcl
terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    key            = "lessons/03-terraform/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}
```

Create `tf/variables.tf`:

```hcl
variable "region" {
  type    = string
  default = "us-east-1"
}

variable "project" {
  type    = string
  default = "cloud-katas"
}

variable "environment" {
  type    = string
  default = "lab"
}

variable "bucket_suffix" {
  type        = string
  description = "Unique suffix for the lab bucket"
}
```

Create `tf/main.tf`:

```hcl
provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

module "lab_bucket" {
  source        = "./modules/bucket"
  name          = "${var.project}-${var.environment}-${var.bucket_suffix}"
  force_destroy = true
}
```

Create `tf/outputs.tf`:

```hcl
output "lab_bucket_name" {
  value = module.lab_bucket.name
}

output "lab_bucket_arn" {
  value = module.lab_bucket.arn
}
```

Create the module at `tf/modules/bucket/main.tf`:

```hcl
variable "name" {
  type = string
}

variable "force_destroy" {
  type    = bool
  default = false
}

resource "aws_s3_bucket" "this" {
  bucket        = var.name
  force_destroy = var.force_destroy
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "name" {
  value = aws_s3_bucket.this.id
}

output "arn" {
  value = aws_s3_bucket.this.arn
}
```

### 4. Initialize, Plan, Apply

Initialize with the backend bucket on the command line.

```bash
cd tf
terraform init -backend-config="bucket=$STATE_BUCKET"
```

Provide the unique bucket suffix.

```bash
cat > terraform.tfvars <<EOF
bucket_suffix = "$(date +%s)"
EOF
```

Produce a plan, review it, apply that exact plan.

```bash
terraform plan -out lab.tfplan
terraform show lab.tfplan | head -30
terraform apply lab.tfplan
terraform output
```

### 5. Demonstrate State Locking

Open a second terminal in the same `tf/` folder and run another `terraform apply`. The second invocation should fail with:

```text
Error: Error acquiring the state lock
...
ConditionalCheckFailedException: The conditional request failed
```

The first apply still holds the DynamoDB item with primary key `terraform-state-...:lessons/03-terraform/terraform.tfstate`. The second writer cannot create a duplicate. Cancel the second apply and continue.

Inspect the lock:

```bash
aws dynamodb scan --table-name "$LOCK_TABLE" --max-items 5
```

Once the first apply completes, the lock item is deleted and the table is empty again.

### 6. Use `assume_role` (Concept-Plus-Snippet)

If a deployment runs as a CI role that must hop to a target role, configure the provider:

```hcl
provider "aws" {
  region = var.region

  assume_role {
    role_arn     = "arn:aws:iam::TARGET_ACCOUNT_ID:role/deployment"
    session_name = "terraform-deploy"
  }
}
```

This is also how multi-account environments are managed without copying credentials around.

### 7. Drift Demo

Make a manual change to the lab bucket (set a public-access-block setting differently) and re-plan to see the diff.

```bash
aws s3api put-bucket-versioning \
  --bucket "$(terraform output -raw lab_bucket_name)" \
  --versioning-configuration Status=Suspended

terraform plan
```

Terraform will report drift on `aws_s3_bucket_versioning.this` and propose to bring it back to `Enabled`. Apply or revert by hand to fix.

## Validate

```bash
terraform state list
aws s3 ls "s3://$(terraform output -raw lab_bucket_name)"
aws s3 ls "s3://$STATE_BUCKET/lessons/03-terraform/"
aws dynamodb scan --table-name "$LOCK_TABLE" --select COUNT
```

Success means:

- The lab bucket exists with versioning, encryption, and public-access block.
- State is stored in `s3://$STATE_BUCKET/lessons/03-terraform/terraform.tfstate` with versioning enabled.
- The DynamoDB lock table successfully blocked a concurrent apply.
- A manual change produced a clean drift report on the next `plan`.

## Troubleshooting

- `BucketAlreadyOwnedByYou` on `create-bucket`: You already created it. Skip the create and continue.
- `BucketAlreadyExists`: S3 names are global; pick a different suffix.
- `Error acquiring the state lock` and nothing is running: A previous apply was killed. `terraform force-unlock <ID>` after confirming no lockholder. Last-resort.
- `dynamodb_table` mismatch: The S3 backend reads the table name from `backend.tf`. Changing it requires `terraform init -migrate-state` after editing.
- `assume_role` errors: The target role's trust policy must allow the source identity (your `cloud-katas` ARN) to assume. Use `aws sts assume-role` directly to debug.

## Cleanup

```bash
terraform destroy
rm -f lab.tfplan terraform.tfvars
cd ..
```

Optionally delete the state bucket and lock table once no other lessons need them.

```bash
aws s3 rm "s3://$STATE_BUCKET" --recursive
aws s3api delete-bucket --bucket "$STATE_BUCKET"
aws dynamodb delete-table --table-name "$LOCK_TABLE"
```

## Cross-Cloud Callout

- S3 + DynamoDB backend ↔ GCS backend with object versioning: same outcome, two locking mechanisms. AWS needs a separate lock table; GCS uses object generations.
- `assume_role` ↔ GCP service account impersonation: both grant a scoped identity to a deployment process.
- Default tags via the AWS provider ↔ GCP labels: AWS bills by tag; GCP bills by label. The mental model is identical.

## Checkpoint

- Explain why a state bucket without versioning is dangerous.
- Identify the single column on the DynamoDB lock table that Terraform's S3 backend depends on.
- Describe what `assume_role` changes about the credentials Terraform uses.
- Explain what `terraform plan` does that `terraform apply` does not, and why this matters in CI.

## Further Reading

- [Terraform AWS provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Terraform S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3)
- [DynamoDB state locking](https://developer.hashicorp.com/terraform/language/backend/s3#dynamodb-state-locking)
- [Terraform modules](https://developer.hashicorp.com/terraform/language/modules/develop)
