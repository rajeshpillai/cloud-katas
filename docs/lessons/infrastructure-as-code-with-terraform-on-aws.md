# Infrastructure as Code with Terraform on AWS

## Overview

This lesson uses Terraform to create a simple AWS resource and discusses S3 remote state with locking for team workflows.

## Estimated Time

- 75 minutes

## Prerequisites

- Completed [AWS Fundamentals](aws-fundamentals.md)
- Completed [Infrastructure as Code with Terraform](infrastructure-as-code-with-terraform.md)
- Terraform and AWS CLI

## Learning Objectives

- Configure the AWS Terraform provider
- Create and destroy AWS resources
- Explain remote state storage and locking

## Core Concepts

- Terraform state must be protected
- S3 is commonly used for AWS remote state
- Locking prevents overlapping writes
- Plans should be reviewed before apply

## Lab

### 1. Prepare

```bash
export AWS_REGION="us-east-1"
aws sts get-caller-identity
terraform version
```

### 2. Create a Configuration

Create `main.tf` in a temporary lab folder.

```hcl
provider "aws" {
  region = var.region
}

variable "region" {
  default = "us-east-1"
}

resource "aws_s3_bucket" "lesson" {
  bucket_prefix = "terraform-lesson-"
}
```

### 3. Apply

```bash
terraform init
terraform plan
terraform apply
```

## Validate

```bash
terraform state list
aws s3api list-buckets --query "Buckets[].Name"
```

## Troubleshooting

- Bucket creation denied: confirm IAM permissions.
- Region mismatch: set `AWS_REGION` and provider region consistently.
- State file committed accidentally: remove it from Git and rotate any exposed secrets.

## Cleanup

```bash
terraform destroy
```

## Further Reading

- [Terraform AWS provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3)
