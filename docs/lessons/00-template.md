# Lesson Template

## Overview

Explain what the learner will build or practice and why it matters.

## Estimated Time

- 45-90 minutes

## Prerequisites

- Required previous lessons
- Required local tools
- Required cloud account access

## Learning Objectives

- Objective 1
- Objective 2
- Objective 3

## Core Concepts

- Concept 1: Explain the idea in one or two sentences and connect it to the lab.
- Concept 2: Explain the operational tradeoff, not just the service name.
- Concept 3: Explain what can go wrong and how the learner will observe it.

## Lab

> ### Run locally with floci
>
> Optional, but include it whenever the lab can run against the local emulators (see `labs/`). State how runnable it is (fully / partly local), the setup commands, any endpoint overrides, and what is **not** emulated. Keep the module's `localLab` entry in `frontend/src/data/modules.ts` in sync with this block.
>
> ```bash
> ./labs/lab.sh up        # floci (AWS) + floci-gcp + kind, as needed
> source labs/env.sh      # points aws/gcloud/SDKs at the emulators
> ```
>
> **Not emulated locally:** list the steps that still require a real account.

### 1. Prepare

Set variables, confirm tooling, verify account access, and identify any cost-bearing resources before creating them.

### 2. Build

Create or configure the resource using copy-pasteable commands or manifests.

### 3. Validate

Run checks that prove behavior, not just existence. Prefer a request, log query, state check, IAM test, or rollout check.

## Troubleshooting

- Symptom: likely cause and fix.

## Cleanup

Remove any resources created during the lab and include a validation command that confirms cleanup.

## Checkpoint

- Question or task that confirms the learner can explain what they built.
- Question or task that asks the learner to connect this lesson to the next one.

## Cross-Cloud Callout

For AWS lessons, add a short note that maps the AWS concept to the closest GCP equivalent when useful.

## Further Reading

- Link to relevant official documentation.
