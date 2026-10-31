# ADR 010 — Workspace-scoped realtime session revocation

Status: accepted before Phase1c implementation.

Context: Hocuspocus rechecks permissions per message and on a one-second DB sweep; Socket.io authenticates once and retains outbound room subscriptions after a member changes. Local notifications alone do not reach other processes. Redis pub/sub may be interrupted.

Options: rely only on Redis eviction messages; introspect the provider on every packet; or combine authoritative application policy checks with local eviction and a bounded periodic DB audit. Redis-only revocation can miss messages; provider introspection cannot decide workspace roles.

Decision: retain Clerk verification in production and centralize its realtime identity resolver. Track the verified role of each workspace used by a Socket.io connection. Check identity/expiry and shared workspace policy on inbound packets; recheck passive connections every second, closing rather than silently retaining an outdated role. Local member-change notifications evict immediately. Each backend independently audits Postgres, so process-local notifications and Redis delivery are not the security boundary. Close a failed audit within a bounded deadline. An unrelated connection subscribed only to another workspace remains intact. Use Socket.io's public packet middleware, not a private onevent override.

Presence records are per socket, aggregated to the existing per-user DTO, so one disconnected/revoked tab cannot erase another. Shared transport factories accept verifier/database/event-bus dependencies for isolated tests, as already allowed by ADR007; no environment flag bypasses production verification.

Validation: real migrated Postgres with a non-bypass role, Redis adapter/fanout and Socket.io/Hocuspocus clients on independent HTTP listeners/local buses. Remove/downgrade a member on one instance, verify passive transports on all instances disconnect within seconds, no further broadcasts arrive, unrelated workspace sessions survive, reconnect applies the new role, and expiry/inactive accounts reject. No CRDT or protocol mocks.

Consequences: DB availability is required for admission and ongoing access; a failed policy audit closes sessions. The polling interval is not a zero-latency transaction fence for already-running work. Canonical write transactions are addressed in the next group. The credential setup and actual baseline are recorded in phase1c-evidence/.

References: https://socket.io/docs/v4/server-api/ and https://socket.io/docs/v4/redis-adapter/ (public packet middleware, server/adapter lifecycle); installed v4 APIs are used.
