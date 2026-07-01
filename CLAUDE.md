# CLAUDE.md

Guidance for working in this repository.

Refer: LOOPS.md for the engineering principles and working discipline to follow in this repo.

## What this is

Cloud Katas is a web-based learning portal for a **GCP → AWS** cloud-computing path. It pairs structured Markdown lessons with a React SPA (module navigation, Mermaid diagrams, local progress tracking) and a set of runnable local labs backed by [floci](https://github.com/floci-io) emulators + a kind cluster.

- **Lesson content** lives in `docs/lessons/` (plain Markdown — the source of truth).
- **The portal** is a Vite + React + TypeScript app in `frontend/`.
- **Local labs** are scripted in `labs/`.

## Repository layout

```
docs/lessons/
  00-template.md          # canonical lesson structure — copy this for new lessons
  index.md                # lesson index + primers links
  aws/ 01..08             # AWS sequence
  gcp/ 01..10             # GCP sequence
  primers/                # fundamentals brush-up docs (networking, identity-and-iam, cli-and-data-formats)
  sample-app/             # the workload deployed across several lessons
frontend/
  src/app.tsx             # routes + LearningPortal (the main view)
  src/components/         # lesson-content, primer-page, status-bar, module-nav, mermaid-diagram, ...
  src/data/modules.ts     # module metadata (slug, prerequisites, objectives, concepts, exercises, localLab, mermaid)
  src/data/lesson-content.ts  # loads lesson Markdown via import.meta.glob over docs/lessons/**/*.md
  tests/smoke.spec.ts     # Playwright smoke suite
labs/                     # lab.sh (up/down/status), env.sh, docker-compose.yml, kind-config.yaml
scripts/deploy-pages.sh   # build + publish frontend to the gh-pages branch
```

## Common commands (run from `frontend/`)

```bash
npm install
npm run dev          # Vite dev server (also ../dev.sh from repo root)
npm run build        # tsc --noEmit && vite build  → frontend/dist
npm run preview      # serve the production build
npm run test:smoke   # Playwright smoke tests (spins its own dev server)
```

Deploy the built site to GitHub Pages from the repo root: `bash scripts/deploy-pages.sh` (see readme for `BASE_PATH` / branch overrides).

## Content conventions

- **Follow `docs/lessons/00-template.md`.** Every lesson has: Overview, Estimated Time, Prerequisites (incl. a **"Background you need"** brush-up box linking the relevant `primers/`), Cost Notice, Learning Objectives, Core Concepts, Lab (Prepare → Build → Validate, with an optional floci "Run locally" block), Validate, Troubleshooting, Cleanup, Cross-Cloud Callout, Checkpoint, Further Reading.
- **Prerequisites should not assume unexplained fundamentals.** The rule for this project: *a topic is only hard because the idea is hard, never because a prerequisite was skipped.* If a lesson leans on CIDR/IP/ports, IAM/OIDC/ARNs, or shell/JSON/YAML idioms, link the matching primer in the "Background you need" box rather than explaining inline. The primers + these boxes are the mechanism that enforces this rule — reach for them instead of inlining a fundamentals detour.
- **Primers** (`docs/lessons/primers/`) are the shared brush-up docs. Add to an existing one before creating a new one.
- **Relative links between docs** are the norm and are routed in the SPA (see below): use `01-aws-fundamentals.md`, `../gcp/02-...md`, `../primers/networking.md`.
- When you add or renumber a lesson, keep **three places in sync**: the Markdown file, `docs/lessons/index.md`, and `frontend/src/data/modules.ts` (`lessonPaths` map + the module definition, incl. its `localLab`). Keep a module's `localLab` entry consistent with the lesson's floci block.
- All file/folder names are **lowercase and hyphenated**.

## Frontend notes

- Routes: `/modules/:slug` (LearningPortal) and `/primers/:name` (PrimerPage). `/` and unknown paths redirect to the first module.
- **Markdown link routing:** `LessonContent` (and `PrimerPage`) render Markdown with a custom `<a>` renderer (`frontend/src/components/lesson-content.tsx`). It resolves relative `.md` links against the current doc's path and navigates in-app: lesson files → `/modules/:slug` (via `slugByLessonPath`), primer files → `/primers/:name`. External/`http(s)`/`#` links are left alone. Pass `basePath` (the doc's `docs/lessons/...md` path) so resolution works.
- **App version & build date** appear in the global **status bar** (`src/components/status-bar.tsx`). The version is single-sourced from `frontend/package.json` `version`; the build date is stamped at build time (UTC `YYYY-MM-DD`). Both are injected via `vite.config.ts` `define` as `__APP_VERSION__` / `__BUILD_DATE__` (declared in `src/vite-env.d.ts`). Bump the version by editing `package.json` only; the date refreshes on every `npm run build`.
- GitHub Pages SPA deep-linking relies on `frontend/public/404.html` (redirect trick) — it is route-agnostic, so new routes work without changes.

## Known issues / gotchas

- Two smoke tests (`redirects to the first module...`, `opens a direct module route`) are **pre-existing failures**: they assert a single `level:1` heading, but each page renders two h1s (the hero title *and* the lesson's own `# Title` Markdown heading). Fixing means either scoping the assertions or not rendering the leading Markdown h1 — a product decision, not yet made.
- Lesson labs create real cloud resources in later modules; respect each lesson's Cost Notice and Cleanup sections. Prefer the floci local path when validating lab steps.

## House rules

- Prefer small commits at working milestones. Update `todo.md` when features land or new work is identified.
- Keep generated output (`frontend/dist`, `frontend/node_modules`) out of Git.
- Repo-root docs to know: `CLAUDE.md` (this file — project guide), `LOOPS.md` (engineering principles and working discipline), `readme.md` (setup/deploy), `todo.md` (open work).
