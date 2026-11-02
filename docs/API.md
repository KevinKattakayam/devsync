# API reference

The machine-readable contract is [backend/openapi.json](../backend/openapi.json), generated from mounted routes, validators and explicit transport DTOs. A running API serves JSON at `GET /api/docs`; this is not a Swagger UI. The reference must be read alongside [AUTHZ_MATRIX.md](AUTHZ_MATRIX.md) and [API_OPERATIONS.md](API_OPERATIONS.md). Schema documentation does not mean a universal runtime response validator or full external-provider interoperability is implemented.

## Origins, versions and identity

Local API origin is http://localhost:5000; frontend is http://localhost:3000. Production origins come from [RUNBOOK.md](RUNBOOK.md). Existing application routers retain `/api` aliases and `/api/v1`; newer features use explicit v2/v3 paths. The OpenAPI document's own info.version is not a mandate to rewrite all paths to that version. SCIM keeps `/scim/v2`. Operational `/api/health`, `/api/ready` and `/api/docs` retain their documented paths.

Protected application calls use a verified Clerk bearer identity, then current local principal/workspace/resource policy. Provider IDs are not interchangeable with local database IDs. An ID in a URL, a UI role, a feature flag or a source citation grants no access by itself. Webhooks use their native verified signatures/raw-body boundary; SCIM and trusted service/global-admin paths have separate credentials/policies. Keep tokens out of URLs, terminal examples, screenshots and issue reports.

## Interface map

| Interface                                            | Scope and important limits                                                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/auth/sync`, `/api/v1/auth/me`               | Local identity sync/read and allowlisted profile updates; not custom login/password/session administration.                                                                      |
| `/api/v1/workspaces` and scoped resources            | Workspace/member/invitation, document, board/task, snippet, search and repository operations; use exact verbs and bodies from OpenAPI. Viewer read access does not grant writes. |
| `/api/v1/documents/{id}`                             | Resource-resolved tenant authority; archive behavior is not privacy erasure or arbitrary CRDT snapshot replacement.                                                              |
| `/api/v1/tasks/tasks/{taskId}` and `/move`           | The double tasks segment is the existing contract; do not silently normalize it.                                                                                                 |
| `/api/v1/workspaces/{id}/documents/ingest`           | Authenticated multipart ingestion, with writer authority; extraction isolation/deadline limits remain documented.                                                                |
| `/api/v1/snippets/execute`                           | Host execution is disabled; a UI action or installed library does not establish execution capability.                                                                            |
| `/api/v1/ai/complete`, `/api/v3/ai/complete`         | Bounded AI SSE; v3 provides typed admission errors. Preserve the legacy event contract.                                                                                          |
| `/api/v2/ai/usage`, `/api/v3/ai/usage?workspaceId=…` | v2 cumulative admissions versus v3 charged reservations/resets. Caller-global personal totals plus only the selected authorized workspace aggregate. No-store.                   |
| `/api/v2/workspaces/{workspaceId}/decisions`         | Optional manual source-bound decisions. OWNER/EDITOR draft writes; OWNER acceptance/supersession; source reauthorization and revision conflicts.                                 |
| `/api/v2/workspaces/{workspaceId}/snippet-safety`    | Optional server preflight/save and masked findings. Viewer cannot preflight/save; server rescans before confirmation-based persistence.                                          |
| `/api/v2/workspaces/{workspaceId}/digest`            | Optional personal opt-in, eligible evidence items, source proof and acknowledgment; no model or outbound scheduled messages.                                                     |
| `/api/v1/webhooks/github`, `/api/v1/webhooks/stripe` | Native signed callbacks and delivery policy; not end-user bearer endpoints or proof an account is configured.                                                                    |
| `/scim/v2/Users`                                     | Implemented custom provisioning surface; do not claim general SCIM conformance, SAML setup or account-erasure support.                                                           |

Feature details: [decisions](features/decision-receipts.md), [snippet safety](features/snippet-safety-preflight.md), [digest](features/async-digest.md). They default off and must be enabled consistently after forward migrations.

## Errors, retries and streaming

`X-Request-ID` identifies server-handled requests. Use the actual operation's OpenAPI status/error schema; do not assume every native parser/webhook/Next error has one universal envelope. Expected categories include401 identity failures,403 policy denial,404 hidden/missing or disabled scope,409 stale revisions/idempotency conflicts,429 rate/quota/concurrency and503 unavailable authority/storage/provider configuration. v3 AI limit errors include scope, period, resetAt and Retry-After.

Idempotency-Key is supported only where declared; keys are principal/scope-bound and a conflicting request can fail rather than create twice. This does not authorize retrying arbitrary mutations or billable AI. SSE consumers must parse complete events across network chunks, retain errors/partial output and cancel safely. Partial generation is not automatically applicable to an editor selection; references do not prove factual support. See [AI_COST_SAFETY.md](AI_COST_SAFETY.md).

## Real-time and operational interfaces

Socket.io at the backend origin handles presence/task events. Hocuspocus at `/yjs` handles Yjs rooms, tokens, updates and awareness. They are distinct protocols; do not connect a plain y-websocket client or append a document ID to an invented HTTP path. Viewer editability is enforced by the server. See [ARCHITECTURE.md](ARCHITECTURE.md) and [CRDT_OPERATIONS.md](CRDT_OPERATIONS.md).

`GET /api/health` is liveness; `/api/ready` checks dependencies/configuration. A keyless local stack intentionally returns readiness503 while liveness remains200. `/metrics` is disabled without its configured protected credential; frontend `/healthz` is independent liveness. The frontend also has the legacy cookie-reset handler and a restricted service proxy: neither is a privacy/account lifecycle product. Legacy cookie-clearing GET/CSRF migration remains open.

## Updating contracts

From repository root, after backend dependencies are installed:

```sh
npm --prefix backend run openapi:check
npm --prefix backend run openapi:generate
```

The second command writes the artifact and belongs in an intentional reviewed contract change, not a read-only verification. Version incompatible API/WebSocket changes. Do not remove legacy aliases without a separately reviewed migration/notice process. Use the non-bypass integration suite and isolated fixture browser harness described in [CONTRIBUTING.md](../CONTRIBUTING.md); never add fixture authentication to production.
