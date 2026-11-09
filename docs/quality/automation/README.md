# Rules and approval-based automation — incomplete foundation

Starting branch `upgrade/enterprise`, base `f638641`. The existing BullMQ worker factory has exponential backoff and bounded attempts; signed GitHub delivery proofs and tenant policies already exist. Existing queue workers and signed webhook handlers were not replaced.

This checkpoint adds a strict, side-effect-free rule/event preview helper with an opt-in flag, supported trigger/action vocabulary, bounded debounce parameter and maximum event depth. It returns a requirement for approval. This is a local function only: it performs no tenant authorization, persistence, enqueue, execution or actual approval. Its caller-supplied depth is not a trusted loop-prevention mechanism. It must not be exposed as an authorization decision.

The `devsync-automation` queue receives automation-specific processor error sanitization before BullMQ records failed reasons. Its dead-letter records and logs omit raw payloads, job names, job IDs and error text; the dead-letter job ID uses a hash for deduplication. Existing queues retain their prior behavior. There is no automation producer or worker yet. Source BullMQ jobs still retain their own original data and job names/IDs, so a future producer must use bounded opaque IDs and must not place secrets or sensitive text in those fields. This checkpoint does not establish safe handling of arbitrary queued data.

A real disposable Redis integration test exercises two retries, stored failure redaction, redacted dead-letter payload and error logs. Schema tests cover disabled rules, mismatched triggers, depth bounds and rejected extra fields. No provider was contacted. No screenshot or browser flow is claimed. No migration or API contract was added.

## Verification

- `python3 tools/quality/gates.py backend docs/quality/automation/backend-verified`: lint, format, strict types, full tests and build each exit 0; 37 suites and 340 tests. Logs and individual statuses are in `backend-verified/`.
- `node tools/ci/coverage.mjs backend backend/coverage/coverage-summary.json docs/quality/grounded-ai/backend-coverage.json`: exit 0. Statements84.26%, branches75.12%, functions78.27%, lines86.59%; previous thresholds were not reduced.
- `npm run openapi:check` in backend: exit 0. Pinned Semgrep/Gitleaks runs and exit codes are in `security.json`. No dependency changes were made.
- The initial targeted policy and dead-letter tests exited 1 before their implementations; full logs are retained in `policy-red.txt` and `dead-letter-red.txt`. Targeted coverage failures are not presented as successful coverage gates. An intermediate gate started before the final changes and is not accepted as final evidence.

## Remaining phase work

Workspace-owned rules and RLS migration; current membership and role checks; trustworthy event provenance and event ingestion; persisted dry runs and explicit approvals; transactional idempotency, debounce and trusted loop detection; durable enqueue/outbox and recovery; action adapters with authorization and provider-unconfigured states; actual execution/error audit timeline; UI; API/OpenAPI updates; integration, authorization and browser acceptance tests remain unimplemented. The verified GitHub execution records are signed webhook observations, not independent verification of a live provider or deployment. The user has not authorized modifying existing GitHub repositories. No push, deployment, production-data change or Phase 11 work occurred. Continue this phase; do not treat the local preview or depth check as a functioning automation product.
