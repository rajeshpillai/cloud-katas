# DevOps Track

A cross-cutting view of the Cloud Katas modules, re-sequenced by **DevOps discipline** instead of by cloud provider. Nothing here is a new lesson — every entry links to an existing GCP or AWS module. Use it when your goal is "learn the DevOps toolchain" rather than "learn one cloud end-to-end."

Each phase lists the **shared/GCP** and **AWS** modules that teach it, plus how runnable the lab is on the local [floci](https://github.com/floci-io) + kind stack (`full` / `partial` / `none`, from `frontend/src/data/modules.ts`).

> **How to walk this track.** Do a phase's shared or GCP module first, then its AWS counterpart to see the same idea in the other cloud (the **Cross-Cloud Callout** in each lesson lines them up). Provider-neutral modules (Containers, GitOps) are done once and apply to both.

## Background you need

New to the fundamentals these phases lean on? Brush up from the [primers](primers/index.md) — each lesson's **"Background you need"** box links the relevant one:

- [Networking Fundamentals](primers/networking.md) — CIDR, subnets, ports, NAT, firewalls.
- [Identity & IAM](primers/identity-and-iam.md) — principals, ARNs, service accounts, OIDC/federation (the model behind CI/CD auth, IRSA, and Workload Identity).
- [CLI & Data Formats](primers/cli-and-data-formats.md) — shell, JSON/YAML, jsonpath, base64.

## The track

### Phase 0 — Foundations & Access

Set up an isolated account/project, a scoped CLI profile, identity awareness, and cost guardrails before you build anything.

| Module | Cloud | Local lab |
| --- | --- | --- |
| [GCP Fundamentals](gcp/01-gcp-fundamentals.md) | GCP | partial |
| [AWS Fundamentals](aws/01-aws-fundamentals.md) | AWS | partial |

### Phase 1 — Package & Run (Containers)

Build a hardened image and drive it through Kubernetes primitives. Provider-neutral — done once, used by every later phase.

| Module | Cloud | Local lab |
| --- | --- | --- |
| [Docker and Kubernetes Basics](gcp/02-docker-and-kubernetes-basics.md) | shared | **full** (Docker + kind, no cloud account) |

### Phase 2 — Provision the Platform (Managed Kubernetes)

Stand up managed Kubernetes and wire keyless workload access (Workload Identity / IRSA).

| Module | Cloud | Local lab |
| --- | --- | --- |
| [Google Kubernetes Engine (GKE)](gcp/03-google-kubernetes-engine-gke.md) | GCP | partial |
| [Amazon EKS](aws/02-amazon-eks-elastic-kubernetes-service.md) | AWS | partial |

### Phase 3 — Infrastructure as Code

Manage infrastructure declaratively with reviewed plans, remote state, and state locking.

| Module | Cloud | Local lab |
| --- | --- | --- |
| [Terraform on GCP](gcp/04-infrastructure-as-code-with-terraform.md) | GCP | partial |
| [Terraform on AWS](aws/03-infrastructure-as-code-with-terraform-on-aws.md) | AWS | **full** (S3 + DynamoDB + assume_role on floci) |

### Phase 4 — Continuous Delivery (CI/CD + GitOps)

Build → scan → publish → deploy through a guarded pipeline, and reconcile clusters from Git.

| Module | Cloud | Local lab |
| --- | --- | --- |
| [CI/CD with GitLab](gcp/06-cicd-with-gitlab.md) | GCP | partial |
| [CI/CD with GitLab on AWS](aws/04-cicd-with-gitlab-on-aws.md) | AWS | partial |
| [GitOps with Argo CD](gcp/05-gitops-with-argo-cd.md) | shared | **full** (Argo CD in kind) |

### Phase 5 — Secure (DevSecOps)

IAM least privilege, keyless workloads, secret versioning, encryption at rest, and audit trails.

| Module | Cloud | Local lab |
| --- | --- | --- |
| [Security in GCP](gcp/07-security-in-gcp.md) | GCP | partial |
| [Security in AWS](aws/05-security-in-aws.md) | AWS | partial |

### Phase 6 — Network the Platform

VPC topology, private egress, firewall/segmentation, endpoints, and load-balancer selection.

| Module | Cloud | Local lab |
| --- | --- | --- |
| [Networking in GCP](gcp/08-networking-in-gcp.md) | GCP | none (concept-only locally) |
| [Networking in AWS](aws/06-networking-in-aws.md) | AWS | partial |

### Phase 7 — Observe & Measure (SRE)

Logs, metrics, traces, dashboards, and alerts — including SLI/SLO/error-budget and burn-rate alerting.

| Module | Cloud | Local lab |
| --- | --- | --- |
| [Observability on GCP](gcp/09-observability-on-gcp.md) | GCP | none (inspect with kubectl locally) |
| [Observability on AWS](aws/07-observability-on-aws.md) | AWS | partial |

### Phase 8 — Operate & Debug

A methodical diagnostic order for the canonical Kubernetes failure modes, correlated with cloud signals.

| Module | Cloud | Local lab |
| --- | --- | --- |
| [Debugging and Troubleshooting](gcp/10-debugging-and-troubleshooting.md) | GCP | **full** (all failure modes reproduce in kind) |
| [Debugging and Troubleshooting on AWS](aws/08-debugging-and-troubleshooting-on-aws.md) | AWS | partial |

## What this track covers well

Build → provision → IaC → CI/CD → GitOps → secure → network → observe → debug is the spine of a modern platform/cloud-DevOps workflow, and every phase above is hands-on in **both** clouds. Notable strengths:

- **Keyless auth everywhere** — OIDC federation for CI/CD, Workload Identity (GCP) and IRSA (AWS) for pods. The [Identity & IAM primer](primers/identity-and-iam.md) backs it.
- **GitOps + pipeline delivery** side by side (Argo CD reconciliation *and* GitLab pipelines).
- **SRE fundamentals** — SLI/SLO/error-budget and burn-rate alerting, not just "add a dashboard."
- **A basic supply-chain gate** — an image vulnerability-scan stage in the CI/CD modules.

## Gaps (not covered as dedicated material)

Verified by searching the lesson sources — call these out if the track is meant to be a complete DevOps curriculum:

- **Progressive delivery** — no blue-green or canary lesson. Rollback/roll-forward appears only via Argo CD GitOps.
- **Configuration management** — no Ansible / Chef / Puppet.
- **Manifest templating** — Helm and Kustomize are mentioned in passing, not taught as modules.
- **Supply-chain hardening beyond scanning** — no SBOM generation or image signing (cosign/sigstore).
- **Load & chaos testing** — traffic is generated to trigger HPA/alerts, but there is no dedicated load-test (k6/Locust) or chaos-engineering module.
- **Incident process** — technical debugging is strong, but there is no runbook / postmortem / on-call practice module.

See [index.md](index.md) for the provider-ordered sequences and [primers/index.md](primers/index.md) for the fundamentals brush-ups.
