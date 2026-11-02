# ADR 007 — Durable Yjs document collaboration

Status: accepted for implementation in Phase 1b, before code changes.

Context: TipTap already uses Yjs and Hocuspocus. Socket.io carries presence and Kanban notifications, not document text operations. Current persistence only debounces whole-document snapshots, catches failed stores, and has no durable-before-ack update log. Kanban remains a whole-JSON LWW projection. Phase1a's ledger is partial, and authentication is still Clerk; no custom rotating-cookie system exists to reuse.

| Option | Advantages | Costs / risks |
|---|---|---|
| Yjs + Hocuspocus-style server | Existing TipTap/provider integration, awareness, read-only connections, interception before applying/acking sync updates, supported Redis transport | Need application-owned durable journal, authorization on every message, bounded resources and migrations; Redis alone does not persist |
| Yjs + y-websocket | Standard Yjs sync/awareness, simpler protocol, cookie/header support | Replacing the existing provider is an unnecessary contract change; per-message permission, durability and multi-node behavior must be implemented separately |
| Keep Socket.io for document text | Existing infrastructure and rooms | LWW cannot merge concurrent text; sending Yjs over it requires owning a custom protocol, awareness/replay/ack semantics and adapters; its Redis adapter does not synchronize Hocuspocus |

Decision: retain Yjs and Hocuspocus document protocol and existing room names. Keep Socket.io for authorized notifications; do not describe whole-board JSON as CRDT task modeling. Introduce a Postgres incremental journal committed before sync update application/ack; snapshots are derived through compaction under a document row lock, never blindly overwrite another pod's state. Recover snapshot plus journal after restart. Redis handles cross-instance update/awareness fanout, not durability. Enforce canonical document/workspace ownership and active member/role/token expiry for every inbound message; viewers cannot journal or apply mutations. Evict on membership changes and recheck passive connections with a bounded stale interval. Only advertise durable acknowledgement after database commit.

Legacy JSON initialization moves to one serialized server-side conversion. Provide dry-run, retained backup, idempotent apply and guarded rollback that refuses to discard subsequent edits. Client-side setContent of legacy JSON must be removed. Local IndexedDB remains an offline replica; use a fresh doc per room and token callback/backoff. Bound incoming payload/rate, room/client/state size and resources; clean timers/listeners on shutdown.

Validation: real Yjs clients over real WebSockets and disposable Postgres/Redis, including simultaneous paragraph edits, offline replay, viewer rejection, membership revocation, crash/restart recovery and two server instances. Provider identity verification may be injected for test fixtures only; never mock Yjs, the sync protocol or the persistence implementation. Existing1a regressions remain required. “Nothing lost” means committed/acknowledged updates, not unsent edits on a destroyed browser.

Consequences: this is document collaboration work first. Full Kanban per-task reconciliation, broader API reliability, observability and E2E remain separate groups. Production auth cutover and migration adoption remain operator tasks; do not invent credentials or claim Phase1a was fully implemented.

References: [Hocuspocus hooks](https://tiptap.dev/docs/hocuspocus/server/hooks), [Redis extension](https://tiptap.dev/docs/hocuspocus/server/extensions/redis), [y-websocket](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket). Installed v4 types and MessageReceiver confirm beforeSync runs before application and SyncStatus acknowledgement; Redis fanout is separate from persistence.
