# Primer: Identity & IAM

> A brush-up for every lesson that grants permissions or lets one system act as another — fundamentals ([AWS](../aws/01-aws-fundamentals.md), [GCP](../gcp/01-gcp-fundamentals.md)), the security lessons, and especially the "workload identity" / OIDC steps in EKS, GKE, and the CI/CD lessons. Read it once; return when a lab pastes a trust string you want to decode.

## The IAM model in one paragraph

**IAM** (Identity and Access Management) answers *"who can do what to which resource?"* Three nouns:

- **Principal / member / identity** — *who* (a human user, a group, or a workload).
- **Role / policy** — *what* they may do (a bundle of allowed actions).
- **Binding / attachment** — the *link* that says "this principal has this role" (optionally on a specific resource).

Permissions are **additive and default-deny**: you have nothing until a binding grants it. An **explicit Deny always wins** over any Allow.

## Reading an AWS ARN

An **ARN** (Amazon Resource Name) uniquely names any AWS thing. It has fixed fields separated by colons:

```
arn:aws:iam::123456789012:role/eks-app-role
└─┬─┘ └┬┘ └┬┘ │ └────┬─────┘ └──────┬──────┘
 arn  part svc │  account id     resource
              region (empty for global services like IAM)
```

So `arn:aws:iam::123456789012:role/eks-app-role` = an IAM **role** named `eks-app-role` in account `123456789012`. When a trust policy or error references an ARN, walk it field by field — the last segment (`role/…`, `user/…`, `oidc-provider/…`) tells you the resource type.

## Reading a GCP member string

GCP IAM bindings name the principal as `TYPE:IDENTIFIER`:

| Prefix | Means |
| --- | --- |
| `user:alice@example.com` | a human |
| `group:team@example.com` | a Google group |
| `serviceAccount:svc@PROJECT.iam.gserviceaccount.com` | a workload identity (a "robot" account) |
| `principalSet://…` | a *federated* external identity (see below) |

Roles look like `roles/storage.objectViewer` (predefined) or `roles/owner` (basic). A binding = one role + one or more members, attached to a project, folder, or single resource.

## Two kinds of "service account"

This trips up everyone in the Kubernetes lessons:

- A **cloud service account** — a Google SA (`…@…iam.gserviceaccount.com`) or an AWS IAM **role** — is an identity the *cloud* recognises. It holds cloud permissions.
- A **Kubernetes service account (KSA)** is an identity *inside the cluster*, attached to pods.

"Workload Identity" is the plumbing that lets a **KSA** act as a **cloud identity** so your pod can call cloud APIs **without a long-lived key file**. That is the whole point — no secret to leak or rotate.

## OIDC, JWTs, and federation (the CI/CD + workload-identity core)

The trust strings in the IRSA / Workload Identity / GitLab-OIDC steps all rest on the same idea. Learn it once:

- A **JWT** ("JSON Web Token") is a signed piece of JSON with three parts: `header.payload.signature`. The payload holds **claims** — facts about the bearer. Because it's signed by an issuer, a verifier can trust the claims without calling back.
- Claims you will see:
  - `iss` (**issuer**) — who minted the token (e.g. the cluster's OIDC issuer URL, or `gitlab.com`).
  - `sub` (**subject**) — *who this token is about* (e.g. `system:serviceaccount:default:app` or a GitLab `project_path:ref`).
  - `aud` (**audience**) — *who it's for* (e.g. `sts.amazonaws.com`).
- **Federation / token exchange**: instead of storing a cloud key, the workload presents its JWT. The cloud has been told "trust tokens from issuer X, and if the `sub`/`aud` claims match Y, hand back short-lived credentials." No secret is stored anywhere.

This is why the labs create an **OIDC identity provider** and a **trust policy** with exact-match conditions on `sub`/`aud`. When such a step fails with `AccessDenied` / "attribute mismatch", it is almost always the `sub` or `aud` string not matching **exactly**.

### The same idea in each cloud

- **AWS IRSA** — a pod's projected token (`sub = system:serviceaccount:<ns>:<sa>`) is traded via `sts:AssumeRoleWithWebIdentity` for the IAM role's credentials.
- **GKE Workload Identity** — a KSA is bound to a Google SA via the identifier `PROJECT.svc.id.goog[NAMESPACE/KSA]`; the pod asks the node **metadata server** for tokens.
- **Workload Identity *Federation*** (GitLab/GitHub CI → GCP) — an *external* issuer's JWT is mapped to a `principalSet://…/attribute.xxx/…` principal. Note this is a **different** mechanism from in-cluster GKE Workload Identity, even though both are called "workload identity".

## Constraints from above

Individual bindings aren't the whole story — an organisation can cap what *any* identity may do:

- **AWS**: Organizations → OUs → **Service Control Policies (SCPs)**. An SCP sets the *maximum* permissions; even an admin cannot exceed it. Effective permission = IAM **∩** SCP.
- **GCP**: organization → folders → **Org Policy** constraints (e.g. "no public IPs", "no SA keys").

If a lab command is denied even though your IAM looks fine, suspect an SCP / Org Policy above the account.

## Check yourself

- In `arn:aws:iam::111122223333:user/dev`, which field is the account and which is the resource?
- What's the difference between a Kubernetes service account and a cloud service account?
- A GitLab pipeline authenticates to GCP with no stored key. What does it present, and what does GCP check?
- Your IRSA trust policy is correct but the pod still can't assume the role. Which JWT claims would you compare first?

## Go deeper

- [AWS IAM concepts](https://docs.aws.amazon.com/IAM/latest/UserGuide/intro-structure.html)
- [IAM roles for service accounts (IRSA)](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)
- [GCP IAM overview](https://cloud.google.com/iam/docs/overview)
- [GKE Workload Identity](https://cloud.google.com/kubernetes-engine/docs/concepts/workload-identity)
- [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)
