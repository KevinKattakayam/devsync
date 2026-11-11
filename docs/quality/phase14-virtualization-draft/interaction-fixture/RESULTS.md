# Kanban virtualization controls proof — isolated pass

This fixture does not modify production Kanban. It uses 1,000 synthetic tasks, React Virtuoso 4.18.21, the app's shared Radix `Select`, and the actual shared `DrawerContent`/Dialog. The task-title button mirrors the production page's inline accessible name, activation and trigger-ref behavior because the production card is not an extractable component. Moves/deletes and access revocation affect fixture memory only.

## Root causes and fixture fixes

The desktop result was a browser-test synchronization issue. The script pressed Enter immediately after ArrowDown, before Radix had moved its highlight to the target option. The test now waits until the “Done” option has DOM focus and `data-highlighted` before pressing Enter. That state was observed consistently at both widths in two consecutive runs.

The stale active ID was a fixture state bug. After the moved row left the filtered list, Virtuoso's range callback found that focused ID at index `-1` but treated it like an offscreen item, then restored the removed ID as active. The callback now ignores IDs that no longer exist in the current list. The move handler chooses the next task (or previous task at the end) before applying the move, and defers host focus until Radix has closed its portal. The active descendant is emitted only when its row is mounted.

## Results

| Check                                                          | 1440px                                                               | 390px                                                                |
| -------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Fixture data                                                   | 1,000 tasks                                                          | 1,000 tasks                                                          |
| Mounted task rows at start / list end / after all interactions | 8 / 8 / 20                                                           | 8 / 8 / 20                                                           |
| Radix keyboard move selection                                  | ArrowDown highlighted “Done”; Enter moved task                       | ArrowDown highlighted “Done”; Enter moved task                       |
| Data after move                                                | 999 To do, 1 Done; moved row removed; first three IDs remain ordered | 999 To do, 1 Done; moved row removed; first three IDs remain ordered |
| Focus after moved row unmount                                  | Persistent grid host; not `BODY`                                     | Persistent grid host; not `BODY`                                     |
| Active task after move                                         | Task 999 of 999                                                      | Task 999 of 999                                                      |
| `aria-activedescendant`                                        | Absent or references a mounted descendant                            | Absent or references a mounted descendant                            |
| Tab/Shift+Tab through title and Move controls                  | Pass                                                                 | Pass                                                                 |
| Drawer trigger restoration / moved or deleted fallback         | Pass / heading fallback                                              | Pass / heading fallback                                              |
| Simulated revoked access                                       | Drawer closed; 0 task rows                                           | Drawer closed; 0 task rows                                           |
| Viewer restrictions                                            | No Move controls; mutations disabled                                 | No Move controls; mutations disabled                                 |
| Axe violations / incomplete, before and after move             | 0 / 0                                                                | 0 / 0                                                                |

The same browser scenario passed twice at both widths. The virtualized row count is DOM evidence, not a performance benchmark. Axe ran on initial and post-move fixture states; no manual screen-reader review was done. This remains synthetic browser evidence, not a Clerk/live-workspace test. It does not exercise server authorization, CRDT persistence, API failures/undo, or the board's native drag handlers.

## Commands and exit status

- Focused ESLint on the fixture — **0**.
- Frontend `tsc --noEmit --pretty false` — **0**, using a temporary symlink to the existing React Virtuoso 4.18.21 package under `/tmp`; the symlink was removed after verification.
- Focused Prettier check — **0**.
- `node docs/quality/phase14-virtualization-draft/interaction-fixture/check.cjs` — **0** on two consecutive runs; each run exercised 1440px and 390px and ran axe before/after the move.
- Full frontend gates were not run; production files were unchanged.

## Readiness and remaining risks

The isolated Radix move/focus/active-ID interaction now passes and is ready for a **controlled, feature-flagged Kanban integration proof**. It does not establish production readiness: the inline production card and actual `moveTask` persistence, cross-column ordering, server rejection/undo, permission changes, native drag source retention, drawer behavior after real reorder, and screen-reader use must still be verified in a separate integration. Keep this fixture and the existing uncommitted prototype intact until that work is independently accepted.

## Checkpoint verification

After removing `@tanstack/react-virtual@3.14.26` from the production manifest/lockfile, frontend lint, format, types, 34 test files / 175 tests and `npm run build -- --webpack` passed. The package version and isolated setup command are recorded in the compatibility document. The default Kanban browser journey remains 5/5 from the safety-boundary verification. The production build uses the committed default Kanban; this is not acceptance of virtualization.
