# Phase 14 final accessibility review

## Verdict

**PARTIAL; Phase 14 remains open.** One confirmed production semantics defect in the workspace Activity Stream filters was corrected. Existing fixture-based browser evidence is substantial, but this review could not execute a fresh browser session because the local Testcontainers setup had no container runtime. Manual screen-reader review was not performed. Mandatory large-list virtualization remains unresolved.

## Acceptance matrix

| Workflow                                          | Result                | Evidence and remaining limit                                                                                                                                                                                                                                                                   |
| ------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard and workspace navigation                | PARTIAL               | [Dashboard verification](../phase14-dashboard/README.md) records keyboard, responsive, loading, error, empty and permission fixture journeys at 1440/390 and selected 360px states. Its axe summary has zero violations and 12 focus / 14 contrast incomplete occurrences.                     |
| Kanban task controls and drawer                   | PARTIAL               | Existing [Kanban browser spec](../../../backend/testing/browser/kanban.spec.ts) and retained `docs/ui/after/kanban/` evidence cover moves, drawer and viewer denial. The default experience is unchanged. The virtualization checkpoint is research only; virtualization is not accepted.      |
| Document editor                                   | PARTIAL               | [Editor verification](../phase14-editor/README.md) records keyboard editor commands, collaboration fixture, read-only viewer and responsive states. Axe incomplete focus, contrast and link checks remain unresolved.                                                                          |
| Connected work / decisions                        | PARTIAL               | [Connected-work verification](../phase14-connected-work/README.md) records keyboard source navigation and role fixture journeys. Axe reports zero violations, with incomplete focus and contrast checks; no manual AT review.                                                                  |
| Inbox and notifications                           | PARTIAL               | [Inbox verification](../phase14-inbox/README.md) records read/unread, navigation and revocation fixtures. Axe found zero violations/incomplete checks for its captured states; evidence uses local fixtures.                                                                                   |
| Grounded AI assistant                             | PARTIAL               | [AI assistant verification](../phase14-ai-assistant/README.md) records citation, error, retry and permission fixture journeys. Dialog axe checks have zero violations; one contrast check is incomplete under an overlapping backdrop. Provider and manual AT acceptance are absent.           |
| Workspace settings                                | PARTIAL               | [Settings verification](../phase14-settings-ui/README.md) records role-gated actions, dialogs, retry and responsive states. Axe reports zero violations, with 12 focus and 8 contrast incomplete occurrences.                                                                                  |
| Activity filter accessibility                     | PASS for targeted fix | Filter control now has a named group, mutually exclusive `aria-pressed` state, native button keyboard operation and focus retention. Regression test: `frontend/tests/activity-feed.test.tsx`. New browser case covers light/dark × desktop/mobile but was not executable in this environment. |
| Keyboard, focus, dialogs and screen-reader output | PARTIAL               | Existing fixture journeys test selected keyboard operations and focus restoration. Manual screen-reader and comprehensive keyboard review were not performed.                                                                                                                                  |
| Contrast                                          | PARTIAL               | Prior actual light-theme activity text contrast issue was changed to semantic foreground tokens. Current retained incomplete results do not prove failures: axe could not calculate contrast under overlapping overlays. A fresh full-page measurement and manual review remain.               |
| Responsive layouts                                | PARTIAL               | Prior fixture screenshots/journeys cover desktop 1440px, mobile 390px and selected 360px states. This review's new browser journey did not run.                                                                                                                                                |
| Virtualized large lists                           | FAIL / unresolved     | Original Phase 14 criterion explicitly requires virtualization. TanStack prototype remains lint-incompatible and isolated; production Kanban remains default and unchanged. See [virtualization compatibility](../phase14-virtualization-draft/COMPATIBILITY.md).                              |

## Confirmed issue and correction

The workspace Activity Stream filter buttons changed the visible filter but did not expose which option was selected programmatically. Added `role="group"` with the name “Filter activity events” and `aria-pressed` to each native button. This follows the existing button interaction model and does not change filtering or API behavior. The test was run before the fix and failed because the named group was absent; after implementation it passes and checks keyboard Enter, focus retention, and exclusive selected state.

## Incomplete axe findings

- `aria-hidden-focus` reports target Radix focus guards and the background app shell during modal flows. The recorded status is incomplete, not a violation; existing dialog tests exercise focus trapping and restoration. These results do not establish every screen-reader behavior.
- `color-contrast` reports say the background could not be determined because content is partially obscured by another element. Treat as inconclusive, not pass or failure. The known light-theme activity text contrast defect was previously changed to semantic foreground tokens; a fresh contrast recheck is still needed.
- Editor `link-in-text-block` incomplete results likewise report overlapping content. No confirmed link defect was established from those incomplete records.
- No manual screen-reader, keyboard-only, or contrast audit was performed in this review.

## Verification

- Before-fix regression: `cd frontend && npm run test:components -- --run tests/activity-feed.test.tsx` — exit 1; the named filter group was absent.
- After-fix focused ESLint, Prettier and component test — exit 0; 1 test passed.
- `cd frontend && npm run lint` — exit 0.
- `cd frontend && npm run format:check` — exit 0.
- `cd frontend && npm run typecheck` — exit 0.
- `cd frontend && npm test` — exit 0; 4 Node tests and 35 component-test files / 176 tests passed.
- Coverage run: `QUALITY_COVERAGE=1 QUALITY_COVERAGE_DIRECTORY=/tmp/devsync-phase14-a11y-coverage npx vitest run` — exit 0; statements 57.33%, branches 51.85%, functions 52.10%, lines 58.74%. `node tools/ci/coverage.mjs frontend /tmp/devsync-phase14-a11y-coverage/coverage-summary.json docs/quality/phase14-settings-ui/frontend-coverage/coverage-summary.json` — exit 0; all four measures are at or above the prior Phase 14 settings baseline.
- `cd frontend && npm run build -- --webpack` — initial sandboxed attempt exited 1 at `Could not parse output from TypeScript's --showConfig`; rerun in the permitted subprocess context exited 0 and completed the Next.js production build.
- `cd backend && npx eslint testing/browser/dashboard.spec.ts` — exit 0.
- `cd backend && npx prettier --check testing/browser/dashboard.spec.ts` — exit 0.
- `cd backend && npm run typecheck` — exit 0, including the testing TypeScript project.
- New browser journey attempt exited 1 before browser startup: `Could not find a working container runtime strategy` from Testcontainers. No new screenshots or axe output are claimed.

All existing screenshot baselines and untracked evidence were preserved. Browser identities in prior records are fixtures, not real Clerk acceptance. No production data or provider was used.

## Remaining mandatory acceptance

1. Establish a lint-compatible production virtualization implementation and verify task focus, keyboard operations, native drag, move rollback, permissions and bounded DOM; do not enable the isolated prototype by default.
2. Execute the new activity-feed browser journey and dedicated contrast checks in an environment with the required container runtime.
3. Perform manual keyboard and screen-reader review, including dialogs/focus guards and offscreen/long-content states.
4. Re-review incomplete contrast and link checks with the UI unobscured in both themes and representative responsive widths.
