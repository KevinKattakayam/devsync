# ADR 002 — Explicit executable quality gates (I02)

Status: accepted.

Context: backend tests imported PostgreSQL containers from the wrong package and inferred a Worker result type of never. Backend lacked a lint script, frontend lacked unit tests, and frontend lint failed on unsafe types and React component/effect structure.

Options: suppress diagnostics or remove tests; leave optional CI steps silently absent; or repair types and require actual scripts.

Decision: install the matching @testcontainers/postgresql module, explicitly type the throwing Worker processor's result through Worker generic parameters, preserve every existing security assertion, and add explicit lint/typecheck scripts. Backend's newly introduced syntax lint complements strict tsc and does not change existing frontend rule severities. Frontend keeps its existing Next/TypeScript rules; replace loose DTO/error types with domain types/unknown plus narrowing, hoist toolbar component identity and fetch data in effects with disposal guards. Add Node's built-in unit-test runner for pure frontend helpers, keeping Playwright outside Phase 1a.

Consequences: Docker is needed for existing backend integration suites. Frontend lint warnings remain visible; no rule is disabled to make errors pass. Unit tests do not substitute for the deferred authenticated browser suite. Kanban's fetch dependency stabilization is a quality repair only, not a replacement of its known last-writer-wins representation or missing durable mutation replay.
