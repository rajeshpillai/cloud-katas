# Cloud Katas

Cloud Katas is a web-based learning portal for a GCP-to-AWS cloud computing path. It combines structured lesson content, module navigation, diagrams, hands-on exercises, and local progress tracking.

## Current Features

- 18 sequenced learning modules across GCP, shared cloud foundations, and AWS.
- Runnable local labs powered by [floci](https://github.com/floci-io) emulators + kind — no cloud account or cost.
- Full Markdown lesson rendering in the browser.
- Shareable module URLs such as `/modules/gcp-fundamentals`.
- Mermaid architecture diagrams loaded on demand.
- Local progress tracking for modules and exercises.
- Search and provider filters.
- Collapsible sidebar.
- Dark and light mode toggle.
- Responsive layout for desktop, tablet, and mobile.

## Project Structure

```text
.
├── docs
│   ├── agenda.md
│   ├── implementation-plan.md
│   └── lessons
│       ├── 00-template.md
│       ├── index.md
│       ├── aws
│       └── gcp
├── frontend
│   ├── package.json
│   ├── index.html
│   └── src
│       ├── app.tsx
│       ├── components
│       ├── data
│       ├── state
│       └── styles
├── labs
│   ├── docker-compose.yml
│   ├── kind-config.yaml
│   ├── env.sh
│   ├── lab.sh
│   └── readme.md
├── todo.md
└── readme.md
```

## Prerequisites

- Node.js 24 or newer
- npm 11 or newer

## Install

```bash
cd frontend
npm install
```

## Run Locally

```bash
cd frontend
npm run dev
```

Vite prints the local URL. If port `5173` is busy, it will choose the next available port.

## Build

```bash
cd frontend
npm run build
```

The production output is written to `frontend/dist`.

## Preview Production Build

```bash
cd frontend
npm run preview
```

## Smoke Tests

```bash
cd frontend
npm run test:smoke
```

The smoke suite starts a dedicated Vite dev server and checks routing, module visibility, search, theme persistence, sidebar persistence, lesson rendering, and progress persistence.

## Local Labs (floci)

Most lessons can be run **locally and for free** against the [floci](https://github.com/floci-io) cloud emulators plus a local Kubernetes cluster — no cloud account, no billing. Look for the **"Run locally"** badge and setup panel on a module, or the **"Run locally with floci"** block inside its lesson.

### Prerequisites

- **Docker** (running) — runs the floci emulators and the cluster
- **kind** and **kubectl** — for the Kubernetes labs (GKE/EKS/Argo CD/debugging)
- The CLI for whichever path you are on: **`aws`**, **`gcloud`**, and/or **`terraform`**
- ~2 GB free memory for the kind cluster

### Try floci

From the repo root:

```bash
./labs/lab.sh up        # start floci (AWS), floci-gcp, a local registry, and a kind cluster
source labs/env.sh      # point the aws/gcloud CLIs and SDKs at the emulators
```

Then run any lab's commands. For example, the AWS S3 flow works immediately:

```bash
aws s3 mb s3://katas-demo    # AWS_ENDPOINT_URL sends this to floci, not real AWS
aws s3 ls
```

Check health any time, and tear everything down when you are done:

```bash
./labs/lab.sh status
./labs/lab.sh down
```

See [labs/readme.md](labs/readme.md) for the full per-module coverage table (which modules are fully local, partial, or concept-only) and troubleshooting.

## Lesson Content

Lesson source files live in `docs/lessons`.

- `docs/lessons/gcp`: GCP sequence, modules 1-10
- `docs/lessons/aws`: AWS sequence, modules 11-18
- `docs/lessons/00-template.md`: reusable lesson template
- `docs/lessons/index.md`: lesson index

The frontend maps module metadata to lesson files in `frontend/src/data/modules.ts` and loads Markdown content on demand from `frontend/src/data/lesson-content.ts`.

## Development Notes

- All file and folder names should be lowercase and hyphenated.
- Keep generated output such as `frontend/dist` and `frontend/node_modules` out of Git.
- Update `todo.md` when features are completed or new work is identified.
- Prefer small commits at each working milestone.

## Roadmap

Current next items are tracked in `todo.md`.

Near-term priorities:

- Add Playwright smoke tests.
- Prepare static deployment configuration.
