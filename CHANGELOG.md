# Phase1c — atomic create idempotency group

- G09/D07/I02: atomic RLS-protected create receipts for all current durable REST/SCIM creates; authority/scope/body binding, concurrent duplicate fencing, rollback, TTL and replay permission checks. OpenAPI header contracts, real SQL fault injection and183 passing backend tests. Repository list matches the existing OWNER route; provider fixtures are isolated.

# Phase1c — embedding and self-profile group

- G01/G04/G10/C01/D01: tenant-bound writer-authorized embedding outbox, central maintenance scope, leased/revision-fenced delivery and stale-result checks; standalone PostgreSQL consumer and draining scheduler. Central active self-profile/IdP policy with serialized profile updates.169 backend tests and full gates pass; no explicit any or suppressions.

# Phase1c — service authority group

- C04/D07/G08/G09/I02: central SCIM/repository/global-admin/signed-billing policies; tenant-only SCIM membership effects, registered repository jobs, atomic webhook DB effects, customer/subscription binding and preserved admin suspension.160 backend tests pass. Remove all remaining explicit any annotations and enforce no-explicit-any in backend lint.

# Phase1c — AI/search/ingestion group

- G01/E03/F01: central membership checks before upload parsing, balance/provider work and usage writes; tenant-scoped search; canonical atomic ingestion with PDF cleanup; bounded AI request schema and untrusted-context separation; attributed offline replay keys.149 backend tests pass. Atomic quotas and remaining provider/service authorities stay open.

# Phase1c — workspace authorization group

- D05/D10/G01: central transactional principal/workspace/member/repository policies; active user checks, workspace-scoped reads and writes, atomic workspace/invitation activities, concurrent last-owner protection. Full gates pass with145 backend tests; existing tests retained.

# Phase1c — realtime revocation group

- C01/D03/D07/B05: shared Clerk realtime identity, per-packet and bounded passive Socket.io policy checks, role/member/expiry eviction across backend instances; retain and bound Hocuspocus checks. Public Socket.io middleware replaces the private untyped packet override.
- B05/H03: socket-scoped aggregated presence, fresh renewal/reconnect tokens, no late-token orphan and no prior-account state reuse. Real PostgreSQL/Redis/Socket.io/Hocuspocus revocation tests and frontend lifecycle regressions added; 87 backend tests and all quality gates pass.

# Phase 1b — quality gates and evidence (partial delivery)

- I02/B04: retain coverage thresholds and add real admission, token renewal/expiry, local eviction, ephemeral viewer and reconciliation cases; 83 backend tests pass. AsyncLocalStorage preserves pino request correlation.
- I02: warning-free frontend lint, shared Prettier configuration and formatting across both apps, measured global/critical coverage floors, Node engine alignment and stricter cached CI quality steps with PostgreSQL/Redis services. Existing tests are retained; authenticated E2E is deferred.
- I09: refresh original-main route captures and record missing seed source, login redirects and HTTP500 landing evidence without claiming populated UI coverage. Full remaining scope and human actions are in docs/PROGRESS.md.

# Phase 1b — API reliability and telemetry group (2026-11-01)

- Phase 1b: versioned API aliases, correlated safe errors, bounded PostgreSQL/Redis readiness and shutdown, protected metrics, optional sanitized tracing/error reporting and pino HTTP logs.
- I02: checked-in route/Zod-generated partial OpenAPI with drift checks; real readiness-outage and OTLP-collector tests; enforced critical collaboration coverage floors. Full gates pass with 75 backend tests. Known remaining scope is explicit in docs/PROGRESS.md.

# Changelog

- Phase1c D07/D09/G01/G06/G07: transactional central authorization and RLS-safe resource handlers; tenant-bound active assignees, atomic task ordering/activity/embedding outbox, canonical REST/actor-attributed agent document writes and revision-based live-room refresh. Add conflict-checked PUT content API while retaining legacy PATCH semantics. Real PostgreSQL/CRDT regression tests and ADR011/012.

## Phase 1a — partial delivery (2026-10-31)

- D01: strict parsed profile mutations prevent ORM field/role assignment.
- E01: disable native host execution while preserving its endpoint with HTTP503.
- D02/D07: bind collaboration document tenant and enforce viewer read-only permissions.
- I02: repair PostgreSQL/queue tests; add explicit lint/type/unit-test gates and fix frontend lint errors without rule suppression.

Historical Phase 0 audit: see docs/CHANGELOG.md. No production deployment or key rotation performed.

- D03/D04/D05/D06/D08: authorize socket domain events, bind resources and member mutations to their workspace, and validate document hierarchy ownership.
- E02/G08: render raw AI HTML inert and bind signed webhook task movement to repository tenant within a transaction.
- G02/G12/D08/I09: source-backed baseline, forward tenant indexes and composite hierarchy constraint; explicit non-production seed; versioned migration scripts and environment templates.
- I01: upgrade advisory-affected dependencies and remove unused NextAuth; final audits show no Critical/High dependency entries, with Moderate/Low entries explicitly retained.
# Phase 1b — collaboration group (2026-11-01)

- B03/B04/G10: tenant-scoped PostgreSQL CRDT journal committed before acknowledgement, row-locked compaction, Redis fanout, resource limits and durable legacy conversion with guarded rollback.
- C01/D02/D07: per-message document policy checks, passive member/role/expiry eviction, read-only protocol enforcement and bounded WebSocket admission.
- H02/I04: account/room-scoped offline replicas, fresh reconnect tokens, editor read-only/status handling, real PostgreSQL/Redis/Yjs collaboration tests and frontend editor/lifecycle component tests. Phase 1b is still in progress; remaining scope is tracked in docs/PROGRESS.md.
