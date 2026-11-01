# ADR015: tenant-bound embedding outbox and draining scheduler

Context: resource writes produced PostgreSQL jobs, while the standalone worker listened only to BullMQ. Unscoped resource queries failed under forced RLS. Old processing could lose a queued edit or retain a processing job after a crash.

Decision: producers require an authorized writer and tenant transaction, validate the resource scope, and record workspace plus revision in the same transaction as the content. Migration resolves existing scope from actual resources; unresolvable jobs are quarantined for operator review. Maintenance workers may access resource data only through the central service policy, an active workspace and the matching durable outbox record. This is a scoped maintenance authority, not an impersonated owner.

Claims use PostgreSQL FOR UPDATE SKIP LOCKED, a random lease token, one job per claim and a120-second expiry. Acknowledgement/retry binds workspace, revision and lease. New writes reset the lease and advance revision, so an older worker cannot delete new work. Provider responses must be1536 finite numbers and are SQL parameters. Content is hashed and rechecked after the provider call before applying a vector. Five failed attempts retain a dead job for review; missing/unavailable providers do not silently discard jobs.

The standalone worker now polls the actual PostgreSQL outbox. API opt-in and worker use the same nonoverlapping scheduler. Stop cancels admission and awaits the in-flight batch before closing dependencies, within the existing hard shutdown deadline.

Consequences: recovery after a crashed claim can take up to two minutes. Provider/per-workspace cost caps and embedding freshness enqueueing for every CRDT-only edit remain separate concerns; no throughput benchmark is claimed. Legacy BullMQ payloads without an explicit workspace fail closed. Migration needs suitable privileges to read protected resource scope; unknown records require human review.
