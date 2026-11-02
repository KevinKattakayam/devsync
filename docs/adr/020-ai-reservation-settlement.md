# ADR 020: conservative AI request reservation settlement

Status: accepted for Phase 3f. Supersedes the failure-settlement policy in the earlier Phase 3f notes; no financial-ledger claim.

## Context

Provider calls have an uncertain outcome after network failure, cancellation or partial streaming. Retrying those calls can duplicate remote work. The existing Redis admission mechanism bounded requests but consumed allowance even when no provider could run. Audit F01 also identifies a separate, unresolved problem: estimated input billing is not actual provider token/currency reconciliation.

## Decision

Reserve one operation atomically against global personal and selected workspace daily/monthly counters and both concurrency limits before provider disclosure. Use UTC calendar boundaries and positive integer environment limits. Central active identity/tenant membership precedes admission and usage reads. A viewer can read their own global account totals and the authorized workspace aggregate, never another person's totals or foreign workspace usage. Service actors remain internal capabilities.

Keep v2 cumulative admission counters and its DTO. Add v3 charged-reservation counters and a v3 usage DTO containing reset times, scope and concurrency limits. Initialize missing charged counters from legacy admissions so upgrades do not reset allowances. A new v3 completion route adds typed limit details and Retry-After; existing completion/SSE field shapes remain supported. The settings/editor clients adopt v3. Deploy all API/worker instances together: mixed old/new quota writers are unsupported.

An atomic, lease-owned settlement removes concurrency and refunds all four charged counters exactly once only for confirmed pre-provider failures or explicit HTTP 401/403/404/429 rejection before a stream opens. Legacy cumulative counts remain unchanged. Ambiguous failures, partial output and cancellation after provider dispatch retain the charge. A settlement failure retains allowance conservatively. Reservations expire concurrency after 120 seconds; counters persist for 90 days of inactivity.

Only a configured secondary provider may run, following absence or explicit 401/403/404 primary rejection. A 429 can retry once after 250ms under the same reservation; no retry/fallback on timeout, network failure, 5xx, malformed success or partial output. Disable SDK retries. Hard-bound each opening/nonstream operation to 10 seconds, editor streams to 60 seconds, and stop oversized output. Cancellation is propagated and locally enforced even if an iterator ignores it. These controls cannot guarantee remote cancellation or exactly-once provider billing.

Redis reads/admission/settlement have a two-second local deadline and fail closed. Late admission can conservatively consume allowance. Use one private standalone Redis with AOF, backups, noeviction and synchronized clocks; Redis Cluster is unsupported. Losing Redis state resets budgets. Logs/traces contain event counts, limit categories, provider labels and error status only, never prompt/document/key material.

## Consequences and limits

Request units bound calls with explicit input/output ceilings; they are not actual token or dollar accounting. Query embeddings reserve a separate operation; indexing and background generation contribute to workspace usage. Existing embedding outbox delivery is at least once and can repeat remote work after an ambiguous failure, each attempt admitted separately. Durable provider idempotency, authoritative token settlement and invoice reconciliation need a separate design and remain deferred. Provider-side spend caps are still required for monetary ceilings. No schema migration is needed for these Redis/API changes. Rollback requires coordinated processes; retaining legacy counters means reverting uses cumulative admissions conservatively, never refunded charged counts.
