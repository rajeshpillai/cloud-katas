# Web Implementation Plan

## Goal

Build a web-based Cloud Computing Learning Path that turns `docs/agenda.md` into an interactive curriculum for learners moving from GCP fundamentals through AWS, Kubernetes, Terraform, GitOps, CI/CD, security, networking, observability, and troubleshooting.

The first version should be useful as a self-guided learning portal: learners can browse modules, track progress, view prerequisites, inspect diagrams, and open hands-on exercises from a browser.

## Product Scope

### Core Experience
- Present the full learning path as a structured module catalog.
- Support GCP and AWS sections with clear progression and prerequisites.
- Provide one detail page per module with objectives, concepts, exercises, resources, and diagrams.
- Render Mermaid diagrams in the browser.
- Track learner progress locally in the browser.
- Provide search and filtering by provider, topic, and completion status.
- Include a responsive layout for desktop, tablet, and mobile.

### Out of Scope for Version 1
- User accounts and server-side authentication.
- Paid course features.
- Cloud sandbox provisioning.
- Automated grading of hands-on exercises.
- Multi-tenant administration.

## Recommended Tech Stack

- Framework: React with Vite.
- Language: TypeScript.
- Styling: CSS modules or plain CSS with design tokens.
- Routing: React Router.
- Markdown/content: Convert the agenda into structured JSON or MDX-like module data.
- Diagrams: Mermaid rendered client-side.
- State: Local storage for progress tracking.
- Testing: Vitest for unit tests, Playwright for basic browser flows.
- Deployment: Static hosting with GitHub Pages, Netlify, Vercel, or Cloudflare Pages.

This can stay fully static for the first version, which keeps the project cheap, simple, and easy to deploy.

## Naming Convention

- All file and folder names must use lowercase hyphenated names.
- Use names like `module-card.tsx`, `progress-meter.tsx`, and `dashboard-page.tsx`.
- Avoid PascalCase, camelCase, spaces, and underscores in file or folder names.
- Keep symbols inside files idiomatic for TypeScript and React; for example, a file named `module-card.tsx` can still export a `ModuleCard` component.

## Information Architecture

### Pages
- `/`: Learning path dashboard.
- `/modules/:slug`: Module detail page.
- `/resources`: Additional documentation and certification links.
- `/progress`: Progress summary and next recommended module.

### Navigation
- Left sidebar on desktop with module list grouped by GCP and AWS.
- Top navigation on smaller screens.
- Breadcrumbs on module detail pages.
- Previous and next module controls.

### Module Data Model

Each module should be represented as structured content:

```ts
type Module = {
  id: number;
  slug: string;
  title: string;
  provider: "gcp" | "aws" | "shared";
  prerequisites: string[];
  objectives: string[];
  concepts: string[];
  exercises: string[];
  diagramTitle?: string;
  mermaid?: string;
  resources?: Resource[];
};

type Resource = {
  label: string;
  url: string;
};
```

## User Experience

### Dashboard
- Show high-level progress across all modules.
- Separate GCP, shared, and AWS sections.
- Display module cards with status, provider, prerequisites, and estimated level.
- Surface the next unlocked module.

### Module Detail
- Show learning objectives first.
- Show prerequisites with links to earlier modules.
- Show key concepts as scannable chips or compact lists.
- Show hands-on exercises as checkable tasks.
- Render Mermaid visual below the conceptual content.
- Include previous, next, and mark-complete controls.

### Progress Tracking
- Store completed modules and completed exercises in `localStorage`.
- Allow resetting progress.
- Show completion percentage by provider and overall.
- Keep progress client-only for version 1.

## Implementation Phases

### Phase 1: Project Foundation
- Initialize Vite React TypeScript app.
- Add React Router.
- Add baseline CSS tokens for color, spacing, typography, and layout.
- Create app shell with responsive navigation.
- Add linting and formatting scripts.

### Phase 2: Content Model
- Convert `docs/agenda.md` into structured module data.
- Preserve all objectives, prerequisites, concepts, exercises, diagrams, resources, best practices, and certifications.
- Add stable slugs for every module.
- Add provider metadata for filtering.

### Phase 3: Core Pages
- Build dashboard page.
- Build module detail page.
- Build resources page.
- Build progress page.
- Add previous and next navigation.

### Phase 4: Interactivity
- Add local progress tracking.
- Add exercise-level checkboxes.
- Add search and filters.
- Add prerequisite status indicators.
- Add reset progress action.

### Phase 5: Diagram Support
- Install and configure Mermaid.
- Render module diagrams safely after page load.
- Add loading and error states for diagrams.
- Verify diagrams on desktop and mobile.

### Phase 6: Quality Pass
- Add unit tests for content helpers and progress logic.
- Add Playwright smoke tests for dashboard, module navigation, search, and progress tracking.
- Check responsive layouts at mobile, tablet, and desktop widths.
- Confirm all external links open correctly.
- Run accessibility checks for keyboard navigation, focus states, labels, and color contrast.

### Phase 7: Deployment
- Add production build script.
- Choose static host.
- Configure base path if deploying under GitHub Pages.
- Add `readme.md` instructions for local development and deployment.
- Publish first version.

## Suggested File Structure

```text
.
├── docs
│   ├── agenda.md
│   └── implementation-plan.md
├── .gitignore
└── frontend
    ├── package.json
    ├── index.html
    ├── src
    │   ├── app.tsx
    │   ├── main.tsx
    │   ├── data
    │   │   ├── modules.ts
    │   │   └── resources.ts
    │   ├── components
    │   │   ├── module-card.tsx
    │   │   ├── module-nav.tsx
    │   │   ├── mermaid-diagram.tsx
    │   │   └── progress-meter.tsx
    │   ├── state
    │   │   └── progress.ts
    │   ├── styles
    │   │   └── global.css
    │   └── test
    │       └── setup.ts
    └── tests
        └── smoke.spec.ts
```

## Acceptance Criteria

- A learner can open the site and understand the full GCP-to-AWS path.
- A learner can navigate to every module from the dashboard or sidebar.
- Module pages show prerequisites, objectives, concepts, exercises, and diagrams.
- Mermaid diagrams render without blocking the rest of the page.
- Progress persists after refreshing the browser.
- Search and filters work across all modules.
- The app builds as a static site.
- Core flows pass automated smoke tests.
- The UI works on desktop and mobile without overlapping text or broken navigation.

## Risks and Mitigations

- Content drift: Keep module data in one structured source and derive pages from it.
- Diagram rendering issues: Wrap Mermaid rendering in a component with error handling.
- Scope creep: Keep accounts, server persistence, and sandbox automation out of version 1.
- Long module pages: Use clear sections and sticky navigation on desktop.
- Broken external links: Add a link-check task before release.

## Initial Milestone

The first milestone should produce a static, navigable learning portal with all agenda content represented as structured data, module detail pages rendered in the browser, Mermaid diagrams working, and local progress tracking available.
