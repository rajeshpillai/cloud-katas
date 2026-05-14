# Deepen Lesson Content for Hands-On Practitioner Depth

## Context

Most lesson files in [lessons/](lessons/) are still first-draft depth. Each follows the template at [lessons/00-template.md](lessons/00-template.md): Overview → Estimated Time → Prerequisites → Learning Objectives → Core Concepts → Lab → Validate → Troubleshooting → Cleanup → Further Reading. The deepening pass should upgrade them one lesson at a time.

The labs target 60-120 minutes each, but the actual content is closer to a 15-25 minute walkthrough. Many lessons describe features without exercising them (Workload Identity, IRSA, remote Terraform state, OIDC federation, Argo CD Application CRs, log-based metrics, X-Ray, Container Insights, NAT/IGW networking, etc.). Core Concepts are 3-4 bullet lists with no elaboration. Several "labs" are mostly "open the console and click around."

Goal: lift each lesson to **hands-on practitioner depth** — fuller labs that actually wire up the features named in the objectives, deeper Core Concepts (with brief explanation, not just bullets), and validation steps that confirm real behavior, not just resource existence. This is a content-only change; the frontend renders Markdown via Vite glob in [frontend/src/data/lesson-content.ts](../frontend/src/data/lesson-content.ts), so no code or metadata changes are needed.

## Approach

Expand each lesson while keeping the existing template structure. Target ~150-250 lines per lesson (roughly 2-3× current size). Keep prose tight — depth comes from doing more in the lab, not from longer narrative.

Apply this **consistent expansion pattern** to every lesson:

1. **Core Concepts** — Convert each bullet from a label to a 1-2 sentence explanation. Add 1-2 missing concepts that the lab will exercise.
2. **Lab** — Add 1-3 substantive sub-steps so the named features in Learning Objectives are actually configured, not just mentioned. Replace "open the console and look around" steps with concrete commands or YAML.
3. **Validate** — Add at least one check that proves behavior (e.g., a curl against the LB, a token exchange, a state lock file), not just `describe`.
4. **Troubleshooting** — Add 1-2 realistic failure modes pulled from the new lab steps.
5. **Cross-cloud callout** (AWS lessons only) — A short "GCP equivalent: X" sidebar where it aids transfer (e.g., IRSA ↔ Workload Identity, ECR ↔ Artifact Registry, CloudWatch ↔ Cloud Monitoring).

Use one shared **tiny sample app** instead of `nginx` everywhere — a minimal HTTP echo container that takes a config flag and exposes `/healthz`. This lets later lessons (observability, debugging, CI/CD) exercise real signals (logs, custom metrics, configurable failure modes) without inventing a new app each time. Place its source at `docs/lessons/sample-app/` so all lessons can reference it.

## Per-Lesson Gap Analysis & Concrete Additions

### GCP Sequence

**[lessons/gcp/01-gcp-fundamentals.md](lessons/gcp/01-gcp-fundamentals.md)** — Done: added `gcloud config configurations` for multi-profile, Org Policy intro, project quotas check, IAM review, budget guardrails, and validation by switching configs.

**[lessons/gcp/02-docker-and-kubernetes-basics.md](lessons/gcp/02-docker-and-kubernetes-basics.md)** — Replace pure `kubectl create deployment` with a real `Dockerfile` build of the sample app, a `Deployment` + `Service` YAML applied with `kubectl apply -f`, a `ConfigMap` injected as env, a `Secret` mounted, and a scale + rollout demo.

**[lessons/gcp/03-google-kubernetes-engine-gke.md](lessons/gcp/03-google-kubernetes-engine-gke.md)** — Add: actual Workload Identity setup (KSA → GSA binding + annotation + token exchange demo), HPA on CPU, comparison sidebar Standard vs Autopilot, node pool taints/labels concept.

**[lessons/gcp/04-infrastructure-as-code-with-terraform.md](lessons/gcp/04-infrastructure-as-code-with-terraform.md)** — Wire up actual GCS remote backend with object versioning + locking, split into `main.tf`/`variables.tf`/`outputs.tf`, introduce a tiny module, show `terraform plan -out`/`apply plan.out` flow.

**[lessons/gcp/05-gitops-with-argo-cd.md](lessons/gcp/05-gitops-with-argo-cd.md)** — Replace direct `kubectl apply` with a real Argo CD `Application` CR pointing at a Git path, demonstrate drift (manual edit → Argo reconciles back), show sync waves with an annotation, mention app-of-apps.

**[lessons/gcp/06-cicd-with-gitlab.md](lessons/gcp/06-cicd-with-gitlab.md)** — Add OIDC federation from GitLab to GCP (no long-lived keys), Artifact Registry push job, `deploy:` job that updates a GKE deployment via `kubectl set image`, protected environments.

**[lessons/gcp/07-security-in-gcp.md](lessons/gcp/07-security-in-gcp.md)** — Add: Workload Identity (cross-link from lesson 03), Cloud KMS key + envelope encryption demo on a bucket, IAM Recommender review, brief Org Policy + VPC Service Controls concept callouts.

**[lessons/gcp/08-networking-in-gcp.md](lessons/gcp/08-networking-in-gcp.md)** — Add: Cloud Router + Cloud NAT for private nodes, Private Google Access enablement on the subnet, internal vs external LB comparison, peering vs Shared VPC sidebar, Cloud Armor concept.

**[lessons/gcp/09-observability-on-gcp.md](lessons/gcp/09-observability-on-gcp.md)** — Use the sample app to emit a structured log + custom metric; create a real log-based metric; define an SLI/SLO around `/healthz` success rate; create one alert from that SLO; mention log sinks/export.

**[lessons/gcp/10-debugging-and-troubleshooting.md](lessons/gcp/10-debugging-and-troubleshooting.md)** — Expand from one broken image to four scenarios: `ImagePullBackOff`, `CrashLoopBackOff` (sample app with crash flag), `OOMKilled` (low memory limit), `Pending` (impossible nodeSelector). Show `kubectl debug node/...`.

### AWS Sequence

**[lessons/aws/01-aws-fundamentals.md](lessons/aws/01-aws-fundamentals.md)** — Add: AWS Organizations + OUs + SCPs concept, IAM Identity Center vs IAM users sidebar, CloudShell as a no-install option, AWS CLI named profiles.

**[lessons/aws/02-amazon-eks-elastic-kubernetes-service.md](lessons/aws/02-amazon-eks-elastic-kubernetes-service.md)** — Add: actual IRSA wiring (OIDC provider + IAM role + trust policy + KSA annotation + token exchange demo), addons (VPC CNI, CoreDNS, kube-proxy), brief Karpenter vs Cluster Autoscaler. Cross-cloud callout: IRSA ↔ GKE Workload Identity.

**[lessons/aws/03-infrastructure-as-code-with-terraform-on-aws.md](lessons/aws/03-infrastructure-as-code-with-terraform-on-aws.md)** — Wire up S3 backend + DynamoDB lock table (the lock table is the entire point of the lesson and currently missing), demonstrate concurrent-apply blocked by lock, show `assume_role` provider config.

**[lessons/aws/04-cicd-with-gitlab-on-aws.md](lessons/aws/04-cicd-with-gitlab-on-aws.md)** — Make the OIDC federation step concrete (currently a one-line aside): IAM IdP for GitLab, role with trust policy, `id_tokens:` in `.gitlab-ci.yml`, `aws sts assume-role-with-web-identity`. Add an actual EKS deploy job.

**[lessons/aws/05-security-in-aws.md](lessons/aws/05-security-in-aws.md)** — Add: IRSA (cross-link from lesson 02), KMS-encrypted Secrets Manager secret + bucket SSE-KMS, IAM Access Analyzer findings review, S3 Block Public Access verification, GuardDuty + Security Hub concept callouts.

**[lessons/aws/06-networking-in-aws.md](lessons/aws/06-networking-in-aws.md)** — Expand the bare VPC+subnet into a real two-AZ topology with public + private subnets, IGW, NAT GW, route tables, security group + NACL contrast, VPC endpoint for S3, ALB vs NLB sidebar.

**[lessons/aws/07-observability-on-aws.md](lessons/aws/07-observability-on-aws.md)** — Enable Container Insights as a real step, run a CloudWatch Logs Insights query against the sample app's structured logs, instrument the sample app with ADOT for one trace span, create one metric alarm. Cross-cloud callout: CloudWatch ↔ Cloud Monitoring/Logging.

**[lessons/aws/08-debugging-and-troubleshooting-on-aws.md](lessons/aws/08-debugging-and-troubleshooting-on-aws.md)** — Same four-scenario expansion as the GCP debugging lesson, plus AWS-specific: unhealthy ALB target group, EKS node `NotReady` due to VPC CNI IP exhaustion (conceptual fix), CloudWatch Logs Insights query for the failure.

## Critical Files

- All 18 lesson files under [lessons/gcp/](lessons/gcp/) and [lessons/aws/](lessons/aws/)
- **New**: `lessons/sample-app/` — minimal Dockerfile + tiny HTTP server (echo, `/healthz`, `--crash`/`--memory-hog` flags) used by lessons 02, 03, 06, 09, 10 (GCP) and 02, 04, 07, 08 (AWS)
- [lessons/00-template.md](lessons/00-template.md) — extend the template to call out: Core Concepts should be explained (not just listed), Validate should prove behavior, optional Cross-Cloud Callout for AWS lessons
- [lessons/index.md](lessons/index.md) — add one-line per-lesson hook so the index is scannable
- [todo.md](../todo.md) — append a "Deepen lesson content" task and check it off when complete

No frontend or metadata files need to change. The Vite glob loader in [frontend/src/data/lesson-content.ts](../frontend/src/data/lesson-content.ts) picks up any new content automatically.

## Sequencing

Suggested order to make incremental review easy:

1. Build the sample app + update the template + extend `index.md`.
2. Foundational GCP lessons in order (01 → 04) — these set patterns the rest reuse.
3. Remaining GCP lessons (05 → 10).
4. AWS fundamentals + EKS (01 → 02) — establish IRSA pattern.
5. Remaining AWS lessons (03 → 08).

Commit after each lesson so the user can review/reject piecemeal.

## Verification

End-to-end check after each lesson is updated:

1. `cd frontend && npm run dev` and open the corresponding `/modules/<slug>` route. Confirm the lesson renders, Mermaid blocks (if any added) load, and links to sibling lessons resolve.
2. For lessons with new shell commands, run them against a real sandbox project/account. Stop at the first failure and fix.
3. `npm run build` to confirm no Markdown causes a build issue (Vite raw imports are tolerant, but triple-backtick edge cases can bite).
4. After the full pass: re-read [lessons/index.md](lessons/index.md) and skim each lesson's Validate section to make sure the validation steps are still consistent with the template.
