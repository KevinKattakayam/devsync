# Phase 14 — Inbox and notification UI

## Scope

Refined the existing digest-backed inbox without adding or changing a notification pipeline or API. The page now has a responsive header, digest-window summary, textual unread/read badges, activity-category cards, timestamp context, and clearer actions. Supported task-assignment events and other persisted activity remain distinct. Failed automation executions appear in a separate section only when the existing owner-authorized API returns them. Read/unread actions still call the existing per-user endpoints.

Loading, empty, digest-disabled, request-error and membership-revoked states have explicit structure and accessible status/alert messaging. Refresh and retry actions expose pending state; links and controls have keyboard focus outlines. Notification preferences use the shared inputs/buttons and a responsive grid. Their existing copy continues to state that email, push and scheduled delivery are not active.

The event contract has no priority field, so the UI explicitly says priority labels are unavailable and does not invent priority. Assignment activity currently has a generic persisted message, so it links to the workspace task board rather than inventing a task title. Document links retain the authorized document ID and target. No authorization, recipient filtering, source visibility, delivery, read-state or API behavior changed.

## Browser and accessibility evidence

- Four theme/viewport combinations: dark/light at 1440px/390px, using disposable migrated PostgreSQL/Redis services and fixture identities.
- The journey creates persisted document activity and task-assignment events through existing APIs, verifies their labels and destinations, marks events read by keyboard and unread by button, loads the existing digest route, and verifies membership removal returns 403 and clears cached inbox content on reconnect.
- Fourteen screenshots and fourteen matching axe reports are in [`inbox screenshots`](../../ui/after/inbox/phase14-inbox/). No prior inbox-specific baseline was overwritten. Fixture screenshots are not real Clerk/provider acceptance evidence.
- Axe: zero violations, zero incomplete checks and no horizontal overflow across all 14 reports. This automated result is not a manual screen-reader or contrast review; those checks remain outstanding.

## Verification

- `cd frontend && npm run test:components -- tests/inbox.test.tsx` — exit 0; 1 file / 9 tests.
- `E2E_CHROMIUM_PATH=/opt/google/chrome/chrome node tools/ci/browser.mjs inbox` — exit 0; 1 Playwright journey covering the four theme/viewport combinations, real persisted fixture activity, read/unread, source-link destinations, digest-route load and revoked membership.
- `python3 tools/quality/gates.py frontend docs/quality/phase14-inbox` — exit 0 for lint, formatting, strict TypeScript, full tests with coverage and Next.js production build (`--webpack`). Full suite: 9 Node tests and 34 component-test files / 166 tests. The build used the previously permitted subprocess context.
- `node tools/ci/coverage.mjs frontend docs/quality/phase14-inbox/frontend-coverage/coverage-summary.json tools/ci/coverage-baseline.json` — exit 0; statements 56.71%, branches 50.72%, functions 51.40%, lines 58.07%; each meets or exceeds the stored baseline.
- `cd backend && npm run lint && npm run typecheck` — exit 0, including test TypeScript projects.
- Pinned Semgrep TypeScript scan of `backend/src` and `frontend/src` — exit 0; 280 targets, zero findings. Eight partial-parsing warnings were confined to existing, unchanged files.
- `git diff --check` — exit 0.

Machine-readable gate/coverage/security reports, aggregate axe summary and archived raw frontend gate logs are retained beside this record. No production data or provider settings were changed.

## Remaining Phase 14 work

Manual screen-reader/contrast review and live Clerk acceptance remain. The generic assignment message and lack of event priority are backend-contract limitations, not synthesized in the UI. Settings and broader Phase 14 screen review remain. No Phase 15 work started.
