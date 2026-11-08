# Task planning preflight — in progress

Started clean on upgrade/enterprise at35142de. Read root/frontend instructions, current progress/final report, architecture, authorization matrix, task controller/routes/schema, tenant RLS migration, workspace policy, resource mutation tests and Kanban browser tests. No application/schema/test change or provider verification has occurred in this phase.

## Existing implementation

- Board → Column → Task with priority, dueDate instant, assignee and TaskLabel storage: backend/prisma/schema.prisma. Preserve these fields and existing contracts.
- Task tenancy derives through Column/Board, with forced RLS in 20260815000000_phase_3_tenant_rls. Mutations use central active-user/workspace roles and a workspace write lock. task.controller.ts validates active same-workspace assignees and destination columns.
- Reordering normalizes source/target positions within that locked transaction. This provides serialization, but no client revision fence for stale intent or undo. Existing task routes accept absolute position without an expected revision.
- Frontend Kanban has native drag, a keyboard Move combobox, optimistic updates, Undo, priority and date controls. Preserve these interactions and design tokens. Existing browser tests cover keyboard movement, native drag and viewer controls.
- Labels are included in task responses; a complete label management interface is absent. Assignee validation exists server-side, but the current drawer lacks assignment controls. No subtask/blocker/checklist/reviewer workflow, team filters or list/calendar view was found.

## Mutation paths that must share future workflow policy

1. task.controller.ts: create, generic PATCH (including columnId/position), move, delete and column deletion.
2. routes/github-webhook.routes.ts: signed, tenant-scoped webhook directly updates task columns/positions. Existing configured automation must not silently acquire reviewer approval authority.
3. agents/task-completion.agent.ts: derives a completion summary/document/activity from current scoped task data. Its admission must remain consistent with any new explicit completion state.
4. frontend Kanban's Undo sends another legacy move without an expected revision. New conflict handling must refresh authoritative state, retain user intent and avoid overwriting a subsequent collaborator move.
5. Socket.IO kanban:task-moved contract and the existing whole-record Yjs projection must remain compatible. Server task state remains authoritative; a client projection cannot approve work.

## Proposed bounded implementation

Add planning relations and explicit workflow through compatible v2 operations, preserving legacy task fields. Use the existing workspace lock for dependency and hierarchy mutations, with forced tenant RLS, endpoint-binding constraints and database-level cross-workspace validation. Reject self-links and cycles, including concurrent opposite-edge requests. Also reject cycles in the combined completion-prerequisite graph: a parent requiring its child cannot simultaneously block that child. Keep subtask hierarchy and blocker direction explicit and test both graph types and their interaction.

Use revision-checked task/board mutations for reordering and undo. All existing mutation paths must apply planning invariants when planning is enabled; legacy routes and provider automation cannot bypass completion prerequisites. Keep existing behavior for unmigrated/non-enabled boards. Do not rewrite task dates/statuses or infer completion solely from a renamed column.

Build a small task detail extension for parent/subtasks, blockers, checklist, reviewer and existing labels/assignee. Add list/calendar projections and member filtering over authorized board data. Specify calendar-day semantics separately from the legacy datetime field, including UTC-negative/positive zones and DST boundaries; do not reinterpret existing instants silently.

First failing integration cases: cross-workspace/self/cyclic graph edges; simultaneous cycle creation; viewer mutations; inactive/removed reviewer; stale move/undo409; legacy/webhook completion bypass; unmet blockers/checklist/subtasks; concurrent reorder persistence. Then browser task→subtask→dependency→review→complete, keyboard move/undo conflicts, filters and date/calendar behavior. Run full existing gates, real disposable DB/RLS and actual fixture-browser journeys, with provider limitations explicit.

## Pending product authorization decision

No existing reviewer approval policy was found. The user has been asked whether completion requires the assigned reviewer (with a reasoned owner override), any owner/editor, or optional review. This changes who may authorize completion and how GitHub automation is constrained. The recommendation is assigned reviewer approval with an auditable owner override; it is a proposed new policy, not an existing repository requirement or an approval demanded by AGENTS.md.

This record is preflight only. No migration, feature delivery, passing new workflow test, provider success or phase completion is claimed. Continue implementation once the review-authority choice is supplied; do not start another phase or deploy.
