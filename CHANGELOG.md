# Changelog

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
