# Kanban preparation — standalone browser verification

The task card was extracted into `frontend/src/components/kanban/task-card.tsx`, preserving the native drag element, title trigger, Radix Move control, priority/assignee display and existing Drawer ownership in the page. The page still owns the Yjs optimistic update, `taskApi.move`, undo and refetch-on-failure behavior. `findMoveTarget` resolves the task by ID against the latest rendered board and checks current rendered write/busy state and the destination before calling that existing move path. The server remains authoritative; this does not establish immediate client awareness of permission or board updates that have not yet rendered.

Focused component tests passed for keyboard Radix Move, title activation, native drag event dispatch, viewer controls, Drawer focus restoration, deletion and write revocation between drag start and drop, stale task data, cross-board destinations, and a rejected move followed by a failed refetch. These are jsdom tests; they do not establish a real browser pointer-drag result or a live server/Yjs authorization or concurrency result. A first keyboard test failed because jsdom lacks `scrollIntoView`; a test-only polyfill was added and the final test passed.

Verification:

- Focused ESLint, frontend typecheck and 3 focused component files / 9 tests: exit 0.
- Frontend lint, formatting, strict TypeScript and full tests: exit 0. The final full test run passed 4 Node tests and 38 component files / 185 tests.
- Frontend coverage run and comparison against the Phase 14 settings baseline: exit 0; 60% statements, 54.12% branches, 54.43% functions and 61.42% lines. This coverage run preceded the final additional deletion regression; it used 184 component tests.
- `npm run build -- --webpack`: exit 0 in the permitted subprocess context.
- `node tools/ci/browser.mjs kanban`: exit 1 before browser startup with `Could not find a working container runtime strategy`. The previously documented Docker access limitation remains. The saved pre-refactor browser evidence was not rerun and cannot verify this extraction.

## Standalone browser follow-up

The fixture under `browser-fixture/` imports the actual production `KanbanTaskCard` and `findMoveTarget`, along with the existing shared Drawer. Its board, membership changes and move result are controlled React state; the fixture does not use Yjs, an API, server authorization or the production Kanban page. Chrome at 1440px and 390px performed a real pointer drag/drop, keyboard Radix Move, and Drawer Escape/focus restoration. During active pointer drag, synthetic external deletion and revoked-write changes produced no move, and changed task data was resolved from the latest fixture board. Both initial-state axe reports had zero violations and zero incomplete checks. Exact outcomes are in `browser-fixture/results.jsonl`.

Escape cancelled the native browser drag and produced no drop at either width. The fixture's production-style drag state remained `dragstart` because the existing page has no `onDragEnd` cleanup. This is an observed existing limitation, not a verified cleanup or a change introduced by the extraction. The fixture uses simplified styling and no manual screen-reader review was performed. The backend Testcontainers journey remains required for API, tenant, Yjs and integrated browser acceptance and was not bypassed.

Focused frontend ESLint, formatting, strict TypeScript and the three Kanban component test files / 9 tests passed after the fixture was added. Focused fixture lint and strict types passed; ESLint emitted React/pages discovery messages from running outside the frontend directory. Vite printed unresolved optional `esbuild`/devtools import messages at startup. The standalone Chrome script exited 0. No Virtuoso dependency, flag, virtualization or production API change was added. Phase 14 remains open.
