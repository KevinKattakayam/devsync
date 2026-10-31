# Authorization matrix — updated during Phase 1a

Static route-by-route review of every registered REST route and every Socket.io input event. This is not a passing integration-test report. OWNER/EDITOR/VIEWER are database workspace roles; there is no per-document ownership ACL beyond membership. Authz checks do not overcome RLS context failures (G01). Every REST route passes Helmet, configured CORS, parsing, trace and global IP limiter; global limiting is skipped outside production.

## REST and Next route handlers

| Route | Authentication | Permission checks actually present | Validation | Evidence |
|---|---|---|---|---|
| `POST /api/ai/complete` | Clerk + local principal | Workspace membership (VIEWER allowed); balance preflight BEFORE membership | Truthiness checks only; IP AI limiter | `backend/src/routes/ai.routes.ts:10` |
| `POST /api/auth/sync` | Clerk getAuth or verified bearer fallback | Self | No body schema / ID format validation | `backend/src/routes/auth.routes.ts:10` |
| `GET /api/auth/me` | Clerk + local principal | Self | No body schema / ID format validation | `backend/src/routes/auth.routes.ts:11` |
| `PATCH /api/auth/me` | Clerk + local principal | Self; strict profile allowlist at middleware and controller (D01 fixed) | Zod body | `backend/src/routes/auth.routes.ts:12` |
| `GET /api/documents/:id` | Clerk + local principal | Document -> membership; write excludes VIEWER | No body schema / ID format validation | `backend/src/routes/document.routes.ts:10` |
| `PATCH /api/documents/:id` | Clerk + local principal | Document -> membership; write excludes VIEWER | Zod body with content:any | `backend/src/routes/document.routes.ts:11` |
| `DELETE /api/documents/:id` | Clerk + local principal | Document -> membership; write excludes VIEWER | No body schema / ID format validation | `backend/src/routes/document.routes.ts:12` |
| `POST /api/webhooks/github` | Repository-specific HMAC signature | Target column bound; task-key lookup NOT tenant-bound (G08) | Envelope Zod, action fields largely any; delivery ID dedup | `backend/src/routes/github-webhook.routes.ts:26` |
| `POST /api/workspaces/:id/documents/ingest` | Clerk + local principal | Workspace member excluding VIEWER, after buffering | Multer 25MB, MIME allowlist; no filename/page/image limits | `backend/src/routes/ingestion.routes.ts:42` |
| `POST /scim/v2/Users` | SHA-256 bearer token lookup + timingSafeEqual | Token workspace; external identity composite bound; global User edited (C04) | Zod custom User or partial; not standard SCIM Operations envelope | `backend/src/routes/scim.routes.ts:38` |
| `PATCH /scim/v2/Users/:externalId` | SHA-256 bearer token lookup + timingSafeEqual | Token workspace; external identity composite bound; global User edited (C04) | Zod custom User or partial; not standard SCIM Operations envelope | `backend/src/routes/scim.routes.ts:53` |
| `DELETE /scim/v2/Users/:externalId` | SHA-256 bearer token lookup + timingSafeEqual | Token workspace; external identity composite bound; global User edited (C04) | External ID lookup | `backend/src/routes/scim.routes.ts:68` |
| `POST /api/snippets/execute` | Clerk + local principal | Execution disabled for everyone with503 (E01 contained) | No body schema / ID format validation | `backend/src/routes/snippet.routes.ts:10` |
| `PATCH /api/snippets/:snippetId` | Clerk + local principal | Snippet -> workspace membership; excludes VIEWER | Zod body | `backend/src/routes/snippet.routes.ts:11` |
| `DELETE /api/snippets/:snippetId` | Clerk + local principal | Snippet -> workspace membership; excludes VIEWER | No body schema / ID format validation | `backend/src/routes/snippet.routes.ts:12` |
| `POST /api/webhooks/stripe` | Stripe signature on raw body | Workspace selected from signed metadata/customer/subscription | Stripe verified event; no replay/order ledger | `backend/src/routes/stripe.webhook.ts:8` |
| `GET /api/superadmin/metrics` | Service token OR Clerk + DB SUPER_ADMIN | Global administrative authority | N/A | `backend/src/routes/superadmin.routes.ts:23` |
| `POST /api/superadmin/workspaces/:workspaceId/kill-switch` | Service token OR Clerk + DB SUPER_ADMIN | Global administrative authority | Zod reason | `backend/src/routes/superadmin.routes.ts:37` |
| `POST /api/tasks/boards/:boardId/columns` | Clerk + local principal | NONE: arbitrary board ID (D06) | Zod body | `backend/src/routes/task.routes.ts:14` |
| `PATCH /api/tasks/columns/:columnId` | Clerk + local principal | Column/task -> workspace membership; excludes VIEWER | Zod body | `backend/src/routes/task.routes.ts:15` |
| `DELETE /api/tasks/columns/:columnId` | Clerk + local principal | Column/task -> workspace membership; excludes VIEWER | No body schema / ID format validation | `backend/src/routes/task.routes.ts:16` |
| `POST /api/tasks/columns/:columnId/tasks` | Clerk + local principal | Column/task -> workspace membership; excludes VIEWER; assigneeId not membership-bound | Zod body | `backend/src/routes/task.routes.ts:19` |
| `PATCH /api/tasks/tasks/:taskId` | Clerk + local principal | Column/task -> workspace membership; excludes VIEWER; destination same-workspace check; assigneeId not membership-bound | Zod body | `backend/src/routes/task.routes.ts:20` |
| `DELETE /api/tasks/tasks/:taskId` | Clerk + local principal | Column/task -> workspace membership; excludes VIEWER | No body schema / ID format validation | `backend/src/routes/task.routes.ts:21` |
| `PATCH /api/tasks/tasks/:taskId/move` | Clerk + local principal | Column/task -> workspace membership; excludes VIEWER; destination same-workspace check | Zod body | `backend/src/routes/task.routes.ts:22` |
| `POST /api/workspaces` | Clerk + local principal | Authenticated creator becomes OWNER | Zod body | `backend/src/routes/workspace.routes.ts:30` |
| `GET /api/workspaces` | Clerk + local principal | Own membership filter | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:31` |
| `GET /api/workspaces/:id` | Clerk + local principal | Any workspace member | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:32` |
| `GET /api/workspaces/:id/activities` | Clerk + local principal | Any workspace member | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:33` |
| `GET /api/workspaces/:id/search` | Clerk + local principal | Any workspace member | Zod query (q,limit) | `backend/src/routes/workspace.routes.ts:34` |
| `PATCH /api/workspaces/:id` | Clerk + local principal | OWNER | Zod body | `backend/src/routes/workspace.routes.ts:35` |
| `DELETE /api/workspaces/:id` | Clerk + local principal | OWNER | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:36` |
| `POST /api/workspaces/:id/invite` | Clerk + local principal | OWNER | Zod body | `backend/src/routes/workspace.routes.ts:39` |
| `PATCH /api/workspaces/:id/members/:memberId` | Clerk + local principal | OWNER of URL workspace; target memberId NOT bound (D05) | Zod body | `backend/src/routes/workspace.routes.ts:40` |
| `DELETE /api/workspaces/:id/members/:memberId` | Clerk + local principal | OWNER of URL workspace; target memberId NOT bound (D05) | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:41` |
| `GET /api/workspaces/:id/github-repositories` | Clerk + local principal | OWNER | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:44` |
| `POST /api/workspaces/:id/github-repositories` | Clerk + local principal | OWNER | Zod body | `backend/src/routes/workspace.routes.ts:45` |
| `PATCH /api/workspaces/:id/github-repositories/:repositoryId` | Clerk + local principal | OWNER; target repository checked against workspace | Zod body | `backend/src/routes/workspace.routes.ts:46` |
| `DELETE /api/workspaces/:id/github-repositories/:repositoryId` | Clerk + local principal | OWNER; target repository checked against workspace | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:47` |
| `GET /api/workspaces/:id/documents` | Clerk + local principal | Any workspace member | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:50` |
| `POST /api/workspaces/:id/documents` | Clerk + local principal | OWNER / EDITOR; parentId NOT bound (D08) | Zod body | `backend/src/routes/workspace.routes.ts:51` |
| `GET /api/workspaces/:id/boards` | Clerk + local principal | Any workspace member | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:54` |
| `POST /api/workspaces/:id/boards` | Clerk + local principal | OWNER / EDITOR | Zod body | `backend/src/routes/workspace.routes.ts:55` |
| `GET /api/workspaces/:id/snippets` | Clerk + local principal | Any workspace member | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:58` |
| `POST /api/workspaces/:id/snippets` | Clerk + local principal | OWNER / EDITOR | Zod body | `backend/src/routes/workspace.routes.ts:59` |
| `GET /api/health` | Public | None (operational endpoint) | N/A | `backend/src/app.ts:54` |
| `GET /api/ready` | Public | None (operational endpoint) | N/A | `backend/src/app.ts:60` |
| `GET /api/auth/reset (Next)` | Public | No user/workspace check; arbitrary redirect and cookie clearing | No redirect allowlist | `frontend/src/app/api/auth/reset/route.ts:4` |
| `POST /api/superadmin/workspaces/:workspaceId/kill-switch (Next)` | Clerk currentUser | publicMetadata.systemRole=SUPER_ADMIN; forwards service token | Zod reason; encoded workspace ID | `frontend/src/app/api/superadmin/workspaces/[workspaceId]/kill-switch/route.ts:7` |

## Socket.io input events

All connections require a Clerk token and local user lookup; isActive is not checked. Event rate buckets are per socket/event type, not per tenant/user. Only the following client events are registered.

| Event | Membership | Role/resource binding | Validation | Evidence |
|---|---|---|---|---|
| `workspace:join` | NONE | No role or target-resource check | Zod envelope; task/cursor arbitrary where present | `backend/src/socket/presence.handler.ts:68` |
| `workspace:leave` | NONE | No role or target-resource check | Zod envelope; task/cursor arbitrary where present | `backend/src/socket/presence.handler.ts:105` |
| `cursor:update` | NONE | No role or target-resource check | Zod envelope; task/cursor arbitrary where present | `backend/src/socket/presence.handler.ts:128` |
| `disconnect` | Not applicable | Disconnect cleans buckets/presence; no authz needed | No payload domain schema | `backend/src/socket/presence.handler.ts:140` |
| `kanban:task-moved` | NONE | No role or target-resource check | Zod envelope; task/cursor arbitrary where present | `backend/src/socket/kanban.handler.ts:39` |
| `kanban:task-created` | NONE | No role or target-resource check | Zod envelope; task/cursor arbitrary where present | `backend/src/socket/kanban.handler.ts:55` |
| `kanban:task-updated` | NONE | No role or target-resource check | Zod envelope; task/cursor arbitrary where present | `backend/src/socket/kanban.handler.ts:67` |
| `kanban:task-deleted` | NONE | No role or target-resource check | Zod envelope; task/cursor arbitrary where present | `backend/src/socket/kanban.handler.ts:79` |
| `error` | Not applicable | Logs incoming error only | No payload domain schema | `backend/src/socket/index.ts:89` |
| `disconnect` | Not applicable | Disconnect cleans buckets/presence; no authz needed | No payload domain schema | `backend/src/socket/index.ts:93` |

Outbound-only notifications: workspace:users, cursor:updated, activity:new, workspace:suspended, error, plus the four relayed kanban:task-* events. Socket.io connection/disconnect are framework events. No document:join/write event remains on Socket.io; cursor:update targets document:<id> but no corresponding Socket.io document join handler exists. Server joins user:<localUserId> automatically for SCIM disconnects.

## Hocuspocus protocol

| Room / operation | Authentication | Membership/role/resource check | Evidence |
|---|---|---|---|
| document:<workspace>:<document>, read/update/awareness | Clerk token | Compares actual document workspace to room prefix; membership+active user/tenant; viewer read-only (D02/D07 fixed) | backend/src/services/yjs.service.ts:52 |
| bare document ID, read/update | Clerk token | Rejects missing/archived document; resolves membership; viewer read-only. RLS-safe ID resolution still pending G01 | backend/src/services/yjs.service.ts:81 |
| kanban:<workspace>, workspace:<workspace> | Clerk token | Membership+active user/tenant; viewer read-only; no durable server store for these room types | backend/src/services/yjs.service.ts:92 |
| Existing connection after revoke/expiry/suspend | Initial Clerk token | No ongoing expiry/membership/active-user enforcement or cross-transport eviction | backend/src/services/yjs.service.ts:57 |

## Interpretation

Workspace-owner checks are correctly present on workspace mutations, invitations and repository configuration, and document/snippet mutations derive workspace from their resource. Task moves check same-workspace destinations. Critical bypasses D01/D02 are repaired by group1 regressions; missing relationship checks D05/D06/D08 and event checks D03/D04/D07 remain. Task assignee IDs are globally valid User IDs, without ensuring assignment membership; validate tenant assignment as part of Phase 1. Role update accepts OWNER and can demote the last owner; no single-owner/last-owner transaction invariant. SCIM token authority is workspace-wide (including assigning OWNER) rather than normal member role authority.
