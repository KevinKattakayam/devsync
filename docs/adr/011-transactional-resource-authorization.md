# ADR011: transactional resource authorization

Status: accepted for the resource handlers converted in Phase1c.

Context: route middleware is insufficient for controllers/workers used independently. Forced tenant RLS makes an unscoped document, snippet or task lookup fail even for a legitimate member. Authorization before a separate transaction also leaves a membership-change race.

Options: bypass RLS to discover tenants; require a new workspace header on legacy resource URLs; or resolve legacy IDs through the principal's memberships and authorize again inside the tenant transaction.

Decision: retain RLS and existing resource URLs. A shared resource policy resolves protected IDs only inside candidate membership scopes. The operation runs in that same transaction after active-user, unsuspended-workspace and role checks. Workspace locks serialize writes within a tenant; shared principal/membership locks protect the authorization decision until commit. Read operations use shared workspace locks. Missing/foreign resource IDs produce the same denial. Related parents, columns and assignees must belong to the authorized tenant.

The Prisma composition boundary supports an AsyncLocalStorage database binding for isolated integration fixtures and future explicit units of work. HTTP input cannot select the binding; production uses the configured client. This changes no authentication mechanism and introduces no login endpoint.

Consequences: legacy resource discovery costs one tenant transaction per candidate membership until the ID is found. Tenant write serialization favors correctness over maximum throughput and must be measured before optimization. Canonical document content writes, service capability policies, invitation acceptance and atomic idempotency require separate changes; this ADR does not assert those paths are converted.
