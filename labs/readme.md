# Local Labs with floci

Run the Cloud Katas hands-on labs **locally and for free** — no cloud account,
no billing, no cost notices. This directory wires together three pieces:

| Piece | What it provides | Endpoint |
|-------|------------------|----------|
| [floci](https://github.com/floci-io/floci) | AWS service emulator (S3, DynamoDB, IAM, STS, KMS, Secrets Manager, CloudWatch, …) | `http://localhost:4566` |
| [floci-gcp](https://github.com/floci-io/floci-gcp) | GCP service emulator (GCS, Pub/Sub, Firestore, Secret Manager, IAM) | `http://localhost:4588` |
| [kind](https://kind.sigs.k8s.io/) + local registry | A real single-node Kubernetes cluster for the GKE/EKS/kubectl/Argo CD labs | cluster `cloud-katas`, registry `localhost:5001` |

floci replaces the cloud **control-plane APIs**; kind provides a **real
Kubernetes cluster** (floci does not emulate one). Together they cover most of
the course. Things with no local equivalent (billing, org policy, real VPC
packet routing, Cloud Armor, managed logging/SLOs) are flagged per lesson as
"Not emulated locally — simulate only".

## Prerequisites

- **Docker** (running)
- **kind** and **kubectl**
- The CLI for whichever path you are on: **`aws`**, **`gcloud`**, **`terraform`**
- ~2 GB free memory for the kind cluster

## Quickstart

```bash
# from the repo root
./labs/lab.sh up          # boot floci + floci-gcp + registry + kind cluster
source labs/env.sh        # point aws/gcloud/SDKs at the emulators
./labs/lab.sh status      # health check any time
```

Then follow any lesson's **"Run locally with floci"** block. When you are done:

```bash
./labs/lab.sh down        # delete the cluster and stop the emulators
```

### Commands

| Command | Action |
|---------|--------|
| `./labs/lab.sh up` | Start emulators and create the kind cluster (idempotent) |
| `./labs/lab.sh down` | Delete the cluster and stop the emulators |
| `./labs/lab.sh status` | Show emulator health and cluster nodes |
| `./labs/lab.sh env` | Print the env exports (same as `source labs/env.sh`) |

Overrides: `KIND_CLUSTER` (default `cloud-katas`), `COMPOSE` (default
`docker compose`).

## How tools find the emulators

`source labs/env.sh` exports the standard variables the official SDKs/CLIs read:

- **AWS** — `AWS_ENDPOINT_URL=http://localhost:4566` (plus fake `us-east-1`
  creds). Most `aws …` commands then work unchanged. Terraform needs a provider
  `endpoints {}` block + `skip_*` flags (shown in the AWS lessons).
- **GCP** — `STORAGE_EMULATOR_HOST`, `PUBSUB_EMULATOR_HOST`,
  `FIRESTORE_EMULATOR_HOST`, `SECRET_MANAGER_EMULATOR_HOST`,
  `GOOGLE_CLOUD_PROJECT=floci-local`. SDKs honor these directly; some `gcloud`
  subcommands do not support endpoint overrides and are flagged per lesson.
- **kind** — push images to `localhost:5001` and reference them from manifests;
  the cluster pulls from that registry.

The credentials are deliberately fake; floci performs no authentication.
Sourcing `env.sh` affects only the current shell — open a new terminal to talk
to a real cloud again.

## Per-module local coverage

`full` = runnable end-to-end locally · `partial` = core steps run locally, some
flagged · `none` = concept-only locally (no emulator equivalent).

| # | Module | Stack | Level | Notes |
|---|--------|-------|-------|-------|
| 1 | GCP Fundamentals | floci-gcp | partial | IAM + Secret Manager only; billing/budgets/org-policy simulate-only |
| 2 | Docker & K8s Basics | kind | full | docker build + kind, no cloud account |
| 3 | GKE | kind, floci-gcp | partial | kind ↔ cluster; local registry ↔ Artifact Registry; Workload Identity simulate-only |
| 4 | Terraform (GCP) | floci-gcp | partial | GCS backend via `STORAGE_EMULATOR_HOST`; provider partially emulated |
| 5 | GitOps Argo CD | kind | full | Argo CD installs into kind |
| 6 | CI/CD with GitLab | kind | partial | push to local registry; OIDC/WIF simulate-only |
| 7 | Security in GCP | floci-gcp | partial | Secret Manager + IAM; KMS/audit-logs simulate-only |
| 8 | Networking in GCP | — | none | VPC/NAT/Cloud Armor not emulated |
| 9 | Observability on GCP | kind | none | use `kubectl logs`; Cloud Logging/SLO simulate-only |
| 10 | Debugging & Troubleshooting | kind | full | pod failure modes reproduce in kind |
| 11 | AWS Fundamentals | floci | partial | IAM/STS/Organizations; budgets simulate-only |
| 12 | Amazon EKS | kind, floci | partial | kind ↔ EKS; local registry ↔ ECR; IRSA via floci STS (partial) |
| 13 | Terraform on AWS | floci | full | S3+DynamoDB backend, provider, STS assume-role |
| 14 | CI/CD with GitLab on AWS | floci, kind | partial | STS/ECR via floci; OIDC simulate-only |
| 15 | Security in AWS | floci | partial | KMS, Secrets Manager, IAM; CloudTrail/Access-Analyzer partial |
| 16 | Networking in AWS | floci | partial | VPC/SG/NACL at API level; no real packet routing |
| 17 | Observability on AWS | floci, kind | partial | CloudWatch Logs/Metrics; X-Ray simulate-only |
| 18 | Debugging on AWS | kind, floci | partial | pod diagnostics in kind; NLB health simulate-only |

## Troubleshooting

- **`aws` still hits real AWS** — re-run `source labs/env.sh` in the current
  shell; confirm with `echo $AWS_ENDPOINT_URL`.
- **`ImagePullBackOff` in kind** — push the image to `localhost:5001` first and
  reference it as `localhost:5001/<name>:<tag>`; or `kind load docker-image
  <name>:<tag> --name cloud-katas`.
- **Port already in use (4566/4588/5001)** — another emulator (e.g. LocalStack)
  is running; stop it or remap the port in `docker-compose.yml`.
- **Cluster won't create** — ensure Docker has enough memory; `./labs/lab.sh
  down` then `up` to recreate cleanly.
