# ADR014: explicit service authorities

Context: provisioners, signed webhooks and private queue workers cannot be authorized as ordinary workspace members. Ad-hoc service checks left worker scope and suspended tenants inconsistent; treating a chosen OWNER as the acting identity obscured authority.

Decision: central service policies validate the actual credential and tenant binding in the transaction that performs the mutation. SCIM tokens bind one unsuspended workspace and are rechecked under a credential lock. Repository webhooks verify the repository's current HMAC secret under the workspace write lock; private repository jobs recheck an explicit registered repository/workspace pair. Global superadmin operations require either a verified, active local SUPER_ADMIN or a configured constant-time-checked service secret of at least32 characters. No default secret is accepted.

SCIM authority concerns workspace membership and external identity links. It must not deactivate or rename a shared Clerk user globally, rebind an existing external ID to another account, alter an OWNER membership, or grant OWNER. Local-only SCIM placeholders are not advertised as working provider identities; actual Clerk provisioning/linking remains a separate migration concern.

Consequences: old unattributed jobs fail closed and must be reissued with verified scope. Stronger SCIM errors and role restrictions are intentional security corrections. Transactions serialize service writes with interactive writes; external providers/queues should run outside database locks. Delivery outboxes, provider event ordering and idempotent retries remain separately verifiable reliability requirements.

Billing follow-up: the same central policy module verifies Stripe signatures and derives the target from the signed checkout metadata or registered customer/subscription. Billing cannot clear administrative suspension. GitHub delivery records and database effects now share a transaction; publishing a queue job after commit still needs a durable outbox for complete retry guarantees.
