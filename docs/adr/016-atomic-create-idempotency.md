# ADR016: atomic create receipts

Context: a response cache separate from creation cannot handle a create/ack crash window, and two concurrent requests can both create a resource.

Options: Redis reservations with a later response write; a unique database key around otherwise separate transactions; or a PostgreSQL receipt committed in the same transaction as the resource, activity and outbox writes.

Decision: authorized create transactions optionally accept Idempotency-Key. A SHA-256 key binds the verified authority, logical operation/resource scope and caller key; legacy/v1 aliases use the same logical scope. Sorted validated JSON determines a request digest. INSERT ON CONFLICT and SELECT FOR UPDATE serialize duplicates, including concurrent workspace creation. Response JSON and domain writes commit together; any error rolls both back. Reuse with another body returns409. Replay always occurs after current authorization checks. No raw key, request payload or secret is stored in the receipt.

Receipts live for24 hours. Responses are limited to1MiB; keys to128 printable ASCII characters. Creates without a key preserve the prior contract. Expired receipts may be reused; bounded per-authority cleanup occurs on keyed creates. Operators should schedule global expired-receipt cleanup for inactive authorities. This TTL is a retry window, not a promise that a key can never create another resource.

Consequences: keyed duplicates may wait for the original transaction to commit. Provider/OCR work before the final transaction can still happen twice; only durable resource creation is exactly fenced. Webhooks retain provider delivery IDs, identity sync its provider-ID upsert, and streaming AI its separate request/usage protocol. These are documented exceptions rather than fake cached streams.

Receipt copies have forced PostgreSQL RLS bound to transaction-local authority, so introducing the cache does not expose protected document/snippet data through an unscoped table. Ingestion and SCIM are included. SCIM replay avoids repeated ACL disconnect notifications. Operator retention cleanup for inactive authorities is still a deployment responsibility.
