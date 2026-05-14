# Cloud Katas

Cloud Katas is a web-based learning portal for a GCP-to-AWS cloud computing path. It combines structured lesson content, module navigation, diagrams, hands-on exercises, and local progress tracking.

## Current Features

- 18 sequenced learning modules across GCP, shared cloud foundations, and AWS.
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
