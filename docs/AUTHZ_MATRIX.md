> Phase1a status: D01/D02/E01 and D03–D08 application boundaries are repaired and regression-tested; D08 also has a tested composite database constraint. This matrix is not a claim that full Phase1a centralization is complete. Phase1c closes ongoing transport workspace revocation and D09 assignment checks for converted REST handlers. Broader G01 tenant-context coverage, Provider identity provisioning/linking remains open; current actor/service/maintenance policies and limits are listed below. See PROGRESS.md for the complete scope ledger.

# Authorization matrix — updated during Phase 1c

Static route-by-route review of every registered REST route and every Socket.io input event. This is not a passing integration-test report. OWNER/EDITOR/VIEWER are database workspace roles; there is no per-document ownership ACL beyond membership. Authz checks do not overcome RLS context failures (G01). Protected application routers retain Helmet, configured CORS, parsing, request correlation and the production global IP limiter. Operational health/readiness and metrics are mounted before parsing/auth/rate limiting. Legacy route evidence line offsets below describe the pre-format Phase1a tree (0cee996); permission behavior remains as listed, with new transport/operational exceptions documented below.

## Phase1b aliases and operational exceptions

Every application `/api/...` router below is also mounted at `/api/v1/...` with the same authorization middleware and handlers. Legacy aliases remain supported; see API_OPERATIONS.md. SCIM keeps `/scim/v2`.

| Route | Authority and checks | Evidence |
|---|---|---|
| `GET /api/health`, `/api/v1/health` | Anonymous liveness, no workspace data | backend/src/routes/health.routes.ts |
| `GET /api/ready`, `/api/v1/ready` | Anonymous bounded DB/Redis/config readiness; 503 while draining | backend/src/routes/health.routes.ts |
| `GET /api/docs` | Anonymous route/body contract metadata; no workspace records | backend/src/app.ts, backend/src/openapi.ts |
| `GET /metrics` | Exact private bearer secret, at least32 characters; 404 when disabled, 403 on mismatch | backend/src/observability/metrics.ts |

## REST and Next route handlers

| Route | Authentication | Permission checks actually present | Validation | Evidence |
|---|---|---|---|---|
| `POST /api/ai/complete` | Clerk + local principal | Central active-user/tenant membership (VIEWER allowed); membership BEFORE balance/provider; usage rechecks actor policy | Bounded Zod body; IP AI limiter; untrusted context fields; provider timeout | `backend/src/routes/ai.routes.ts:10` |
| `POST /api/auth/sync` | Clerk getAuth or verified bearer fallback | Self | No body schema / ID format validation | `backend/src/routes/auth.routes.ts:10` |
| `GET /api/auth/me` | Clerk + local principal | Self | No body schema / ID format validation | `backend/src/routes/auth.routes.ts:11` |
| `PATCH /api/auth/me` | Clerk + local principal | Central active principal with exclusive user-row lock; strict profile allowlist at middleware and controller | Zod body | `backend/src/routes/auth.routes.ts:12` |
| `GET /api/documents/:id` | Clerk + local principal | Central resource policy in tenant transaction; active principal, unsuspended tenant; read accepts VIEWER, writes require OWNER/EDITOR | No body schema / ID format validation | `backend/src/routes/document.routes.ts:10` |
| `PATCH /api/documents/:id` | Clerk + local principal | Central resource policy in tenant transaction; active principal, unsuspended tenant; read accepts VIEWER, writes require OWNER/EDITOR | Bounded JSON rich text, safe URL checks; optional revision conflicts; canonical Yjs replacement | `backend/src/routes/document.routes.ts:11` |
| `DELETE /api/documents/:id` | Clerk + local principal | Central resource policy in tenant transaction; active principal, unsuspended tenant; read accepts VIEWER, writes require OWNER/EDITOR | No body schema / ID format validation | `backend/src/routes/document.routes.ts:12` |
| `POST /api/webhooks/github` | Repository-specific HMAC signature | Central current repository HMAC, active tenant and bound column/task transaction; delivery record commits with DB effects | Bounded typed Zod envelope/action fields; PostgreSQL delivery fence | `backend/src/routes/github-webhook.routes.ts:26` |
| `POST /api/workspaces/:id/documents/ingest` | Clerk + local principal | Central writer policy before buffering, before extraction and inside canonical write transaction | Multer25MB/MIME allowlist; filename255 and extracted text256KiB; OCR isolation/page/image budgets remain open | `backend/src/routes/ingestion.routes.ts:42` |
| `POST /scim/v2/Users` | SHA-256 bearer token lookup + timingSafeEqual | Central scoped token transaction; membership/link only, no global profile mutation; OWNER changes forbidden | Zod custom User or partial; not standard SCIM Operations envelope | `backend/src/routes/scim.routes.ts:38` |
| `PATCH /scim/v2/Users/:externalId` | SHA-256 bearer token lookup + timingSafeEqual | Central scoped token transaction; membership/link only, no global profile mutation; OWNER changes forbidden | Zod custom User or partial; not standard SCIM Operations envelope | `backend/src/routes/scim.routes.ts:53` |
| `DELETE /scim/v2/Users/:externalId` | SHA-256 bearer token lookup + timingSafeEqual | Central scoped token transaction; membership/link only, no global profile mutation; OWNER changes forbidden | External ID lookup | `backend/src/routes/scim.routes.ts:68` |
| `POST /api/snippets/execute` | Clerk + local principal | Execution disabled for everyone with503 (E01 contained) | No body schema / ID format validation | `backend/src/routes/snippet.routes.ts:10` |
| `PATCH /api/snippets/:snippetId` | Clerk + local principal | Central resource policy in tenant transaction; active user/tenant; OWNER/EDITOR | Zod body | `backend/src/routes/snippet.routes.ts:11` |
| `DELETE /api/snippets/:snippetId` | Clerk + local principal | Central resource policy in tenant transaction; active user/tenant; OWNER/EDITOR | No body schema / ID format validation | `backend/src/routes/snippet.routes.ts:12` |
| `POST /api/webhooks/stripe` | Stripe signature on raw body | Workspace selected from signed metadata/customer/subscription | Stripe verified event; no replay/order ledger | `backend/src/routes/stripe.webhook.ts:8` |
| `GET /api/superadmin/metrics` | Service token OR Clerk + DB SUPER_ADMIN | Global administrative authority | N/A | `backend/src/routes/superadmin.routes.ts:23` |
| `POST /api/superadmin/workspaces/:workspaceId/kill-switch` | Service token OR Clerk + DB SUPER_ADMIN | Global administrative authority | Zod reason | `backend/src/routes/superadmin.routes.ts:37` |
| `POST /api/tasks/boards/:boardId/columns` | Clerk + local principal | Central transactional policy; board rechecked in authorized tenant; OWNER/EDITOR | Zod body | `backend/src/routes/task.routes.ts:14` |
| `PATCH /api/tasks/columns/:columnId` | Clerk + local principal | Central transactional resource/column policy; active user/tenant; OWNER/EDITOR | Zod body | `backend/src/routes/task.routes.ts:15` |
| `DELETE /api/tasks/columns/:columnId` | Clerk + local principal | Central transactional resource/column policy; active user/tenant; OWNER/EDITOR | No body schema / ID format validation | `backend/src/routes/task.routes.ts:16` |
| `POST /api/tasks/columns/:columnId/tasks` | Clerk + local principal | Central transactional resource policy; OWNER/EDITOR; active assignee membership tenant-bound | Zod body | `backend/src/routes/task.routes.ts:19` |
| `PATCH /api/tasks/tasks/:taskId` | Clerk + local principal | Central transactional resource policy; OWNER/EDITOR; destination and active assignee membership tenant-bound | Zod body | `backend/src/routes/task.routes.ts:20` |
| `DELETE /api/tasks/tasks/:taskId` | Clerk + local principal | Central transactional resource/column policy; active user/tenant; OWNER/EDITOR | No body schema / ID format validation | `backend/src/routes/task.routes.ts:21` |
| `PATCH /api/tasks/tasks/:taskId/move` | Clerk + local principal | Central transactional resource policy; OWNER/EDITOR; destination tenant-bound; atomic ordering | Zod body | `backend/src/routes/task.routes.ts:22` |
| `POST /api/workspaces` | Clerk + local principal | Authenticated creator becomes OWNER | Zod body | `backend/src/routes/workspace.routes.ts:30` |
| `GET /api/workspaces` | Clerk + local principal | Own membership filter | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:31` |
| `GET /api/workspaces/:id` | Clerk + local principal | Any workspace member | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:32` |
| `GET /api/workspaces/:id/activities` | Clerk + local principal | Any workspace member | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:33` |
| `GET /api/workspaces/:id/search` | Clerk + local principal | Any workspace member | Zod query (q,limit) | `backend/src/routes/workspace.routes.ts:34` |
| `PATCH /api/workspaces/:id` | Clerk + local principal | OWNER | Zod body | `backend/src/routes/workspace.routes.ts:35` |
| `DELETE /api/workspaces/:id` | Clerk + local principal | OWNER | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:36` |
| `POST /api/workspaces/:id/invite` | Clerk + local principal | OWNER | Zod body | `backend/src/routes/workspace.routes.ts:39` |
| `PATCH /api/workspaces/:id/members/:memberId` | Clerk + local principal | OWNER of URL workspace; target member workspace checked and mutation predicate bound (D05 repaired) | Zod body | `backend/src/routes/workspace.routes.ts:40` |
| `DELETE /api/workspaces/:id/members/:memberId` | Clerk + local principal | OWNER of URL workspace; target member workspace checked and mutation predicate bound (D05 repaired) | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:41` |
| `GET /api/workspaces/:id/github-repositories` | Clerk + local principal | OWNER | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:44` |
| `POST /api/workspaces/:id/github-repositories` | Clerk + local principal | OWNER | Zod body | `backend/src/routes/workspace.routes.ts:45` |
| `PATCH /api/workspaces/:id/github-repositories/:repositoryId` | Clerk + local principal | OWNER; target repository checked against workspace | Zod body | `backend/src/routes/workspace.routes.ts:46` |
| `DELETE /api/workspaces/:id/github-repositories/:repositoryId` | Clerk + local principal | OWNER; target repository checked against workspace | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:47` |
| `GET /api/workspaces/:id/documents` | Clerk + local principal | Any workspace member | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:50` |
| `POST /api/workspaces/:id/documents` | Clerk + local principal | OWNER/EDITOR; parent ID workspace/archive checked; nested children tenant-filtered (D08 application+composite database FK fix) | Zod body | `backend/src/routes/workspace.routes.ts:51` |
| `GET /api/workspaces/:id/boards` | Clerk + local principal | Any workspace member | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:54` |
| `POST /api/workspaces/:id/boards` | Clerk + local principal | OWNER / EDITOR | Zod body | `backend/src/routes/workspace.routes.ts:55` |
| `GET /api/workspaces/:id/snippets` | Clerk + local principal | Any workspace member | No body schema / ID format validation | `backend/src/routes/workspace.routes.ts:58` |
| `POST /api/workspaces/:id/snippets` | Clerk + local principal | OWNER / EDITOR | Zod body | `backend/src/routes/workspace.routes.ts:59` |
| `GET /api/health` | Public | None (operational endpoint) | N/A | `backend/src/app.ts:54` |
| `GET /api/ready` | Public | None (operational endpoint) | N/A | `backend/src/app.ts:60` |
| `GET /api/auth/reset (Next)` | Public | No user/workspace check; arbitrary redirect and cookie clearing | No redirect allowlist | `frontend/src/app/api/auth/reset/route.ts:4` |
| `POST /api/superadmin/workspaces/:workspaceId/kill-switch (Next)` | Clerk currentUser | publicMetadata.systemRole=SUPER_ADMIN; forwards service token | Zod reason; encoded workspace ID | `frontend/src/app/api/superadmin/workspaces/[workspaceId]/kill-switch/route.ts:7` |

## Socket.io input events

Both transports use the shared production Clerk verifier, finite unexpired JWT and active local user. Socket.io uses public packet middleware, a bounded event allowlist and workspace-role snapshots; every incoming event and passive one-second audit checks the central policy. Audit failures time out and close access. Per-node local member-change notifications evict immediately; other instances independently audit Postgres. A changed role closes the old session; a reconnect receives its current role. An unrelated workspace-only connection survives. Event rate buckets remain per socket/event type; subscriptions are bounded to32 per connection.

| Event | Membership | Role/resource binding | Validation | Evidence |
|---|---|---|---|---|
| `workspace:join` | Shared workspace policy, active user/tenant | Member; cursor additionally resolves document workspace/archive | Bounded Zod envelope/cursor | `backend/src/socket/presence.handler.ts:70` |
| `workspace:leave` | Shared workspace policy, active user/tenant | Member; cursor additionally resolves document workspace/archive | Bounded Zod envelope/cursor | `backend/src/socket/presence.handler.ts:109` |
| `cursor:update` | Shared workspace policy, active user/tenant | Member; cursor additionally resolves document workspace/archive | Bounded Zod envelope/cursor | `backend/src/socket/presence.handler.ts:134` |
| `disconnect` | Not applicable | Disconnect cleans buckets/presence; no authz needed | No payload domain schema | `backend/src/socket/presence.handler.ts:140` |
| `kanban:task-moved` | Shared workspace policy, active user/tenant | OWNER/EDITOR; task/column bound to workspace; canonical data relay | Bounded Zod ID/position envelope | `backend/src/socket/kanban.handler.ts:21` |
| `kanban:task-created` | Shared workspace policy, active user/tenant | OWNER/EDITOR; task/column bound to workspace; canonical data relay | Bounded Zod ID/position envelope | `backend/src/socket/kanban.handler.ts:21` |
| `kanban:task-updated` | Shared workspace policy, active user/tenant | OWNER/EDITOR; task/column bound to workspace; canonical data relay | Bounded Zod ID/position envelope | `backend/src/socket/kanban.handler.ts:21` |
| `kanban:task-deleted` | Shared workspace policy, active user/tenant | OWNER/EDITOR; task/column bound to workspace; canonical data relay | Bounded Zod ID/position envelope | `backend/src/socket/kanban.handler.ts:21` |
| `session:refresh` | Shared identity and all tracked workspace policies | Same principal only; role changes cannot be hidden by renewal | Strict bounded token schema | `backend/src/socket/server.ts` |
| `error` | Active verified principal and session expiry | No domain mutation; payload not logged | Frame/rate limits | `backend/src/socket/server.ts` |
| `disconnect` | Not applicable | Disconnect cleans buckets/presence; no authz needed | No payload domain schema | `backend/src/socket/index.ts:93` |

Outbound-only notifications: workspace:users, cursor:updated, activity:new, workspace:suspended, error, plus the four relayed kanban:task-* events. Socket.io connection/disconnect are framework events. No document:join/write event remains on Socket.io; cursor:update targets document:<id> but no corresponding Socket.io document join handler exists. Server joins user:<localUserId> automatically for SCIM disconnects.

## Hocuspocus protocol — Phase 1b

All rows below use production Clerk JWT verification. Factory-injected identity functions are used only by test fixtures. The cookie/token replacement listed as unfinished in Phase 1a was not silently introduced.

| Room / operation | Connection check | Every inbound message / write | Passive revocation / persistence |
|---|---|---|---|
| `document:<workspace>:<document>` | Strict room syntax, active user, unsuspended workspace, membership, actual document/workspace match, not archived, token expiry | Same shared policy and document checks on every frame. Owner/editor updates commit under tenant RLS before acknowledgement; viewer sync mutations rejected by protocol | Local removal/role-change eviction plus one-second DB sweep on every instance; durable journal/snapshot |
| Bare document ID | Resolve through user's memberships using tenant transactions; same checks | Same checks and viewer enforcement | Durable journal; legacy room-name fanout limitation in CRDT_OPERATIONS.md |
| `kanban:<workspace>`, `workspace:<workspace>` | Same user/workspace/membership/expiry checks | Same policy per frame, viewer read-only | Swept/evicted; whole-JSON ephemeral state remains, not task-level persistence |
| Awareness/query/stateless/auth-renew/close | Authenticated document connection | Shared per-frame policy; awareness display name/color replaced with verified identity; renewed token must identify same local user | Hocuspocus disconnect/stale awareness cleanup; size/rate/admission ceilings |
| Removed/downgraded member, inactive user, suspended workspace, archived document or expired token | Reconnection reauthenticates | Fail closed; revoked transport closes | Sweep (one second plus DB latency), immediate local member-change notification |
| Internal Redis relay / server reconciliation | Private server Redis channel or server callback, no browser identity bypass | No public client path to internal Redis opcodes; reconciliation updates journaled before broadcast | Same committed PostgreSQL state; Redis is fanout only |

Implementation: `backend/src/services/collaboration-server.ts`, `crdt-journal.ts`, `yjs.service.ts`, `security/workspace-policy.ts`. Real protocol/tenant-role tests: `backend/src/__tests__/collaboration.integration.test.ts`; prior D02/D07 hook regressions retained. A message-size limit and a pre-queue frame-rate limit bound incoming work. Phase1c Socket.io and Hocuspocus eviction are independently integration-tested with separate local event buses, real Redis and non-bypass PostgreSQL. Presence uses verified server names and per-socket records aggregated into the existing per-user DTO. Additional outbound auth lifecycle events are session:refresh-required and session:updated; existing event names remain supported. See ADR010 and realtime-revocation.integration.test.ts.

## Phase1c canonical resource operations and remaining mutation inventory

Resource handlers now enforce their policy independently of route middleware. Protected standalone IDs resolve through membership tenant scopes; no runtime RLS bypass is used. The new content route below is additive. Legacy PATCH without a revision retains its replacement semantics; use PUT for stale-save detection. Existing table evidence offsets are historical; current implementation is in security/workspace-policy.ts and the three resource controllers.

| Route / mutation | Central checks and transaction | Regression evidence / remaining limitation |
|---|---|---|
| `GET/POST /api[/v1]/workspaces/:id/documents`, `GET/PATCH/DELETE /api[/v1]/documents/:id` | Active user, unsuspended workspace, current membership; readers include VIEWER, writes require OWNER/EDITOR; parent/children bound to tenant; writes/activity/embedding outbox atomic | resource-mutations.integration.test.ts, real non-bypass PostgreSQL; content/metadata canonical |
| `PUT /api[/v1]/documents/:id/content` | Same writer/resource policy; mandatory revision schema, row lock and compare-and-set before Yjs replacement | Stale/missing revision denied, stored CRDT state and live rooms checked |
| `GET/POST /api[/v1]/workspaces/:id/snippets`, `PATCH/DELETE /api[/v1]/snippets/:snippetId` | Same central reader/writer policy and RLS transaction; no stale list cache before authorization | Foreign/viewer/inactive denials and permitted editor/read-only cases |
| Board/column/task create/update/delete/move paths listed above | Central policy and tenant transaction; active assignee membership; target column tenant; workspace write lock serializes ordering | Cross-tenant/role attacks on every converted write path and RLS-positive controls |
| Task-completion queue consumer | Verified initiating local actor required in job; central writer policy before task/snippet disclosure and after provider latency; authoritative task lookup in tenant; Yjs append + activity atomic | Forged workspace/task, viewer/foreign actor and downgrade during provider call reject; two live instances receive committed state |
| New documents / snapshots / journal compaction | Internal canonical persistence called under authorized request/worker transaction or checked CRDT frame; no public direct journal route | Real Yjs/PG tests; revision refresh fixes eventual mixed-alias fanout too |
| Workspace create/update/delete/invite/member role/remove | Route-level shared policy remains; controller-local transactional principal/OWNER policy and last-owner invariant now enforced | Real cross-workspace/editor/viewer/inactive tests plus concurrent owner-demotion test; D05 regressions retained |
| GitHub repository configuration | Route policy plus controller transactional OWNER policy; active user/tenant and repository/column workspace checks | Real positive/negative repository controller tests; existing checks retained |
| Signed GitHub webhook and PR-summary worker | Central current HMAC/repository scope; active-tenant transaction; PR jobs require registered repository/workspace pair before provider use and at commit | G08 retained and real signed cross-tenant/retry/duplicate tests; queue delivery gap remains open |
| SCIM create/update/delete | Central locked, non-revoked token/workspace policy; only scoped membership/link effects; OWNER and shared profile changes denied | Foreign identity, revoked token, OWNER and global profile regressions; real Clerk provisioning/linking remains open |
| Signed Stripe webhook / usage metering | Central signed event policy and customer/subscription bindings; admin suspension preserved; usage requires central actor policy | Real SDK signature/cross-customer/subscription tests; provider ordering, quotas and delivery retries remain open |
| AI completion / offline AI reservation / embeddings | AI/search/usage/offline reservations use central actor policy; embedding producers require writer/tenant/resource binding and consumers require matching active-tenant outbox scope | Real tenant/role/vector/lease/stale-result tests in resource-mutations.integration.test.ts; quota accuracy remains open |
| Ingestion / OCR document create | Central writer check before parsing/extraction and in final canonical document/activity/outbox transaction | Real text-upload positive/foreign/viewer/inactive tests; PDF/OCR isolation remains open |
| Superadmin kill switch | Central active verified SUPER_ADMIN or constant-time configured service credential of at least32 bytes | Tests deny workspace roles/short credentials and permit explicit global authority |
| Clerk sync / self profile | Verified Clerk SDK profile sync through central active identity policy; self-profile mutation through central principal policy/exclusive lock | D01 retained, inactive/self-privilege/concurrent-profile tests added; no test-login endpoint in production |
| Seed / migration / maintenance | Explicit operator access and non-production seed opt-in; outside public user routes | Disposable-database migration and seed tests retained |

### Create receipt replay

All current durable resource creates accept optional atomic Idempotency-Key. The actor or service policy runs before any receipt lookup; a downgraded/removed member or revoked SCIM token cannot replay a protected create. Logical scope binds workspace/parent resource and authority, and legacy/v1 aliases share scope. Receipts have forced authority RLS; no raw key/request body or repository secret is retained. Real parallel HTTP, role-change, RLS and SQL-failure rollback tests cover these paths. Provider webhooks, self-sync and streaming AI keep their explicitly different protocols; see API_OPERATIONS.md and ADR016.

### Internal maintenance bookkeeping

Embedding lease claims are a private scheduler operation, never an HTTP or socket payload operation. Claim/ack/retry concerns outbox metadata only; acknowledgements bind workspace, revision and random lease token. Every resource read/vector mutation independently invokes the central active-workspace/outbox/resource policy under tenant RLS, before provider disclosure and again before storing a result. Producers check writer role and the actual resource in the transaction. Legacy jobs without resolvable scope are quarantined. Seed and migration access remains an explicit operator exception.

## Interpretation

Workspace-owner checks are correctly present on workspace mutations, invitations and repository configuration, and document/snippet mutations derive workspace from their resource. Task moves check same-workspace destinations. Critical bypasses D01/D02 are repaired by group1 regressions; D03/D04/D05/D06/D07 and application-level D08 checks are repaired; composite hierarchy migration is now tested on a fresh database; existing-data adoption still requires operator verification. Converted task create/update validate an active assignee membership in the authorized workspace (D09). Only OWNER can update roles; transactional workspace serialization forbids demoting the last owner. Removing OWNER remains forbidden under the existing contract. SCIM token authority is explicit and tenant-scoped; it cannot grant or alter OWNER, rebind existing identities or mutate shared global profiles.

## Test-only composition boundary

Production server always uses Clerk. The separate backend/testing executable refuses production mode and ordinary database names, requires a random run capability and binds loopback. Its login routes/signing provider are outside src/dist and Docker context. Request-scoped fixture strategy cannot be selected by an HTTP field or production environment flag. Default-app tests reject fixture routes/credentials. This is a tested backend fixture, not a passing browser workflow or a replacement authentication deployment.

## Phase1e pending invitations

| Route | Authority / transaction | Verification |
| --- | --- | --- |
| POST /api[/v1]/workspaces/:id/invitations | Active OWNER, unsuspended tenant, strict email + EDITOR/VIEWER body; seven-day expiry, tenant RLS, atomic invitation/activity/create receipt | Playwright email-addressed UI invitations for both grant roles |
| POST /api[/v1]/workspaces/invitations/:invitationId/accept | Active principal with matching verified provider email; recipient RLS discovery, locked tenant/user/invitation recheck; pending, unrevoked and unexpired; strict empty body; atomic member/acceptance/activity | Wrong-recipient and role injection rejected; concurrent acceptance has one winner; expired, revoked and reused links rejected; reuse cannot restore removed membership |
| DELETE /api[/v1]/workspaces/:id/invitations/:invitationId | Active OWNER in the URL tenant, pending invitation bound to that tenant | Real HTTP revocation and subsequent acceptance denial |

Legacy immediate-add /invite remains unchanged. The link carries an identifier, not recipient authority. No email delivery is claimed. Existing memberships retain their current role on acceptance. See ADR018.

## Phase3f AI admission and usage

`GET /api/v2/ai/usage` requires verified active identity and central current workspace read membership, including VIEWER. Only the caller's global personal totals and the selected authorized workspace aggregate are returned; no other user's totals or prompts are exposed. Response is no-store. The legacy/v1 completion route retains its request/SSE contract and now checks central workspace authority before atomic request/concurrency admission and any provider call. Task/repository/embedding workers retain their current central authorities before provider disclosure and share workspace quota counters; internal service principals cannot be supplied by clients. Quota exhaustion is429; admission infrastructure failure is503, fail closed. Billing estimates are distinct from admitted-request quotas; see AI_COST_SAFETY.md for durability, embedding-redelivery and financial-accounting limitations.

## Phase4b P02 — decision receipts

The feature is disabled unless FEATURE_DECISION_RECEIPTS=true; this flag is not authority. All new routes are versioned under `/api/v2/workspaces/:workspaceId/decisions` and use current central active-principal/unsuspended-workspace/membership checks inside tenant transactions. Readers (including VIEWER) can list receipts and retrieve source titles/plain text only from that workspace. OWNER/EDITOR can create/edit/delete drafts; only OWNER can explicitly accept or supersede. Accepted content is immutable, stale receipt/source revisions conflict, and replacements must be another current accepted receipt in the same tenant. The table has forced workspace RLS and a same-tenant supersession FK. Source authority is rechecked for reads and before create-receipt idempotency replay; archived/deleted sources hide derivatives. No source text is sent to a provider or indexed by this feature. Real non-bypass PostgreSQL tests cover cross-tenant IDs, viewer mutations, editor acceptance denial, RLS, revocation, source archive/delete, stale/concurrent acceptance and valid workflows. See features/decision-receipts.md for retention, limits and forward-only migration rollback instructions.

## Phase4b P04 — snippet safety preflight

FEATURE_SNIPPET_SAFETY defaults off and is not authority. New versioned `/api/v2/workspaces/:workspaceId/snippet-safety/preflight` and `/save` require current OWNER/EDITOR through central tenant transactions; VIEWER cannot scan or save. `/findings?snippetId=` permits current workspace readers only after actual same-tenant snippet lookup. Foreign edits/findings IDs return not-found even for an owner belonging to both tenants. Saves rescan server-side, require explicit confirmation and edit updatedAt, persist only masked content plus constant type/preview metadata, and queue indexing atomically. The new metadata table has forced RLS, a composite snippet/tenant FK and a fixed-mask constraint. Legacy writes reject detected values before write/activity/idempotency/outbox when the flag is enabled; their DTOs remain unchanged. Embedding/context paths mask snippet matches before provider disclosure. Real non-bypass PostgreSQL tests cover roles, tenant/FK/RLS, revocation/suspension, safe receipts/logging/indexing, stale edits, output bounds and forged mask storage. See features/snippet-safety-preflight.md for heuristic limits, historical-copy caveats and rollback.

## Phase4b P06 — evidence-only async digest

FEATURE_ASYNC_DIGEST defaults off; new v2 digest routes use central current active-user, unsuspended-workspace and READ_ROLES policy inside tenant transactions. OWNER/EDITOR/VIEWER can manage only their own opt-in/checkpoint; request bodies cannot select another actor. Preferences have forced tenant+actor RLS. Items require personal opt-in; source-proof reads require current source access independently of subscription. Only typed document/snippet/task creation activity joined to an existing same-tenant source is eligible; documents must be unarchived. Foreign/missing sources, admin/AI/unlinked records and malformed bindings are omitted before pagination without hidden counts. Every source permalink and acknowledgment repeats the source policy; an owner in both workspaces cannot cross-bind IDs. Checkpoints are private, revision-checked and monotonic. No source mutation, model, broadcast or content-copy cache is introduced. Real non-bypass tests cover actual producers, message equality, source scopes, actor/tenant RLS, viewer personal access, archive/delete, revocation, pagination/races and cursor boundaries. See features/async-digest.md for coverage, retention and rollback limits.


## Phase 3f: versioned reservation usage and limit errors

`GET /api/v3/ai/usage?workspaceId=…` accepts only the selected workspace ID. Current central active-user/unsuspended-tenant membership (OWNER, EDITOR or VIEWER) runs before Redis access. It returns only the authenticated caller's global personal charged reservations and that authorized workspace's aggregate, plus public configured limits and UTC resets; no other actor selector, prompts, source text or foreign counters. The response is no-store. Switching workspaces clears previous client totals while loading. v2 cumulative admission DTO/counters remain supported.

`POST /api/v3/ai/complete` retains central read authority, body/rate bounds and billing preflight, with atomic quota admission before any embedding/completion provider. Quota rejection is429 with typed `limit.type/scope/period/resetAt` and Retry-After; no provider runs. VIEWER completion drafts do not authorize document writes: existing server writer/CRDT policies remain authoritative. Legacy/v1 routes share admission while preserving their response shapes. Internal service principals remain unselectable by HTTP callers. Refunds require the owned reservation and confirmed pre-admission rejection; ambiguous/partial attempts remain charged. See [ADR020](adr/020-ai-reservation-settlement.md).
