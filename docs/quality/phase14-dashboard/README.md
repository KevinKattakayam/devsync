# Phase 14 — dashboard and workspace navigation increment

## Scope

Moved the existing workspace links from the bottom of the activity column to a prominent, responsive “Your workspaces” section below the dashboard controls. Each link now shows the current membership role, has a meaningful accessible name and a visible keyboard focus outline. The section follows the existing workspace scope filter, so the displayed destination list matches the selected dashboard view. It uses the existing authorized dashboard response; it adds no request, route, permission or backend behavior. Existing owner/editor document-creation gating and workspace creation remain unchanged.

## Before and after

- Before: existing accepted dashboard captures in `docs/ui/after/dashboard/initial/`, especially `light-390-ready.png` and `dark-1440-ready.png`.
- After: 22 screenshots and 22 axe JSON reports in `docs/ui/after/dashboard/phase14-navigation/` (light/dark, 1440/390, loading/ready/dialog/error states, and 360px empty-account states). These were captured in a separate directory; accepted initial/final images and shell baselines were not changed.
- Browser users and workspace content are fixture data on disposable local services. No real Clerk sign-in is represented.

## Behavior and accessibility

The Playwright journey verifies each workspace card links to its existing `/workspace/{id}` route, is keyboard-focusable and navigates with Enter. It verifies the selected workspace appears in the desktop sidebar and in the mobile navigation drawer, then returns to the dashboard and exercises its existing workspace filter, workspace creation dialog, retry/error states and viewer limitations. Viewports cover 1440px and 390px in both themes; the existing empty-account flow covers 360px.

The focused component test checks accessible workspace link names, destinations and membership roles. The existing Radix workspace filter is exercised in the browser journey; jsdom does not implement the pointer-capture and scrolling APIs used by Radix Select, so the unit test does not simulate that control.

Across 22 axe reports there are **zero violations**. Automated incomplete checks remain: 12 `aria-hidden-focus` and 14 `color-contrast` node occurrences. They are documented as needing manual review and are not treated as passed checks or WCAG certification.

## Verification

- `cd frontend && npm run test:components -- tests/dashboard.test.tsx` — exit 0; 10 tests passed.
- `E2E_CHROMIUM_PATH=/opt/google/chrome/chrome E2E_DASHBOARD_PASS=phase14-navigation node tools/ci/browser.mjs dashboard` — exit 0; 6 Playwright tests passed using disposable migrated services and fixture identities.
- `python3 tools/quality/gates.py frontend docs/quality/phase14-dashboard` — exit 0 for lint, formatting, strict types, frontend tests/coverage and production build. Totals: 9 Node tests, 34 component-test files / 159 tests. Build ran with the previously verified permitted subprocess context.
- `node tools/ci/coverage.mjs frontend docs/quality/phase14-dashboard/frontend-coverage/coverage-summary.json tools/ci/coverage-baseline.json` — exit 0; thresholds unchanged. Coverage: 56.44% statements, 49.56% branches, 51.12% functions, 57.80% lines.
- Pinned Semgrep TypeScript scan on `backend/src` and `frontend/src` — exit 0, zero findings across 280 targets. Semgrep emitted five `PartialParsing` warnings in unrelated existing settings/workspace/snippet/auth-boundary files; no warning points to the files changed in this increment.

Raw frontend gate output, machine-readable gate results, coverage comparison, redacted Semgrep report and axe summary are retained beside this record. No backend/API, authentication, route, workspace context or authorization implementation changed.

## Remaining Phase 14 work

This is one focused dashboard/navigation increment, not Phase 14 completion. The editor and Kanban increments are separately verified. Connected-work detail, inbox, settings, broader responsive review and manual screen-reader review remain. No Phase 15 work started.
