# AI request admission and failure policy — Phase 3f

## Accounting

Server admission uses one atomic Redis Lua operation to check and reserve four counters and two concurrency leases before provider disclosure. User counters are global across workspaces; workspace counters aggregate authorized actors and internal services. A request is an admitted operation, not a token or currency amount. Confirmed pre-provider failures and explicit pre-admission 401/403/404/429 rejections refund all four charged counters exactly once. Ambiguous failures, cancellation after dispatch and partial output retain the charge. Rejected quota admissions do not partially charge other counters. Legacy v2 counters remain cumulative admissions. UTC calendar days/months determine reset boundaries. Existing billing estimates remain separate.

Defaults (positive integer environment overrides):

| Setting                       | Default |
| ----------------------------- | ------: |
| AI_QUOTA_USER_DAILY           |     100 |
| AI_QUOTA_USER_MONTHLY         |    1000 |
| AI_QUOTA_WORKSPACE_DAILY      |    1000 |
| AI_QUOTA_WORKSPACE_MONTHLY    |   10000 |
| AI_QUOTA_USER_CONCURRENT      |       2 |
| AI_QUOTA_WORKSPACE_CONCURRENT |       5 |

Editor requests reserve before billing/context retrieval. Query embeddings reserve their own operation too, so a context-assisted generation can consume two admissions. Indexing uses a workspace-specific internal service principal; repository summaries use a registered-repository service principal; task summaries use the initiating user. These service counters cannot be selected by HTTP clients. Existing central user, repository and embedding authority checks run before admission/disclosure. Injected embedding providers are a test seam; production uses the gated provider. Workspace usage includes indexing and summaries. Personal usage includes the user's completions and query embeddings.

Quota exhaustion/concurrency returns429; Redis admission failure or invalid configuration returns503 without starting a provider. Redis admission has a two-second deadline and fails closed; a late reservation may conservatively consume allowance. Charged-reservation usage is exposed at authenticated `GET /api/v3/ai/usage?workspaceId=…` (v2 retains its cumulative-admission shape), after current central membership/active-tenant checks. It returns the caller's personal totals and selected workspace totals with `Cache-Control: no-store`. The v3 completion endpoint returns typed quota scope/period/resetAt and Retry-After on quota rejection. Existing legacy/v1 completion and SSE shapes remain supported. Both usage reads and reservation commands have a two-second deadline.

## Deployment requirements and limits

Deploy all API/worker instances together; mixed legacy/new quota writers are unsupported. All API/worker instances must share a private **standalone Redis** and the same quota configuration and synchronized UTC clocks. These multi-key scripts do not support Redis Cluster hash slots. Configure durable persistence (AOF), backups, and `noeviction`; deleting/losing Redis state resets counters. Counters expire after90 days of inactivity. This is distributed request limiting, not a durable financial ledger or an exact token/dollar spending cap. Set provider-side spending caps separately.

Concurrency leases expire after120 seconds to recover crashed workers, with explicit release on completion. Editor generation aborts on disconnect or a60-second deadline; provider attempts use10-second hard deadlines plus SDK timeouts. Background completions have the same bounded SDK requests. A process or remote provider that ignores cancellation can continue charging remotely; client cancellation is not a refund guarantee. Failed lease release conservatively retains capacity until expiry.

Editor input limits remain16000 prompt/32000 context characters,1024 output tokens; background prompts are bounded to32000, system8000, output2000 tokens. Embedding input is capped at30000 characters. Existing HTTP body/rate ceilings also apply. Editor output is additionally capped at16384 characters and raw AI request bodies at200000 bytes. Character limits do not measure tokens or guarantee price.

## Provider fallback

Groq is primary when configured, OpenAI is secondary only when configured; OpenAI can serve directly if Groq is absent. SDK retries are disabled for completions and embeddings. A secondary completion runs only if the primary is absent or returns401/403/404 before output admission. An explicit429 rejection retries at most once after250ms under the same reservation, without fallback. Network failures, timeouts,5xx, malformed successful responses and partial streams are not replayed. No keys produces a graceful unavailable response; background summaries retain their factual non-AI baseline. Task/PR job retries skip AI generation instead of replaying potentially billable output. Embedding outbox redelivery remains at least once and may repeat an embedding after a crash/ambiguous failure; each new attempt is quota-gated. Exactly-once remote billing is not claimed.

No live provider calls or cost measurements are part of the test evidence. The evaluation interface is in `backend/testing/ai-eval/README.md`; no dataset or results are bundled. PWA/offline delivery is deferred to Phase5.

See [ADR020](adr/020-ai-reservation-settlement.md) for migration, refund and conservative-failure decisions. Settings displays the caller's global account allowance, selected workspace totals, UTC reset times and concurrency limits; changing workspace clears previous totals immediately.
