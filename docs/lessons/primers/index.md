# Primers (Fundamentals Brush-Up)

Short, self-contained refreshers for the fundamentals the lessons assume. You do **not** need to read these front-to-back before starting — each lesson's **"Background you need"** box links to the relevant primer, so you can brush up exactly when a lab needs it.

The goal of this course is that a topic is only hard because the *idea* is hard — never because a prerequisite was skipped. These primers are that safety net.

- [Networking Fundamentals](networking.md) — IP addresses, ports, **CIDR & subnet masks**, public vs private IP (RFC 1918), NAT, routing, stateful vs stateless firewalls.
- [Identity & IAM](identity-and-iam.md) — principals/roles/bindings, reading an ARN and a GCP member string, cloud vs Kubernetes service accounts, and the **OIDC/JWT/federation** model behind IRSA, Workload Identity, and CI/CD auth.
- [CLI & Data Formats](cli-and-data-formats.md) — shell idioms (env vars, `$(...)`, heredocs), JSON vs YAML, querying output (`--query`, jsonpath, `jq`/`yq`), base64, and `file://`.
