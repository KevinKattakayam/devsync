# ADR 009 — Real transport tests and measured coverage floors

Status: accepted for Phase 1b.

Context: prior tests mostly mocked handlers, so document authorization, persistence acknowledgements and cross-instance behavior could pass without a functioning connection adapter. Coverage was not enforced. Browser authentication depends on real Clerk identities.

Options: mocks alone (fast, misses protocol and database boundaries), shared developer databases (risky and order dependent), or disposable PostgreSQL/Redis plus real Yjs/WebSocket clients. For frontend, use component tests alongside existing Node tests; do not replace either with E2E alone.

Decision: Testcontainers provisions PostgreSQL/Redis, migrations create a fresh schema and a non-bypass runtime role exercises tenant RLS. Simulated clients use real Yjs, Hocuspocus, WebSockets and Redis. A child process is SIGKILLed after a committed acknowledgement while its snapshot is still stale. Only identity verification is injected in test executables. Frontend Vitest/jsdom tests use real TipTap/Yjs, with a simulated transport/IndexedDB API for lifecycle isolation; browser E2E remains a distinct requirement. A local HTTP OTLP collector verifies actual export and redaction.

Coverage is measured before choosing floors. Initial reliability run (imported files) reported 50.07% statements / 30.97% branches / 41.6% functions / 53.6% lines. The enforced configuration now includes all production source, so its full-project numbers will differ. Critical collaboration/journal/migration floors are based on that real run, never described as comprehensive security coverage. Existing tests are retained; a failing floor requires more meaningful tests, not rule suppression.

Consequences: Docker and local sockets are required. Tests take longer and can expose genuine races; failed attempts remain evidence. CI, formatting and authenticated browser coverage are incomplete until explicitly implemented and executed with suitable fixtures. Passing component tests does not claim a passing E2E suite.
