# Lessons Index

This folder contains one lesson file for each module in the cloud learning path. Each lesson follows the same structure: overview, prerequisites, objectives, core concepts, lab, validation, troubleshooting, cleanup, and further reading.

## Fundamentals Primers

New to cloud, networking, or IAM? Start with — or brush up from — the [primers](primers/index.md). Each lesson's **"Background you need"** box links to the relevant one, so you never hit a lab that assumes something you haven't seen.

- [Networking Fundamentals](primers/networking.md) — CIDR, subnets, ports, NAT, firewalls.
- [Identity & IAM](primers/identity-and-iam.md) — principals, ARNs, service accounts, OIDC/federation.
- [CLI & Data Formats](primers/cli-and-data-formats.md) — shell, JSON/YAML, jsonpath, base64.

## GCP Sequence

1. [GCP Fundamentals](gcp/01-gcp-fundamentals.md): create a safe project, CLI profile, budget guardrail, and quota baseline.
2. [Docker and Kubernetes Basics](gcp/02-docker-and-kubernetes-basics.md): build the sample app and run it through Kubernetes primitives.
3. [Google Kubernetes Engine (GKE)](gcp/03-google-kubernetes-engine-gke.md): deploy to managed Kubernetes and introduce Workload Identity.
4. [Infrastructure as Code with Terraform](gcp/04-infrastructure-as-code-with-terraform.md): manage GCP resources with reviewed, stateful infrastructure changes.
5. [GitOps with Argo CD](gcp/05-gitops-with-argo-cd.md): reconcile a cluster from Git and observe drift correction.
6. [CI/CD with GitLab](gcp/06-cicd-with-gitlab.md): build, publish, and deploy containers through a guarded pipeline.
7. [Security in GCP](gcp/07-security-in-gcp.md): practice IAM, service accounts, secrets, audit logs, and encryption basics.
8. [Networking in GCP](gcp/08-networking-in-gcp.md): build VPC foundations and reason about load balancing and private access.
9. [Observability on GCP](gcp/09-observability-on-gcp.md): turn app signals into logs, metrics, dashboards, and alerts.
10. [Debugging and Troubleshooting](gcp/10-debugging-and-troubleshooting.md): diagnose common Kubernetes failure modes methodically.

## AWS Sequence

1. [AWS Fundamentals](aws/01-aws-fundamentals.md): establish account, identity, region, profile, and cost guardrails.
2. [Amazon EKS](aws/02-amazon-eks-elastic-kubernetes-service.md): run Kubernetes on AWS and introduce IRSA.
3. [Terraform on AWS](aws/03-infrastructure-as-code-with-terraform-on-aws.md): manage AWS resources with remote state and locking.
4. [CI/CD with GitLab on AWS](aws/04-cicd-with-gitlab-on-aws.md): publish to ECR and prepare protected EKS deploys.
5. [Security in AWS](aws/05-security-in-aws.md): practice IAM, Secrets Manager, CloudTrail, KMS, and security findings.
6. [Networking in AWS](aws/06-networking-in-aws.md): build VPC topology and reason about public, private, and endpoint access.
7. [Observability on AWS](aws/07-observability-on-aws.md): use CloudWatch, Container Insights, traces, and alarms.
8. [Debugging and Troubleshooting on AWS](aws/08-debugging-and-troubleshooting-on-aws.md): debug EKS workloads with Kubernetes and AWS signals.
