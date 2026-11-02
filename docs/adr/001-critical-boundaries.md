# ADR 001 — Critical mutation and execution boundaries (D01, D02, E01, D07)

Status: accepted for Phase 1a.

Context: generic Zod validation discarded parsed data, profile updates accepted ORM mutation fields, an authenticated endpoint executed native code with application secrets, and collaboration trusted caller-supplied tenant prefixes.

Options: attempt to sandbox native child processes within the API; introduce a remote executor now; or disable execution until an independently isolated service exists. For collaboration, changing protocols/CRDTs is unnecessary to enforce permissions.

Decision: preserve the execution endpoint but return HTTP503 with a stable unavailable error; remove all child-process execution code. Strictly validate and allowlist profile mutation fields at both middleware and controller boundaries. Introduce a transport-neutral workspace policy and compare each collaboration document's actual tenant with the room prefix. Use the installed Hocuspocus `connectionConfig.readOnly` permission for viewers. No CRDT/protocol rewrite.

Consequences: execution intentionally becomes unavailable; no insecure opt-in switch exists. Profile updates containing unknown fields return400. Viewer document writes are rejected at protocol level. RLS context on legacy resource resolution, revocation during active sessions, all other transport policy paths and isolated execution infrastructure require subsequent work, not claims of completion.

Evidence: critical-security.test.ts exercises profile role/identity/nested-membership escalation, each execution language boundary, forged document prefixes, missing IDs, editor access and viewer read-only configuration. Pre-fix: 9 failed/2 passed; after:11 passed. Hocuspocus behavior was checked against installed v4 types/MessageReceiver and [official hook documentation](https://tiptap.dev/docs/hocuspocus/server/hooks#onauthenticate); installed API uses connectionConfig.
