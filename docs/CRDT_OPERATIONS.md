# Document collaboration operations

Phase 1b retains Yjs and Hocuspocus; Socket.io does not transport document text. Production authentication remains Clerk session JWT verification, as in Phase 1a. No custom rotating-cookie authentication is claimed.

Deploy the new Prisma migration before API instances. Runtime credentials must be non-owner/NOBYPASSRLS with access to the two new tables and their sequence; the migration enables and forces tenant RLS. Keep migration credentials separate. Provision private authenticated Redis (TLS via `rediss://`); all instances must share the same database, Redis deployment, namespace and exact `FRONTEND_URL`. Sticky WebSocket routing is needed for connection lifetime; Redis does not replace PostgreSQL durability. Do not use serverless request handlers for persistent collaboration sockets.

## Converting legacy documents

Take a database backup using the deployment's verified backup/restore procedure. Stop API, workers and collaboration writers, including old API instances. Do not run rollback while clients can still edit. Retained originals are in `DocumentCrdtBackup`; normal document deletion is restricted while a backup exists. They contain document content and require the same access, backup and retention protection.

From `backend/`, with explicit `DATABASE_URL`:

```sh
npm run db:migrate
npm run db:crdt -- --dry-run
npm run db:crdt -- --apply --maintenance-confirmed
# If needed, before reopening writers:
npm run db:crdt -- --rollback --maintenance-confirmed
```

Dry-run validates without creating state or backup records. Apply backs up each document and converts it in one row-locked tenant transaction; rerunning skips completed conversions. Rollback restores retained originals and refuses pending updates or a changed snapshot. It never discards subsequent edits. Reapplying an unchanged rollback is supported. A first document open also performs the same serialized legacy initialization. Unknown legacy schema extensions fail closed rather than silently dropping content. The checked-in integration test invokes the seed script, tests conversion/repetition/rollback, and verifies refusal after edits. Production data validation and restore rehearsal remain operator work.

## Durability, limits and recovery

Each writable sync update commits to a SHA-256-deduplicated PostgreSQL journal before native Hocuspocus SyncStatus acknowledgement. Snapshot compaction locks the document and derives state from committed rows, including other instances' updates. Compaction runs after a 1-second debounce (5-second maximum) and at 64 journal records, bounding replay work. Restart recovers snapshot plus the journal. A killed process can lose unacknowledged or unsent browser changes; a surviving browser retries its local Yjs state. The SIGKILL test verifies an acknowledged edit exists in the journal while the snapshot remains unchanged, then recovers on another server.

Default admission limits per instance: 100 loaded/admitted room names, 256 sockets/document connections, 32 connections per room, 64 KiB incoming frame/update, 8 MiB encoded document state, 120 frames per socket per 10 seconds, four unauthenticated pending documents per socket. Offline batches exceeding the update/frame limit require product handling; no chunking claim is made. Rooms unload through Hocuspocus; awareness uses protocol timeout/disconnect cleanup. Membership, active user, workspace suspension, role, document ownership/archive and JWT expiry are checked on every inbound frame; passive sessions are swept each second. Database checks fail closed. Local role/removal handlers additionally evict immediately; other instances detect changes at the sweep. Changes do not revoke the underlying Clerk session globally.

The canonical document room is `document:<workspaceId>:<documentId>`. Bare-ID aliases remain accepted with tenant-scoped resolution for backward compatibility, but Redis topics still differ: mixing legacy aliases with canonical names does not provide immediate fanout between them. Upgrade clients together; this compatibility limitation is open. Kanban/workspace Yjs rooms remain ephemeral whole-record projections, not durable task-level CRDTs.

JSON `Document.content` is a debounced projection for search/embeddings. REST/agent JSON writes still need conversion to canonical server-side Yjs mutations (G06 remains partial); clients must not mix those writers during migration. The browser no longer imports JSON with `setContent`, scopes IndexedDB by account and room, obtains fresh reconnect tokens, and uses exponential backoff with jitter. Viewer UI is read-only; protocol enforcement is independent.

Evidence is under `docs/phase1b-evidence/`. Integration fixtures inject identity verification only in test executables; production always verifies Clerk. Frontend tests simulate the transport and IndexedDB API; they do not substitute for browser E2E or claim a full persistence stress test.
