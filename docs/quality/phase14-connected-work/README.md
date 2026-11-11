# Phase 14 — Connected-work detail UI

## Scope

Improved the existing decision-receipt detail presentation rather than adding a second work graph. A receipt now presents its source in a distinct **Linked source** panel with document/task type, source title, pinned revision, proposer and acceptance context. Each execution record is a responsive card that labels the relationship or assertion type, explains human-recorded evidence, shows occurred/recorded times, and exposes provenance. Task records link to the existing workspace board; the application has no task-specific detail route. Owner-only GitHub PR linking and evidence access remain unchanged.

Recorded GitHub webhook evidence is labeled with provider and received timestamps, record IDs and available commit context. The UI explicitly says that these are recorded webhook events, not a live GitHub query, and that deployment is not inferred or verified. The local browser verification uses a signed fixture event; it does **not** prove a live GitHub App installation or real provider delivery. No API, WebSocket, relationship model, receipt state machine, role policy or feature flag changed.

The timeline has an explicit empty state, loading/error feedback, duplicate-submit protection, grouped controls, visible focus treatment, wrapping cards and two-column metadata only above the small-screen breakpoint. Viewer restrictions are retained. Related source visibility continues to be enforced by existing APIs.

## Before and after

- Before reference: [existing decision receipt screen](../../ui/after/decision-receipts/final/dark-1440-initial.png), captured before this increment; its receipt content does not provide the new linked-source and execution-evidence hierarchy.
- After: 48 PNG screenshots and matching axe JSON reports under [`connected-work screenshots`](../../ui/after/decision-receipts/phase14-connected-work/), covering dark/light, 1440px/390px, loading, receipt lifecycle, connected-work, viewer and error states. Existing accepted screenshot directories were not overwritten.
- These browser screenshots use fixture identities and disposable local PostgreSQL/Redis services. They are not real Clerk or GitHub acceptance evidence.

## Verification

- `cd frontend && npm run test:components -- tests/execution-timeline.test.tsx tests/decision-receipts.test.tsx` — exit 0; 2 files / 13 tests.
- `E2E_CHROMIUM_PATH=/opt/google/chrome/chrome E2E_DECISIONS_PASS=phase14-connected-work node tools/ci/browser.mjs decisions` — exit 0; 4/4 Playwright journeys. Both themes at 1440px and 390px cover source context, keyboard activation of a linked task-board destination, receipt evidence, viewer read-only behavior and screenshot capture.
- `E2E_CHROMIUM_PATH=/opt/google/chrome/chrome node tools/ci/browser.mjs decision-execution` — exit 0; 1/1 Playwright journey covering linked task and signed local PR fixture evidence with owner/viewer visibility. The fixture does not represent a real GitHub provider event.
- `python3 tools/quality/gates.py frontend docs/quality/phase14-connected-work` — exit 0 for lint, formatting, strict TypeScript, full tests with coverage and Next.js production build (`--webpack`). The suite reports 9 Node tests and 34 component-test files / 163 tests. Build used the previously permitted subprocess context.
- `node tools/ci/coverage.mjs frontend docs/quality/phase14-connected-work/frontend-coverage/coverage-summary.json tools/ci/coverage-baseline.json` — exit 0; statements 56.53%, branches 50.11%, functions 51.12%, lines 57.93%; all meet or exceed the stored baseline.
- `cd backend && npm run lint && npm run typecheck` — exit 0, including test TypeScript projects.
- Pinned Semgrep TypeScript scan of `backend/src` and `frontend/src` — exit 0; 280 targets, zero findings. It emitted five partial-parsing warnings in unrelated existing settings/workspace/snippet/auth-boundary files; none point to files changed in this increment.
- `git diff --check` — exit 0.

Across 48 axe reports there are zero violations and no horizontal overflow at the tested viewport widths. Automated checks left 38 incomplete rule occurrences across 32 reports (48 `aria-hidden-focus` node occurrences and 34 `color-contrast` node occurrences); these need manual review and are **not** treated as passing accessibility checks or WCAG certification. Reports are retained in the screenshot directory. Coverage, gate results, the redacted scan report and aggregate axe summary are alongside this record; raw frontend command output is archived in `frontend-gate-logs.tar.gz`.

## Remaining Phase 14 work

This increment does not add generic backlinks or task deep links because the existing product model has no such route/API. Live Clerk/GitHub acceptance and manual screen-reader/contrast review remain external/manual work. Phase 14 is still in progress; inbox, settings and broader responsive/accessibility review remain. No Phase 15 work started.
