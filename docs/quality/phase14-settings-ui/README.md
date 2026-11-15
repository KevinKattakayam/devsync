# Phase 14 — Workspace settings UI increment

## Scope and behavior

Grouped the existing workspace settings into clearer areas: usage and feature-flagged automation, member access and invitations, and owner-only GitHub evidence and workspace lifecycle. Added concise descriptions for role scope and recipient-bound invitation behavior. The settings search now includes owner-only GitHub/CI/repository and lifecycle sections, and does not show a false empty state when a feature-flagged automation section matches. Section navigation uses Next.js `Link` with visible focus treatment and returns to an unfiltered view when navigating to a settings anchor.

Existing session, workspace, member, invitation, GitHub and lifecycle API calls, handlers, validation, feature flags and role checks were preserved. Owners retain existing confirmed role/member/invitation and lifecycle actions; editors and viewers still have read-only member access and no owner-only connections/lifecycle panels. No backend, permission, persistence or API contract changes were made. Account-level settings were not redesigned in this increment.

## Verification

- Focused component tests: `cd frontend && npm run test:components -- --run tests/settings.test.tsx` — exit 0, 12 tests. Covers owner/editor/viewer restrictions, purpose grouping, GitHub search/navigation, feature-flagged automation empty-state behavior, denied changes, confirmation, rollback and retry.
- Browser journey: `E2E_CHROMIUM_PATH=/opt/google/chrome/chrome E2E_SETTINGS_PASS=phase14-ui node tools/ci/browser.mjs settings` — exit 0, 6 Playwright tests against disposable local services and fixture identities. Covers desktop/responsive settings, light/dark themes, role-gated UI and API denials, keyboard role-change dialog/focus return, invite/revoke flows, lifecycle/export confirmation, and injected access-load failure/retry. Captures are isolated under [`settings screenshots and axe reports`](../../ui/after/settings/phase14-ui/); existing `initial` and `final` artifacts were not overwritten.
- The new browser folder contains 40 screenshots and 40 axe JSON reports. There were zero axe violations and zero page/main horizontal overflows. Twenty results remain automated-incomplete: 12 `aria-hidden-focus` and 8 `color-contrast` occurrences, mostly in invitation/role dialogs. These require manual accessibility review and are not treated as passes.
- Full frontend gates: `python3 tools/quality/gates.py frontend docs/quality/phase14-settings-ui` — exit 0 for lint, formatting, strict types, tests with coverage and Next.js production build (`--webpack`) in the permitted subprocess context. Full suite: 9 Node tests and 34 component files / 175 tests.
- Coverage comparison: `node tools/ci/coverage.mjs frontend docs/quality/phase14-settings-ui/frontend-coverage/coverage-summary.json docs/quality/phase14-ai-assistant/frontend-coverage/coverage-summary.json` — exit 0. Statements 56.93%, branches 51.56%, functions 51.62%, lines 58.32%; all exceed the previous verified increment.
- Pinned Semgrep TypeScript scan — exit 0, zero findings across 280 targets. Four partial-parsing warnings are in unchanged account-settings, workspace-home, snippets and auth-boundary files; the edited workspace-settings file parsed without warnings. The sanitized report is `semgrep-redacted.json`.
- `git diff --check` — exit 0.

## Limits

Browser roles are local test fixtures, not real Clerk acceptance. Database/API interactions use disposable local services, not production data. GitHub provider state is not live integration verification. The axe incomplete checks and manual screen-reader review remain outstanding. This is one workspace-settings UI increment, not completion of Phase 14. No Phase 15 work started.

Machine-readable gate, coverage, axe and redacted Semgrep summaries are retained beside this record; raw gate logs are not included in the commit. No push, deployment or production-data change occurred.
