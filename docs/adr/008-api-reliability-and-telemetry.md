# ADR 008 — API compatibility and safe optional telemetry

Status: accepted before implementation (Phase 1b).

Context: existing clients use `/api`, errors are string objects, request correlation is optional, readiness omits Redis, and telemetry starts even without an exporter. Existing security contracts and webhook raw bodies must remain intact.

Options: replace all routes with a v1-only API (breaks clients); maintain separate copied controllers (drifts); mount the same router under versioned and legacy prefixes. For telemetry, choose pino over ad-hoc console output, Prometheus registry over hand-built exposition, and optional OTLP/Sentry over mandatory external services.

Decision: share routers under `/api/v1` and legacy `/api`; keep the existing `error` string for backward compatibility while adding a stable `code` and `requestId` to centralized failures. Generate a server request ID, return it even for parser errors and 404s, and retain validated legacy trace correlation. Readiness must check PostgreSQL and Redis with bounded deadlines. Implement bounded, reentrant shutdown that drains collaboration before dependencies, with a hard termination deadline. New structured HTTP logs serialize only allowlisted metadata, never request bodies, headers, URLs/query strings or error messages that may contain payloads. Optional tracing/reporting starts only when configured; Redis statements are operation names, and error reports contain sanitized errors rather than request data. Metrics requires a configured bearer secret and uses bounded labels.

Consequences: old clients keep their existing routes/error string. Legacy controller-specific response formats/log statements still require explicit inventory and migration; these additions do not claim every old response or log has changed. Idempotent creates require atomic database/controller work and will not be simulated by a response cache with a crash window. OpenAPI and CI are separate validated work, not inferred from a dependency install.

Implementation follow-up: native Zod4 JSON Schema export plus registered Express route inventory was chosen over a parallel handwritten spec or a second DTO registry. It prevents route/body-schema drift but explicitly leaves query/response completeness open. The initially selected prom-client package emitted a deprecation warning; the maintained @prometheus-io/client successor is used instead. AsyncLocalStorage propagates request IDs to asynchronous pino operations; background work uses the explicit system identifier.
