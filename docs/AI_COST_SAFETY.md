# AI request admission and failure policy — Phase 3f

## Accounting

Server admission uses one atomic Redis Lua operation to check and reserve four counters and two concurrency leases before provider disclosure. User counters are global across workspaces; workspace counters aggregate authorized actors and internal services. A request is an admitted operation, not a token or currency amount. Failed, cancelled and unavailable-provider admissions consume allowance; rejected admissions do not partially charge other counters. UTC calendar days/months determine reset boundaries. Existing billing estimates remain separate.

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

Quota exhaustion/concurrency returns429; Redis admission failure or invalid configuration returns503 without starting a provider. Redis admission has a two-second deadline and fails closed; a late reservation may conservatively consume allowance. Usage is exposed only at authenticated `GET /api/v2/ai/usage?workspaceId=…`, after current central membership/active-tenant checks. It returns the caller's personal totals and selected workspace totals with `Cache-Control: no-store`. Existing completion and SSE contracts are unchanged.

## Deployment requirements and limits

All API/worker instances must share a private **standalone Redis** and the same quota configuration and synchronized UTC clocks. These multi-key scripts do not support Redis Cluster hash slots. Configure durable persistence (AOF), backups, and `noeviction`; deleting/losing Redis state resets counters. Counters expire after90 days of inactivity. This is distributed request limiting, not a durable financial ledger or an exact token/dollar spending cap. Set provider-side spending caps separately.

Concurrency leases expire after120 seconds to recover crashed workers, with explicit release on completion. Editor generation aborts on disconnect or a60-second deadline; provider SDK requests use10-second timeouts. Background completions have the same bounded SDK requests. A process or remote provider that ignores cancellation can continue charging remotely; client cancellation is not a refund guarantee. Failed lease release conservatively retains capacity until expiry.

Editor input limits remain16000 prompt/32000 context characters,1024 output tokens; background prompts are bounded to32000, system8000, output2000 tokens. Embedding input is capped at30000 characters. Existing HTTP body/rate ceilings also apply. Character limits do not measure tokens or guarantee price.

## Provider fallback

Groq is primary when configured, OpenAI is secondary only when configured; OpenAI can serve directly if Groq is absent. SDK retries are disabled for completions and embeddings. A secondary completion runs only if the primary is absent or returns401/403/404 before output admission. Network failures, timeouts,429,5xx, malformed successful responses and partial streams are not replayed. No keys produces a graceful unavailable response; background summaries retain their factual non-AI baseline. Task/PR job retries skip AI generation instead of replaying potentially billable output. Embedding outbox redelivery remains at least once and may repeat an embedding after a crash/ambiguous failure; each new attempt is quota-gated. Exactly-once remote billing is not claimed.

No live provider calls or cost measurements are part of the test evidence. The evaluation interface is in `backend/testing/ai-eval/README.md`; no dataset or results are bundled. PWA/offline delivery is deferred to Phase5.
