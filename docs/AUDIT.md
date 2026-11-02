> This is the immutable Phase0 finding narrative and original severity count. Phase1a remediations, partial fixes and remaining scope are tracked in [PROGRESS.md](PROGRESS.md) and the updated [AUTHZ_MATRIX.md](AUTHZ_MATRIX.md). Audit-era source line numbers describe the initial checkout, not current offsets.

# Phase 0 audit

Audit date: 2026-10-31. Source is the initial checkout on `main`, audited on `upgrade/enterprise`. No application code changes. Severity assesses impact if reachable, not proof of production compromise. Static confirmations are distinguished from unverified runtime consequences. No production credentials, accounts, exploit execution or external deployment were used.

## Summary

| Severity | Findings |
|---|---:|
| Critical | 3 |
| High | 25 |
| Medium | 27 |
| Low | 5 |

Total: 60 findings. Advisory counts are separate, not added to this table.

Critical priorities are host code execution, profile mass assignment, and document-room tenant confusion. Existing controls include Clerk verification, REST role checks on many routes, bounded HTTP JSON, upload size cap, Helmet, signed webhooks, encrypted repository secrets, parameterized SQL for user values, health/readiness endpoints, telemetry and graceful shutdown hooks. Claims that these controls are universally absent would be inaccurate.

## A Documentation

### A01 — README and deployment guide describe obsolete identity and stack

- **Severity:** Medium
- **File:line:** `README.md:15`
- **Status:** Confirmed by source inspection
- **What is wrong:** README claims Next14, custom JWT rotation, SWR and Llama3; manifests/code use Next16.2.4, Clerk, Zustand/local state/Axios and gpt-oss-20b. Deployment lists JWT secrets but not current Clerk/Redis/billing configuration. Clone URL is placeholder.
- **Evidence / reproduction:** Compare manifests, auth middleware, ai.controller.ts and DEPLOYMENT.md against README lines. Frontend requires Node>=20.9, contrary to Node18+ prerequisite.
- **Recommended fix:** Rewrite onboarding from tested manifests and deploy target; unify identity, environment and migration instructions.

### A02 — Feature and enterprise walkthrough claims exceed implementation

- **Severity:** Medium
- **File:line:** `README.md:11`
- **Status:** Confirmed by source inspection
- **What is wrong:** Snippet UI offers 12 languages and plain escaped code without syntax highlighting. README role management UI is absent in settings, invitations require registered users. Walkthrough describes raw y-websocket and API-drained embeddings despite Hocuspocus/dedicated mismatched worker. It refers to two env examples; frontend example absent.
- **Evidence / reproduction:** Compare snippets LANGUAGES and <code>, settings page, worker/service producer and tracked inventory. Backend .env.example exists; do not call it missing.
- **Recommended fix:** Maintain supported-feature matrix with limitations; add frontend env template and replace walkthrough protocol/worker/setup steps with verified operations.

### A03 — Landing page claims end-to-end encryption unsupported by data flow

- **Severity:** Medium
- **File:line:** `frontend/src/app/page.tsx:199`
- **Status:** Confirmed by source inspection
- **What is wrong:** Document plaintext/JSON and Yjs bytes are available to the API/database; content is sent to AI providers. Repository secret encryption at rest does not provide end-to-end document encryption. Infinite scale and universally tenant-scoped workflow claims also exceed demonstrated behavior.
- **Evidence / reproduction:** Inspect yjs persistence, content JSON, AI retrieval and D02/G08; no client document encryption/key exchange exists.
- **Recommended fix:** Remove unsupported encryption/scaling claims and publish an accurate trust/data-processing model.

## B Collaboration

### B01 — Local-first Kanban is a last-writer-wins JSON snapshot with no retry

- **Severity:** High
- **File:line:** `frontend/src/app/(dashboard)/workspace/[id]/kanban/page.tsx:42`
- **Status:** Confirmed by source inspection
- **What is wrong:** Boards use one Y.Map string value containing the entire board, so concurrent edits to different tasks replace each other. Failed REST mutations show a promise of retry, but no outbox/replay exists. Server persists only document rooms, not kanban rooms.
- **Evidence / reproduction:** Go offline, add task, reconnect/reload: only local snapshot exists and loadBoards overwrites with server data. Two clients set record:boards/value concurrently: Yjs resolves one whole JSON value.
- **Recommended fix:** Model per-task CRDT entries or keep server versioned operations with durable mutation outbox; reconcile optimistic IDs and rollback rejected writes.

### B02 — Kanban load effect can fetch indefinitely

- **Severity:** High
- **File:line:** `frontend/src/app/(dashboard)/workspace/[id]/kanban/page.tsx:45`
- **Status:** Confirmed by source inspection
- **What is wrong:** localBoards changes identity whenever its observed value changes; loadBoards depends on it and effect calls loadBoards, which writes localBoards again.
- **Evidence / reproduction:** Load endpoint returns JSON; localBoards.set triggers observer/React value update, recreates callback, retriggers effect. Browser confirmation blocked by authenticated fixture.
- **Recommended fix:** Stabilize write callbacks and separate initial fetch from observers; version sync and test that idle board emits bounded requests.

### B03 — Document rehydration can overwrite offline edits

- **Severity:** Medium
- **File:line:** `frontend/src/app/(dashboard)/workspace/[id]/docs/[docId]/page.tsx:126`
- **Status:** Confirmed by source inspection
- **What is wrong:** Legacy JSON initialization is not coordinated with IndexedDB and remote sync; no atomic migration marker. Multiple clients importing legacy state can duplicate or replace content.
- **Evidence / reproduction:** Existing local Yjs edits plus API doc.content with empty yjsState cause setContent on metadata load. Two first clients importing JSON create distinct CRDT structures.
- **Recommended fix:** Initialize legacy CRDT server-side once; wait for local/remote sync and never replace populated local state.

### B04 — Collaboration memory and rooms have no application quotas

- **Severity:** Medium
- **File:line:** `backend/src/socket/rate-limiter.ts:49`
- **Status:** Confirmed by source inspection
- **What is wrong:** Arbitrary event names allocate buckets indefinitely per socket; room joins have rate but no total count cap; empty fallback presence maps are retained. Hocuspocus accepts arbitrary nonexistent IDs and no document-size/room-count quotas.
- **Evidence / reproduction:** Send unique event names or many room joins over time; disconnect clears buckets/socket mapping but not empty workspace maps. 10+ editor capacity is unmeasured.
- **Recommended fix:** Allowlist event names, cap rooms/update sizes/state, prune empty maps and load-test bounded memory/reconnect behavior.

### B05 — Presence is incorrect across tabs and reconnects

- **Severity:** Medium
- **File:line:** `backend/src/socket/presence.handler.ts:31`
- **Status:** Confirmed by source inspection
- **What is wrong:** Presence keyed by user stores one socket; closing one tab deletes another live tab. TTL refresh occurs only on join; idle live users expire. Client expects userId/userName but server emits id/name; only overview joins workspace and reconnect does not rejoin explicitly.
- **Evidence / reproduction:** Open two tabs, close one; inspect hash entry. Wait >300s with no join. View presence bar initials (uses absent userName).
- **Recommended fix:** Track per-socket presence with heartbeat and aggregation, consistent DTOs, centralized route membership and reconnect rejoin.

## C Authentication

### C01 — Membership removal and suspension do not revoke collaboration access

- **Severity:** High
- **File:line:** `backend/src/services/yjs.service.ts:57`
- **Status:** Confirmed by source inspection
- **What is wrong:** Authorization is checked at connection time only; no token expiry timer or role-change eviction is wired. Kill-switch/SCIM disconnect Socket.io, not Hocuspocus. isActive is not checked in REST/socket principal resolution.
- **Evidence / reproduction:** Connect, remove/demote member or suspend tenant, then continue sending Yjs updates. Need authenticated integration fixture to verify connection lifetime.
- **Recommended fix:** Enforce active user/tenant and current authorization throughout session; close all collaboration transports on revocation and expire sessions.

### C02 — Public GET reset clears cookies and redirects externally

- **Severity:** Medium
- **File:line:** `frontend/src/app/api/auth/reset/route.ts:6`
- **Status:** Confirmed by source inspection
- **What is wrong:** A public GET performs logout-like cookie deletion and accepts absolute/protocol-relative redirect destinations.
- **Evidence / reproduction:** GET /api/auth/reset?redirect=https://example.com yields an external redirect while expiring same-origin cookies. Can be triggered by top-level cross-site navigation.
- **Recommended fix:** Allowlist same-origin relative paths; use a protected POST for session changes and provider revocation.

### C03 — Invites enumerate registered accounts and bypass acceptance

- **Severity:** Medium
- **File:line:** `backend/src/controllers/workspace.controller.ts:186`
- **Status:** Confirmed by source inspection
- **What is wrong:** Workspace owners distinguish unregistered email, existing member and existing nonmember; invitation immediately inserts membership with no invitation/acceptance record.
- **Evidence / reproduction:** Own any workspace, invite candidate emails and compare 404 vs success vs already-member error.
- **Recommended fix:** Use pending invitations with normalized email, opaque responses, expiry, consent and per-owner limits.

### C04 — SCIM provisioned identities conflict with Clerk and global profile state

- **Severity:** Medium
- **File:line:** `backend/src/routes/scim.routes.ts:44`
- **Status:** Confirmed by source inspection
- **What is wrong:** SCIM email upsert creates a synthetic clerkId or edits an existing global user. Clerk sync upserts by real clerkId against unique email, without identity linking; isActive is global yet not enforced.
- **Evidence / reproduction:** Provision new email via SCIM then sign in with that email via Clerk: unique email conflicts. Tenant token can change name/active/email on a shared user via its external identity.
- **Recommended fix:** Design explicit verified identity linking and tenant-local provisioning state; enforce deprovisioning on every transport without mutating unrelated tenant identity.

## D Authorization

### D01 — Profile mass assignment permits system administrator escalation

- **Severity:** Critical
- **File:line:** `backend/src/controllers/auth.controller.ts:50`
- **Status:** Confirmed by source inspection
- **What is wrong:** The validator parses but discards the sanitized result; updateMe passes the original body to Prisma, including systemRole and nested relations.
- **Evidence / reproduction:** Authenticated PATCH /api/auth/me with {"name":"Audit","systemRole":"SUPER_ADMIN"} passes updateMeSchema (unknown keys are stripped only in the returned value) and reaches user.update unchanged. No live account modified.
- **Recommended fix:** Assign parsed data back to req.body and allowlist profile fields in the controller; regression-test systemRole, clerkId and nested membership writes.

### D02 — Yjs room prefix authorizes the wrong document

- **Severity:** Critical
- **File:line:** `backend/src/services/yjs.service.ts:79`
- **Status:** Confirmed by source inspection
- **What is wrong:** For document:ownWorkspace:victimDocument authentication checks the supplied workspace, while fetch/store use only victimDocument.
- **Evidence / reproduction:** A member of A supplies room document:A:documentB. No comparison to documentB.workspaceId occurs. With a non-bypass RLS role the unscoped query fails instead (G01); with the supplied postgres setup this exposes B. Live exploit unverified.
- **Recommended fix:** Resolve canonical document workspace first; compare room workspace and require role; use tenant-scoped fetch/store and reject missing documents.

### D03 — Socket.io room joins expose other workspaces

- **Severity:** High
- **File:line:** `backend/src/socket/presence.handler.ts:79`
- **Status:** Confirmed by source inspection
- **What is wrong:** Any authenticated socket joins any workspace ID and receives presence and future room broadcasts without membership verification.
- **Evidence / reproduction:** Emit workspace:join {workspaceId:otherId,userName:"Audit"}; only Zod validation precedes join.
- **Recommended fix:** Check membership using server identity before joining; evict on membership changes.

### D04 — Kanban socket relays permit viewer and outsider spoofing

- **Severity:** High
- **File:line:** `backend/src/socket/kanban.handler.ts:39`
- **Status:** Confirmed by source inspection
- **What is wrong:** All four Kanban input events relay client content to arbitrary workspace rooms without role or resource checks. These handlers do not persist database changes.
- **Evidence / reproduction:** Emit task-created/updated/deleted/moved targeting another workspace; socket.to does not require sender room membership.
- **Recommended fix:** Accept authorized server mutations as canonical broadcasts; otherwise verify membership, editor role, resource ownership and bounded task schema.

### D05 — Workspace owner can modify members in another workspace

- **Severity:** High
- **File:line:** `backend/src/controllers/workspace.controller.ts:221`
- **Status:** Confirmed by source inspection
- **What is wrong:** Owner middleware checks URL workspace, but member update/delete uses memberId alone.
- **Evidence / reproduction:** As owner of A PATCH /api/workspaces/A/members/memberB {role:"OWNER"}, or DELETE a non-owner memberB. WorkspaceMember has no RLS policy.
- **Recommended fix:** Use composite workspace and member filters and transactionally enforce owner invariants.

### D06 — Creating a column has no board authorization

- **Severity:** High
- **File:line:** `backend/src/controllers/task.controller.ts:132`
- **Status:** Confirmed by source inspection
- **What is wrong:** Authenticated requests create columns on arbitrary boards; unlike update/delete there is no editor check.
- **Evidence / reproduction:** POST /api/tasks/boards/otherBoard/columns {name:"Injected"}; Board/Column are not protected by the RLS migration.
- **Recommended fix:** Resolve board workspace and require editor before reading positions or creating columns.

### D07 — Yjs viewers can write

- **Severity:** High
- **File:line:** `backend/src/services/yjs.service.ts:101`
- **Status:** Confirmed by source inspection
- **What is wrong:** Hocuspocus authentication accepts all membership roles and never marks viewers read-only.
- **Evidence / reproduction:** Connect as a VIEWER and send a Yjs update; auth returns the same context as an editor. No role decision before storage.
- **Recommended fix:** Enforce server read-only connection state for viewers; test write attempts with raw protocol clients.

### D08 — Cross-workspace document hierarchy can expose children

- **Severity:** High
- **File:line:** `backend/src/controllers/document.controller.ts:85`
- **Status:** Confirmed by source inspection
- **What is wrong:** Document creation accepts any parentId; child includes do not filter workspace. The FK only enforces that a document exists.
- **Evidence / reproduction:** Under the supplied bypass-RLS database role, editor A creates a document with parentId=documentB. Member B then reads children including A metadata/content in list nesting. Live DB reproduction unverified.
- **Recommended fix:** Require parent workspace match and enforce tenant relationships at database level; scope recursive reads.

### D09 — Task assignments accept users outside the workspace

- **Severity:** Medium
- **File:line:** `backend/src/controllers/task.controller.ts:185`
- **Status:** Confirmed by source inspection
- **What is wrong:** Task create/update accepts any User ID; foreign key existence is the only assignment constraint, without checking WorkspaceMember.
- **Evidence / reproduction:** As editor of A, submit assigneeId of user B who is not an A member. include assignee returns B name/avatar and causes activity attribution by the agent. Live reproduction requires isolated DB fixtures.
- **Recommended fix:** Require assignee membership in task workspace in the authorized transaction; validate removal/reassignment behavior.

### D10 — Owner role updates can orphan a workspace

- **Severity:** Medium
- **File:line:** `backend/src/controllers/workspace.controller.ts:227`
- **Status:** Confirmed by source inspection
- **What is wrong:** An owner can demote the last OWNER, including self; removal guard alone does not prevent an ownerless workspace and agent workflows depend on an OWNER.
- **Evidence / reproduction:** PATCH own membership from OWNER to VIEWER when sole owner: no count/invariant check. Concurrent owner demotions also lack serialization.
- **Recommended fix:** Define owner-transfer policy and transactionally preserve at least one owner, with contention tests.

## E Input handling

### E01 — Authenticated arbitrary code execution on API host

- **Severity:** Critical
- **File:line:** `backend/src/controllers/snippet.controller.ts:130`
- **Status:** Confirmed by source inspection
- **What is wrong:** Submitted code runs native interpreters with the API OS identity, filesystem/network access, inherited secrets and attacker-controlled environment. A timeout is not isolation.
- **Evidence / reproduction:** Any signed-in user can POST /api/snippets/execute with JavaScript console.log(process.getuid?.()) or arbitrary fs/network calls; route has no workspace gate. Source establishes capability; dangerous execution was not performed.
- **Recommended fix:** Disable exposed execution until moved to isolated disposable workers with no application secrets, denied network, resource/process limits and tenant quotas.

### E02 — AI markdown renders unsanitized HTML

- **Severity:** High
- **File:line:** `frontend/src/lib/markdown.ts:124`
- **Status:** Confirmed by source inspection
- **What is wrong:** Only code spans/blocks escape HTML; ordinary text passes raw HTML to dangerouslySetInnerHTML in editor previews and copilot.
- **Evidence / reproduction:** markdownToHtml(`<img src=x onerror="window.__auditXss=1">`) returns executable markup. Feed equivalent model output to the preview; prompt injection provides an input path. No provider call needed to establish sink.
- **Recommended fix:** Use a maintained Markdown parser with raw HTML disabled and sanitize allowed HTML/URLs before rendering or editor insertion.

### E03 — Upload work is synchronous and authorized after buffering

- **Severity:** Medium
- **File:line:** `backend/src/routes/ingestion.routes.ts:45`
- **Status:** Confirmed by source inspection
- **What is wrong:** Multer buffers up to 25MB before membership/role checks. OCR/PDF parsing runs in API with no concurrency/page/pixel budget or request deadline; MIME is client-controlled.
- **Evidence / reproduction:** An authenticated outsider can repeatedly upload 25MB before receiving 403; authorized compressed image/PDF workloads can exhaust CPU/RAM.
- **Recommended fix:** Authorize before multipart parsing; verify file signatures and dimensions; queue bounded isolated parsing with deadlines and rate limits.

### E04 — Payload validation leaves broad unbounded content surfaces

- **Severity:** Medium
- **File:line:** `backend/src/controllers/document.controller.ts:15`
- **Status:** Confirmed by source inspection
- **What is wrong:** Document JSON has no node/depth schema; AI body has only truthiness checks; socket tasks/cursors are any; 10MB HTTP JSON and ws default limits are large relative to workloads.
- **Evidence / reproduction:** Submit object prompt or malformed TipTap content, or large arbitrary cursor/task graphs; no domain schema rejects them before downstream use.
- **Recommended fix:** Add bounded domain schemas for body/params/query and each event; explicit message/document size, rate and nesting limits.

## F AI

### F01 — AI quota is neither accurate nor atomic

- **Severity:** High
- **File:line:** `backend/src/middleware/billing.middleware.ts:14`
- **Status:** Confirmed by source inspection
- **What is wrong:** Metering counts prompt/context characters only after HTTP success, excluding output tokens and retrieved context. Concurrent requests all pass preflight; a streaming error still ends with HTTP 200. Quotas disabled without Stripe configuration; agents bypass metering.
- **Evidence / reproduction:** Compare max_tokens=1024 to Math.ceil(input.length/4); send parallel requests near limit. Source confirms no reservation and no provider usage accounting.
- **Recommended fix:** Reserve a bounded token budget atomically, settle real provider usage including agents/retrieval, enforce tenant/user concurrency and retry usage reporting durably.

### F02 — Public completion bypasses configured AI gateway

- **Severity:** Medium
- **File:line:** `backend/src/controllers/ai.controller.ts:39`
- **Status:** Confirmed by source inspection
- **What is wrong:** Interactive SSE calls Groq directly, with no application deadline, disconnect cancellation or fallback. The timeout/circuit-breaker gateway is used only by task agent.
- **Evidence / reproduction:** Stall a provider stream or disconnect the browser: no AbortController/request close handler exists. SDK defaults may time out; no claim of infinite SDK timeout.
- **Recommended fix:** Use a shared streaming gateway with explicit deadlines, cancellation, safe error frames, retries and documented fallback semantics.

### F03 — Retrieved content can inject instructions and include archived documents

- **Severity:** Medium
- **File:line:** `backend/src/services/embedding.service.ts:88`
- **Status:** Confirmed by source inspection
- **What is wrong:** Retrieval filters workspace correctly but omits isArchived=false. Document/PR content is supplied as user instructions without untrusted-context boundaries. No demonstrated cross-workspace RAG query leak.
- **Evidence / reproduction:** Archive an embedded document then query its topic; SQL still selects it. Seed content instructing output HTML to exercise E02 through AI. Model obedience remains unverified.
- **Recommended fix:** Filter archived/deleted content, minimize context and delimit untrusted evidence; prevent content from becoming executable HTML; document provider data handling.

## G Reliability and data

### G01 — RLS context is missing from most protected-table operations

- **Severity:** High
- **File:line:** `backend/prisma/migrations/20260815000000_phase_3_tenant_rls/migration.sql:6`
- **Status:** Confirmed by source inspection
- **What is wrong:** Only selected document/snippet list/create and task agent operations set tenant context. Document access checks, update/delete, Yjs persistence, most tasks, search, webhooks and embedding worker use the unscoped client. Supplied postgres credentials bypass RLS, concealing defects.
- **Evidence / reproduction:** Run production queries as a NOSUPERUSER NOBYPASSRLS role: direct protected-table reads see no rows/writes fail. Run as Compose postgres: RLS is bypassed. Existing RLS tests construct separate tables and do not test controllers.
- **Recommended fix:** Make tenant-bound transactions mandatory end-to-end and supply least-privilege DB roles; integration-test all matrix paths against actual migrations.

### G02 — Migrations cannot bootstrap a fresh database

- **Severity:** High
- **File:line:** `backend/prisma/migrations/20260729180000_enterprise_platform/migration.sql:4`
- **Status:** Confirmed by source inspection
- **What is wrong:** First migration alters existing tables but no baseline creates User/Workspace/Document/etc. clerkId is nullable in SQL but required in schema. README uses db push, omitting SQL RLS policies and indexes.
- **Evidence / reproduction:** On empty PostgreSQL with vector installed, first ALTER TABLE User fails. Existing databases also need explicit identity backfill/NOT NULL handling before auth migration.
- **Recommended fix:** Create and validate historical baseline and backfill path; use migrate deploy with a dedicated migration role; test empty and upgrade databases.

### G03 — Redis outage blocks purported graceful fallback

- **Severity:** High
- **File:line:** `backend/src/lib/redis.ts:8`
- **Status:** Confirmed by source inspection
- **What is wrong:** isRedisAvailable awaits ping with unlimited reconnect/offline command retries. Cache get/del likewise await redis commands. Outage can hang snippet reads, joins, adapters and task moves instead of returning false.
- **Evidence / reproduction:** Stop Redis then await isRedisAvailable or a cache read: no command timeout or bounded retry is configured. Runtime log shows repeated ECONNREFUSED.
- **Recommended fix:** Separate queue and request clients; use fail-fast request commands, bounded health checks, circuit breaker and tested fallback.

### G04 — Embedding producer and dedicated worker use different queues

- **Severity:** High
- **File:line:** `backend/src/services/embedding.service.ts:30`
- **Status:** Confirmed by source inspection
- **What is wrong:** queueEmbedding writes PostgreSQL EmbeddingJob; worker.ts listens to BullMQ devsync-embedding and never drains that table. API polling is opt-in only.
- **Evidence / reproduction:** Create a resource then run npm run worker: no BullMQ embedding job is enqueued. Verify table backlog and absent embedding.
- **Recommended fix:** Use one durable producer/consumer mechanism with transactional outbox and acknowledged retries.

### G05 — Embedding polling races and loses failed work

- **Severity:** Medium
- **File:line:** `backend/src/services/embedding.service.ts:38`
- **Status:** Confirmed by source inspection
- **What is wrong:** Polling SELECT and processing UPDATE are not atomic across replicas; crashed processing rows are never reclaimed. embed catches failures and returns null, refresh returns success, and job is deleted. Requeued concurrent edits can be deleted by older work.
- **Evidence / reproduction:** Two API replicas with RUN_EMBEDDING_WORKER_IN_API=true select the same pending row. Provider failure returns null then DELETE executes.
- **Recommended fix:** Claim with SKIP LOCKED/lease and version; retry provider errors, reclaim leases and preserve newer content revisions.

### G06 — Yjs state and JSON projections diverge

- **Severity:** High
- **File:line:** `backend/src/services/yjs.service.ts:157`
- **Status:** Confirmed by source inspection
- **What is wrong:** CRDT stores update only yjsState, while embeddings/search/agents use content JSON. REST and agent JSON updates do not modify Yjs; editor imports JSON only when yjsState absent.
- **Evidence / reproduction:** Edit a persisted Yjs document, inspect content/search: old JSON remains. Append agent summary after yjsState exists: client ignores new JSON.
- **Recommended fix:** Choose canonical Yjs state and transactionally derive JSON/indexing; apply server edits through CRDT, with deterministic legacy migration.

### G07 — Kanban move and position allocation race

- **Severity:** Medium
- **File:line:** `backend/src/controllers/task.controller.ts:302`
- **Status:** Confirmed by source inspection
- **What is wrong:** Move increments target tasks then updates moving task in separate operations, never closes source gap. Creation uses max+1 without serialization/unique constraint. Summary append also read-modify-writes JSON concurrently.
- **Evidence / reproduction:** Concurrent creates/moves can duplicate positions; error between increment and task update leaves partial mutation. Two summary jobs can overwrite appends.
- **Recommended fix:** Use ordered transactional mutations with version/locking or order keys; serialize summary append or use append-only records.

### G08 — GitHub task transition crosses workspace boundary

- **Severity:** High
- **File:line:** `backend/src/routes/github-webhook.routes.ts:167`
- **Status:** Confirmed by source inspection
- **What is wrong:** Signed repository event searches globally unique taskKey without filtering owning workspace then moves all matches into the repository workspace.
- **Evidence / reproduction:** Repository A PR references a known DEV-123 from B; under supplied bypass-RLS DB, matching B task moves to A. Strict RLS instead yields no rows (G01).
- **Recommended fix:** Filter task through column.board.workspaceId and enforce immutable tenant ownership; transactionally validate source and target.

### G09 — Webhook delivery is acknowledged before business effects

- **Severity:** High
- **File:line:** `backend/src/routes/github-webhook.routes.ts:38`
- **Status:** Confirmed by source inspection
- **What is wrong:** Idempotency wrapper covers inserting delivery record only; completed marker is set before processing/enqueue/move. Later failures are suppressed as duplicate on redelivery. Stripe has signature validation but no event ledger/order guard.
- **Evidence / reproduction:** Force failure after GitHubWebhookDelivery insert, redeliver same delivery: 202 duplicate, work never retried. Older Stripe checkout completion can overwrite canceled status.
- **Recommended fix:** Persist incoming delivery and outbox atomically; process/retry durable state, mark done only after effects; deduplicate/order Stripe events.

### G10 — Persistence errors are swallowed after CRDT update acknowledgement

- **Severity:** Medium
- **File:line:** `backend/src/services/yjs.service.ts:160`
- **Status:** Confirmed by source inspection
- **What is wrong:** Yjs store catches DB errors and resolves normally, making failed persistence appear successful. Debounce also leaves 3–10 seconds of acknowledged in-memory edits at risk on abrupt restart.
- **Evidence / reproduction:** Make database unavailable during store, observe error log but no rejected store/retry signal. Kill API before debounce expires.
- **Recommended fix:** Propagate failed stores for retry, expose durable acknowledgements, journal updates before confirming durability and test crash recovery.

### G11 — Fire-and-forget embedding promises can reject unhandled

- **Severity:** Medium
- **File:line:** `backend/src/controllers/document.controller.ts:110`
- **Status:** Confirmed by source inspection
- **What is wrong:** Async queueEmbedding calls after res.json are neither awaited nor caught; controller catch cannot catch later rejection. Similar calls exist in snippets/tasks/ingestion.
- **Evidence / reproduction:** Cause EmbeddingJob INSERT failure after successful create/update; rejected promise has no handler and can terminate Node.
- **Recommended fix:** Persist outbox in mutation transaction or explicitly catch and durably retry failures.

### G12 — Missing relation indexes and unbounded lists amplify load

- **Severity:** Medium
- **File:line:** `backend/prisma/schema.prisma:106`
- **Status:** Confirmed by source inspection
- **What is wrong:** Document workspaceId/parentId, Board workspaceId, Column boardId, Task columnId, Snippet workspaceId and Activity workspaceId/createdAt lack ordinary query indexes. Lists return full documents/code/boards/tasks without pagination; PostgreSQL does not automatically index referencing FKs.
- **Evidence / reproduction:** Inspect schema plus SQL migrations: vector indexes exist, most FK/list indexes do not. Seed a large workspace and EXPLAIN representative queries to quantify (unverified performance).
- **Recommended fix:** Add measured composite indexes, cursor pagination, projections and payload budgets; avoid broad nested list includes.

## H Frontend

### H01 — SSE parsers drop split network frames

- **Severity:** Medium
- **File:line:** `frontend/src/components/ai-copilot-drawer.tsx:88`
- **Status:** Confirmed by source inspection
- **What is wrong:** Each network chunk is parsed independently; JSON split across reads is caught and discarded. Decoder is not used with streaming mode; SSE error frames ignored. Same parser repeated in editor/snippets.
- **Evidence / reproduction:** Split data: {"content":"hello"} across two fetch reader chunks: neither fragment parses.
- **Recommended fix:** Use one buffered incremental UTF-8/SSE parser shared by all consumers with error/cancel support.

### H02 — Local cache survives logout and is not scoped by user

- **Severity:** Medium
- **File:line:** `frontend/src/lib/local-first-yjs.ts:34`
- **Status:** Confirmed by source inspection
- **What is wrong:** IndexedDB key contains room only, not user identity; signOut does not destroy/delete cached documents. Another account on shared browser can access stale data locally. Copilot/command palette also retain state across workspace navigation.
- **Evidence / reproduction:** Sign out then sign in as another user in same origin/browser; inspect devsync:room IndexedDB. No logout cache removal in AuthProvider.
- **Recommended fix:** Isolate encrypted local stores by account, define logout retention policy and clear/invalidate sensitive view state on identity/workspace changes.

### H03 — Authentication token callbacks destabilize socket lifecycle

- **Severity:** Medium
- **File:line:** `frontend/src/providers/auth-provider.tsx:16`
- **Status:** Confirmed by source inspection
- **What is wrong:** Auth value recreates getToken on user/auth memo changes. SocketProvider depends on it and lacks disposed guard around pending token promise. Local-first hook captures one token string, with no refresh callback.
- **Evidence / reproduction:** Unmount before getToken resolves: SocketProvider can create an orphan socket. Expired token reconnect reuses captured token.
- **Recommended fix:** Use stable callbacks, disposed guards and provider-supported token refresh; destroy Y.Doc instances and reset stores on room changes.

### H04 — Keyboard access and dialog semantics are missing

- **Severity:** Medium
- **File:line:** `frontend/src/app/(dashboard)/workspace/[id]/kanban/page.tsx:150`
- **Status:** Confirmed by source inspection
- **What is wrong:** Task cards rely on div onClick/native mouse drag, no keyboard move actions/tabIndex; modals lack dialog role, focus trapping, Escape and restoration; icon controls lack names and labels are unassociated.
- **Evidence / reproduction:** Keyboard-only navigation cannot focus task card or move it. Dashboard create modal is a generic div (dashboard/page.tsx:132).
- **Recommended fix:** Implement accessible buttons/cards, keyboard move menu, labeled form controls and tested dialog primitives. Measure contrast in authenticated UI before asserting ratios.

### H05 — Workspace settings and billing are nonfunctional mock screens

- **Severity:** Medium
- **File:line:** `frontend/src/app/(dashboard)/workspace/[id]/settings/page.tsx:23`
- **Status:** Confirmed by source inspection
- **What is wrong:** Settings inputs are not loaded or saved; delete button has no handler. Billing hardcodes active enterprise plan, quotas and enabled statuses without API data/actions.
- **Evidence / reproduction:** Read settings component (no handlers/state/API). Billing tiers current:true unconditionally, connected node status static.
- **Recommended fix:** Connect real authorized workspace/billing APIs and render unavailable/pending states honestly.

### H06 — History and operational analytics present fabricated state

- **Severity:** Medium
- **File:line:** `frontend/src/app/(dashboard)/workspace/[id]/docs/[docId]/page.tsx:411`
- **Status:** Confirmed by source inspection
- **What is wrong:** History lists fixed checkpoints and restore only toasts success. Overview claims 3 workers and a connected repository regardless of health; sprint burndown fabricates historical points.
- **Evidence / reproduction:** Select Restore This Checkpoint: no state/API mutation. Overview fixed devsync/enterprise-app and sub-ms retrieval text, with no benchmark.
- **Recommended fix:** Remove fake success/metrics or label demo data explicitly; derive state/history from durable measured sources.

### H07 — Mobile sidebar and localized UX need work

- **Severity:** Low
- **File:line:** `frontend/src/app/(dashboard)/layout.tsx:24`
- **Status:** Confirmed by source inspection
- **What is wrong:** Sidebar defaults to 240px at all breakpoints within a flex row; content at 390px competes for remaining width. Hardcoded English/date locale and no i18n system; contrast/hydration/bundle totals unmeasured.
- **Evidence / reproduction:** Inspect w-60 and no mobile overlay breakpoint; utils.ts uses en-US. Verify full mobile workflow with authenticated screenshots.
- **Recommended fix:** Use collapsed/overlay mobile navigation and focus handling; introduce locale strategy when required and measure responsive layouts.

### H08 — Document upload sends bearer token to hardcoded localhost

- **Severity:** High
- **File:line:** `frontend/src/app/(dashboard)/workspace/[id]/docs/page.tsx:128`
- **Status:** Confirmed by source inspection
- **What is wrong:** Upload ignores configured API origin and always sends the Clerk bearer token to plaintext localhost:5000. Deployed users cannot ingest through the backend; any local listener receives that request/token if browser permits it.
- **Evidence / reproduction:** Open ingestion UI from deployed origin: network target is user machine localhost, not NEXT_PUBLIC_API_URL. Browser mixed-content/private-network behavior varies; successful token delivery unverified.
- **Recommended fix:** Use the centralized configured API client and secure deployment origin; test upload on real HTTPS deployment.

### H09 — Light theme and toast color configuration conflict

- **Severity:** Low
- **File:line:** `frontend/src/app/globals.css:83`
- **Status:** Confirmed by source inspection
- **What is wrong:** Dark variables override :root unconditionally, so selecting light still retains dark base palette. Toaster wraps hex CSS variables in hsl(), producing invalid colors.
- **Evidence / reproduction:** Toggle theme; class changes but :root still matches the later dark declaration. hsl(var(--card)) resolves to hsl(#0f1422).
- **Recommended fix:** Scope dark overrides to .dark and use var(--card) directly; verify both themes and contrast.

### H10 — Document templates omit template content

- **Severity:** Low
- **File:line:** `frontend/src/app/(dashboard)/workspace/[id]/docs/page.tsx:106`
- **Status:** Confirmed by source inspection
- **What is wrong:** createFromTemplate passes title only, despite structured template content being defined above. createDocumentSchema does not accept content.
- **Evidence / reproduction:** Select an ADR template: created document receives title but no template.content in request.
- **Recommended fix:** Version or extend create contract deliberately to accept validated initial content and initialize canonical CRDT once.

## I Repo and DevOps

### I01 — Dependency audit reports vulnerable installed trees

- **Severity:** High
- **File:line:** `backend/package-lock.json:8885`
- **Status:** Confirmed by source inspection
- **What is wrong:** Backend registry audit reports 49 advisory entries (2 critical,12 high,31 moderate,4 low). Counts include transitive/meta-vulnerabilities and are not proven exploits. Frontend audit reports 73 entries (2 critical,16 high,54 moderate,1 low); see frontend-audit-escalated.json.
- **Evidence / reproduction:** See backend-audit-escalated.json for exact versions, advisory URLs, ranges and remediation. Multer install warns version 1.x is vulnerable. Primary maintainer advisories: https://github.com/expressjs/multer/security/advisories (checked 2026-10-31).
- **Recommended fix:** Triage reachable production dependencies first; update minimally with contract/security regression tests and regenerate locks. Do not use audit fix --force blindly.

### I02 — Security tests fail compilation; E2E is skipped without fixtures

- **Severity:** High
- **File:line:** `backend/src/__tests__/rls-security.test.ts:2`
- **Status:** Confirmed by source inspection
- **What is wrong:** RLS tests import PostgreSqlContainer from a package that does not export it; queue test Worker generics fail compilation. E2E tests skip without credentials. Frontend has no test script and backend no lint script.
- **Evidence / reproduction:** See backend-tests-escalated.log, backend-e2e.log, backend-lint.log and frontend-tests.log. Frontend lint reports 52 errors/53 warnings.
- **Recommended fix:** Repair tests without bypassing type/security checks; add real controller/transport authz tests and authenticated isolated E2E fixtures; require explicit quality scripts.

### I03 — Independent Railway workflow deploys without quality gate

- **Severity:** High
- **File:line:** `.github/workflows/deploy.yml:18`
- **Status:** Confirmed by source inspection
- **What is wrong:** Railway deploy triggers on main independently of the quality/security pipeline, so failing tests/scans need not prevent deployment. Action tags/CLI are not immutable.
- **Evidence / reproduction:** Both workflows trigger push main; deploy.yml has no dependency on quality or scan.
- **Recommended fix:** Use one gated pipeline with protected environment, immutable verified artifacts, pinned actions/CLI and migration/rollback approval policy.

### I04 — Cluster ingress and collaboration scaling are incomplete

- **Severity:** High
- **File:line:** `infrastructure/kubernetes/api.yaml:26`
- **Status:** Confirmed by source inspection
- **What is wrong:** API ingress routes only /api; /socket.io and /yjs fall through web ingress. API has 3–12 replicas but Hocuspocus has no cross-instance document fanout; Socket.io Redis adapter does not synchronize Yjs. Polling also needs stickiness.
- **Evidence / reproduction:** Deploy manifests as written, request /yjs or /socket.io on ingress: routed to web. Connect two editors to different API pods: independent in-memory CRDT states overwrite persisted full snapshots. Runtime cluster reproduction unverified.
- **Recommended fix:** Route all protocols with TLS/timeouts; use supported cross-node Yjs persistence/fanout, sticky polling or documented websocket-only strategy and multi-pod convergence tests.

### I05 — Autoscaler monitors different Redis keys than application queues

- **Severity:** High
- **File:line:** `infrastructure/kubernetes/keda-bullmq-scaledobject.yaml:14`
- **Status:** Confirmed by source inspection
- **What is wrong:** KEDA keys use colon-separated devsync:agent:pr-summary while queue name is devsync-agent-pr-summary. minReplicaCount:0 permits worker scale-to-zero with no matching wakeup metric.
- **Evidence / reproduction:** Compare QueueNames in backend/src/lib/queue.ts:20 to listName. Embedding work has no scaler either.
- **Recommended fix:** Verify actual BullMQ Redis keys, use supported scaler for waiting/delayed work and keep a safe floor until validated.

### I06 — Compose configuration cannot reproduce documented stack

- **Severity:** High
- **File:line:** `docker-compose.yml:19`
- **Status:** Confirmed by source inspection
- **What is wrong:** Redis configured allkeys-lru mixes durable queue/idempotency with evictable cache. No worker or migration service. Backend omits GROQ_API_KEY. Frontend runtime public vars/Clerk key are not supplied as Docker build args.
- **Evidence / reproduction:** Inspect Compose and frontend Dockerfile: build declares only API/socket args and no Clerk key. New DB hits G02; AI backend key missing unless separately injected.
- **Recommended fix:** Separate durable queues from cache with noeviction, add explicit migration/worker lifecycle, supply public build config securely and health-based dependency startup.

### I07 — Terraform and Redis deployment need validation

- **Severity:** Medium
- **File:line:** `infrastructure/terraform/main.tf:7`
- **Status:** Confirmed by source inspection
- **What is wrong:** Several HCL blocks contain multiple same-line attributes without valid multiline separation; inline comma-separated attributes also appear. Redis cluster-mode infrastructure is paired with standalone ioredis client; MOVED handling not configured.
- **Evidence / reproduction:** Terraform executable validation not yet available: syntax concern unverified until terraform fmt -check/validate. Source explicitly uses new Redis rather than Redis.Cluster against a cluster configuration endpoint.
- **Recommended fix:** Validate HCL in CI, initialize pinned provider lockfile, align Redis topology/client and test BullMQ cluster slots/TLS; provision dependencies referenced by manifests.

### I08 — License and disclosure policy are absent

- **Severity:** Low
- **File:line:** `README.md:74`
- **Status:** Confirmed by source inspection
- **What is wrong:** README claims MIT but no tracked LICENSE; no SECURITY.md or format config. Root gitignore *.log also hides raw audit evidence unless explicitly force-added.
- **Evidence / reproduction:** Tracked inventory has README claim but no license/security policy; frontend ESLint and strict TS configs do exist.
- **Recommended fix:** Add license with owner approval, security disclosure policy, formatter and documented explicit evidence tracking.

### I09 — Seed command refers to a missing file

- **Severity:** Low
- **File:line:** `backend/package.json:16`
- **Status:** Confirmed by source inspection
- **What is wrong:** db:seed executes prisma/seed.ts but no such file is tracked. Fresh seeded test/development setup is not reproducible.
- **Evidence / reproduction:** Run npm run db:seed in an isolated installed copy: module cannot resolve missing seed.ts. Source inventory establishes absence.
- **Recommended fix:** Provide deterministic non-production seed fixtures and document their scope.

## Coverage and negative results

All tracked files are inventoried with hashes in `audit-evidence/source-inventory.json`; text/lockfile inventory is in `read-manifest.json`. Binary favicon was inventoried, not treated as text. Ignored generated dependencies and Git internals are outside source review. Nested `.kilo` worktree comparisons are recorded in scope.json and are not separate deployed application modules. No tracked actual provider secrets or build artifacts were identified; local ignored env files were reused only in ignored runtime copies and their values are intentionally absent from evidence. Git history was not exhaustively secret-scanned: historical exposure remains unverified.

No custom password hashing, refresh rotation/reuse detection, password reset or email verification implementation remains; Clerk owns those capabilities. Their configured strength, cookie flags, expiry, brute-force/MFA policy and server-side logout revocation cannot be proven without tenant dashboard access. There is no demonstrated localStorage auth-token persistence; IndexedDB does persist workspace content. Bearer authorization reduces ambient-cookie CSRF exposure on REST, but reset GET is a concrete exception. CORS is a fixed configured frontend origin with credentials; no wildcard is configured. Socket verifyToken calls do not specify authorizedParties; verify deployment origin/audience restrictions with issued tokens before claiming a cross-origin token vulnerability.

No raw SQL interpolation of request text through unsafe Prisma query APIs was found. Embedding vector uses Prisma.raw from provider numeric arrays, not direct user SQL; validate dimensions/numeric values. No accessible Cloudinary upload route or fetch-by-user-URL SSRF was found; the native runner already permits arbitrary network access. No proven prototype-pollution path identified. Snippet code itself is React-escaped; AI previews are unsafe (E02). Hydration failures, actual bundle sizes, contrast ratios, N+1 query totals and 10+ editor throughput remain unmeasured; no numbers invented. Frontend uses no SWR cache, so SWR-specific bugs are inapplicable; local projection/cache bugs are B01/B02/H02.

REST errors mostly use {error}, SSE uses data error frames, Socket.io mixes code/message with silent validation drops. Health/readiness and shutdown exist, but readiness omits Redis/worker and shutdown has no deadline/reentrancy guard or awaited HTTP drain; exercise long-lived streams and Redis outage before asserting shutdown reliability. Workspaces/columns cascade-delete child content by schema; backup/restore testing and deletion confirmation must precede production destructive operations.

## Runtime evidence

See `audit-evidence/commands.json`, `retry-commands.json`, verbatim *.log and audit JSON. Initial attempts encountered sandbox DNS/port restrictions and missing generated Prisma types; elevated retries are authoritative. No tests were skipped or edited to make results pass; the existing E2E suite skips itself when fixtures are absent. Screenshot outcomes and authentication blocks are listed in `ui/before/README.md`. Runtime limitations and human actions are in PROGRESS.md.

## README claim-by-claim reconciliation

| README claim | Evidence and result |
|---|---|
| Unified documents/tasks/snippets/AI workspace | Modules and routes exist; successful integrated operation unverified with missing DB/identity fixtures. |
| High-performance, fast/premium UI | Styling exists; no benchmark supports performance adjectives. Static/mock health statuses are H06. |
| TipTap rich text + slash commands | Editor uses TipTap and '/' opens an AI menu (docs editor:97); not a general block slash-command system. |
| Real-time documents via WebSockets | True Yjs/Hocuspocus source implementation, subject to B03/G06/G10/I04 and tenant/role defects; no claim that document text is simply Socket.io LWW. |
| Nested document structures | parent/children schema and nested list includes exist; UI lists roots only without recursive tree rendering. D08 affects tenant integrity. |
| Kanban drag-and-drop, priority, due dates, assignments | Native mouse drag, priority/date inputs and backend assignee fields exist. No assignee selector in board UI; keyboard drag absent; local-first reliability B01/B02. |
| Snippet syntax highlighting for 50+ languages | Unsupported: UI 12 labels and plain escaped code, no active highlighter. A02. |
| Inline Groq Llama3 writing/generate/improve/summarize | Groq/SSE and AI action menu exist; default model gpt-oss-20b, not Llama3. A01; safe output handling E02. |
| Multiple workspaces and member invitations | APIs/UI exist; invitation immediately inserts a registered user only, no email delivery/acceptance. C03. |
| Manage Owner/Editor/Viewer roles | Enum and owner-only role-update route exist, but role-management UI absent and D05/D07/D10 violate expected semantics. |
| Live avatar presence | UI/backend exist, but identity fields/tab cleanup/expiry/rejoin are inconsistent (B05), and joins are unauthorized (D03). |
| Next14/Tailwind4/TypeScript/App Router | Tailwind4/TypeScript/App Router supported; Next is 16.2.4. |
| Node/Express/Socket.io/PostgreSQL/Prisma | All implemented. Added Redis/BullMQ/Clerk/Yjs/Hocuspocus/pgvector/OpenAI/Stripe/SCIM omitted from README. |
| Custom JWT access/refresh rotation | Removed, now Clerk; no local refresh-token rotation or password-hashing flow. |
| React Context and SWR | Context exists; SWR absent, current Axios/state/Zustand/Yjs implementation. |
| Node18+, Docker Postgres, Groq key prerequisites | Node18 conflicts with frontend >=20.9; plain Postgres image lacks vector extension; Clerk/Redis/encryption configuration also required. |
| Clone/install/env/Prisma/local3000 instructions | Placeholder clone URL; two consecutive cd backend steps are inconsistent if copied sequentially; backend env example exists, frontend absent. db push skips migration policies, baseline absent. Public frontend runs3000, protected product requires identities/data. |
| Project structure frontend/backend | Correct but omits infrastructure/worker/services requirements. |
| Preview image | Remote illustrative image URL exists in README; no assertion it matches current UI, external availability not verified. |
| MIT licensed | Claimed, no tracked LICENSE granting terms. I08. |

Documentation conflicts: DEPLOYMENT.md:29 requires old JWT/cloudinary settings but omits current Clerk/Redis/billing prerequisites; DEPLOYMENT.md:59 says migrate deploy if migrations added later, though migrations exist. ENTERPRISE_WALKTHROUGH.md correctly warns of the missing baseline but describes old raw y-websocket membership and API embedding worker flows; current Hocuspocus and PostgreSQL/BullMQ mismatch differ. It refers to two env examples when only backend exists. Frontend README remains create-next-app boilerplate (Geist font claim conflicts with CSS Google Fonts imports). No tracked Vercel config or deployment evidence proves the user-mentioned live deployment; Railway workflows and Kubernetes/ArgoCD are alternative implementations, not one verified deploy path.
