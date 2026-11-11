# Phase 14 — premium document editor UI increment

## Scope

The existing TipTap/Yjs editor remains the source of document behavior. This increment changes only the surrounding interface: title/export header, synchronization metadata grouping, toolbar layout, ProseMirror width/inset, and accessible grouping of selection/export actions. No CRDT schema, provider, WebSocket contract, save/recovery path, permission decision, presence/cursor logic, or editor command changed.

The document title and Markdown/PDF exports now sit in one responsive header. Sync acknowledgement, local persistence, server reconciliation, author and collaborator metadata are grouped below it. The editor body aligns with the title and uses a 72ch desktop reading width. The AI assistant icon action is part of the existing document-tools group, beside the insert/formatting/undo/redo controls; it retains its accessible name, disables while generating, and still opens the existing review-before-apply dialog. Toolbar and selection actions remain absent for read-only members. Missing `role="group"` semantics were added to selection formatting and document exports.

## Before / after artifacts

- Before: the accepted editor captures and review in `docs/ui/after/editor/final/` and `docs/ui/after/editor/REVIEW.md`.
- After: 40 new PNGs and axe JSON reports in `docs/ui/after/editor/phase14-editor/` (dark/light, 1440/390, loading/ready/slash/code/tasks/table/selection/assistant/error, plus 360 empty/read-only states). Existing accepted `final` artifacts were not overwritten.
- Browser identities and document content were fixtures created in disposable local services. This is not real Clerk sign-in or provider-backed AI acceptance.

## Regression coverage

Component tests in `frontend/tests/editor-components.test.tsx` cover the existing real TipTap/Yjs surface, read-only changes, accessible toolbar grouping, keyboard open/arrow selection/activation of a block command, AI assistant action and read-only hiding. The full browser editor path also checks title/content horizontal alignment, one-row mobile toolbar, visible keyboard focus, keyboard slash and formatting actions, table controls, loading and metadata error states, offline reconnect with simultaneous owner/editor updates, viewer enforcement, and empty/read-only 360px layouts.

## Accessibility review

All 40 final axe reports have zero violations. Automated incomplete checks remain: 4 `aria-hidden-focus` occurrences (the existing Radix modal/background treatment), 21 `color-contrast` occurrences where overlap prevents an automatic decision, and 18 `link-in-text-block` occurrences at the shell breadcrumb. No axe rule was disabled. Keyboard focus visibility is asserted in browser tests; this is not a manual screen-reader or complete WCAG certification.

## Commands and results

- Test-first focused component run initially failed because the AI action was not in the document toolbar; after implementation `npm run test:components -- tests/editor-components.test.tsx` — **exit 0**, 5 tests passed.
- `E2E_CHROMIUM_PATH=/opt/google/chrome/chrome E2E_EDITOR_PASS=phase14-editor node tools/ci/browser.mjs editor` — **exit 0**, 6 tests passed. Four full editor journeys cover both themes at 1440/390; one collaborative path verifies actual local multi-context Yjs behavior, offline/reconnect and viewer restriction; the final path covers both themes at 360 for empty/viewer states.
- `python3 tools/quality/gates.py frontend docs/quality/phase14-editor/verified` — all gates **exit 0**: lint, formatting, strict types, tests/coverage, production build. Test totals: 9 Node tests, 34 component-test files / 158 component tests. Collected coverage: 56.36% statements, 49.49% branches, 50.92% functions, 57.78% lines.
- `node tools/ci/coverage.mjs frontend docs/quality/phase14-editor/verified/frontend-coverage/coverage-summary.json tools/ci/coverage-baseline.json` — **exit 0**, no coverage regression; thresholds unchanged.
- Pinned Semgrep scan on the changed editor TypeScript components — **exit 0**, zero findings.
- Two intermediate full-gate runs exposed a Prettier issue and an unsupported Testing Library query option in the new test; both were corrected. The initial failed outputs and final passing outputs are preserved as tar archives with machine-readable summaries under `docs/quality/phase14-editor/`.

## Changed paths

- `frontend/src/app/(dashboard)/workspace/[id]/docs/[docId]/page.tsx`
- `frontend/src/components/editor/tools.tsx`
- `frontend/src/components/workspace/portability-controls.tsx`
- `frontend/src/app/foundation.css`, `frontend/src/app/shell.css`
- `frontend/tests/editor-components.test.tsx`
- `backend/testing/browser/editor.spec.ts`
- `docs/ui/after/editor/phase14-editor/`
- `docs/quality/phase14-editor/`, `docs/PROGRESS.md`, `CHANGELOG.md`

## Remaining Phase 14 work

This is one cohesive editor increment. Dashboard, connected-work detail, inbox, settings and the broader screen-by-screen responsive review remain. The automated incomplete axe items above need manual review. Do not treat this evidence as complete Phase14 acceptance or start Phase15.
