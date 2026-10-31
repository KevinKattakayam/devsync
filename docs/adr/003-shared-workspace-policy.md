# ADR 003 — Shared workspace policy across transports (D03/D04/D05/D06/D08)

Status: accepted for the affected paths; full centralization still in progress.

Context: HTTP middleware checked membership for the URL workspace while member IDs were globally mutated; Socket.io join/relay paths checked payload shape only. Membership alone does not prove ownership of a referenced resource.

Options: trust client room membership, duplicate role logic per transport, or share a domain policy and additionally resolve resource ownership before effects.

Decision: one authorizeWorkspace function checks active local user, unsuspended workspace, membership and allowed roles. Workspace route middleware and task editing/column creation use it; Socket.io calls it for join/leave/cursor and every Kanban relay. Bind member mutation queries to workspace, validate document parent workspace and filter nested children. Relay canonical stored task data rather than arbitrary client task JSON; moved events must match committed position/destination. Keep existing event names and payload fields; invalid/unauthorized inputs receive an error event.

Consequences: ordinary same-workspace viewers can join/read, but cannot relay mutations. Socket delete notifications require an existing task bound to that workspace; reliable tombstones/outbox/authoritative deletion events need the later collaboration design and are not claimed here. Document parent FK remains non-composite pending data migration. Legacy REST resource resolution, SCIM/service roles and active-session revocation are not magically fixed by introducing a shared function. Explicit remaining coverage is kept in AUTHZ_MATRIX and PROGRESS.

Tests: authorization-boundaries.test.ts covers both member mutation routes and role escalation, board column creation, cross-workspace parenting, seven domain input events, all four Kanban viewer/foreign-resource attempts, member join and canonical same-workspace editor relays. Mocks isolate policy behavior; they do not substitute for production RLS/protocol tests.
