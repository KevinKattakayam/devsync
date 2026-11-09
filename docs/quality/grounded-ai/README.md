# Grounded assistant — local preview implementation

Branch `upgrade/enterprise`, starting clean at `88d1017`. Existing Groq/OpenAI gateway, bounded fallback, Redis request quotas, billing admission, current tenant policy and Postgres lexical retrieval are reused. Existing streaming completion contracts remain intact.

Preflight found the provider adapter and quota implementation in `backend/src/services/ai-gateway.service.ts`, `ai-provider.ts`, `ai-quota.ts` and `middleware/billing.middleware.ts`; permission-aware lexical/source lookup in `services/knowledge-search.ts`; and the existing streaming Copilot in `frontend/src/components/ai-copilot-drawer.tsx`. Numbered-source prompt boundaries in `services/ai-prompt.ts` were partial defense only: streaming output had no citation allowlist/parser or post-generation source recheck. `backend/testing/ai-eval/scaffold.ts` had no reviewed corpus or bundled scores. Those existing systems were extended rather than replaced, and no new source store or decision model was introduced.

## Behavior

The additive `POST /api/v3/ai/grounded` is disabled unless `FEATURE_GROUNDED_AI=true`. The optional Copilot panel requires `NEXT_PUBLIC_FEATURE_GROUNDED_AI=true` at frontend build time. It provides workspace Q&A, summary, recorded PR brief, risk explanation, task drafts, decision drafts and link proposals. Retrieval reads at most six current accessible lexical projections (320-character excerpts). No embedding provider is needed for retrieval. Natural language queries without matching lexical terms can return insufficient evidence; this is not a claim of complete workspace coverage.

The legacy streaming completion path retains its existing candidate-source behavior. It does not gain the structured grounded endpoint's citation validation or constitute a verified-answer channel. The optional panel is labeled separately in Copilot.

Only explicit task/decision/link requests can return those proposal types. All claims/proposals require bounded numeric references. Unknown reference numbers, unstructured citation markers, generated URLs/HTML in prose, unknown fields, acceptance states and executable action types reject the entire response. Link endpoints must be distinct accessible references. The model has no write capability. Drafts are shown as plain text for manual review and creation through existing task/receipt workflows; no one-click executor or automatic acceptance exists. Accepted receipts, fingerprints and journals are untouched.

Source instructions are supplied as JSON data under an untrusted-source policy. Prompt delimiters alone cannot prove resistance to every injection. The enforced boundary is the strict parser, accessible source allowlist and absence of mutation capabilities. These controls do not establish factual entailment. Current membership/source visibility and title/excerpt/update time are rechecked after provider I/O. Revoked, archived, disconnected or changed sources fail without returning cached derivatives. Existing owner-only GitHub source access and receipt/snippet flags remain in effect.

The existing gateway performs bounded provider calls and request reservations. Missing/failing providers return a sanitized 503; malformed/citation-invalid output returns 502; quota denial remains 429. No matches returns insufficient evidence without a provider call. Existing billing admission precedes the call; inherited request and estimated-token accounting is not an authoritative money ceiling. The UI reports latency but explicitly reports provider cost unavailable. No real provider response or factual accuracy claim was produced in this session.

## Evaluation

`backend/testing/ai-eval/grounded.ts` exports a strict reviewed-case schema and `evaluateGroundedCases`. Each case requires actor/workspace, question, expected source IDs/statements and review attribution/time. It returns per-case exact citation/text matching diagnostics, latency and unavailable cost; exceptions produce rejected/unavailable records without exposing provider error text. Text matching is not a semantic truth score. The default adapter calls the same authorized preview service and quota policy; operators must explicitly authorize any real calls/spend and use approved isolated data. Tests use clearly labeled synthetic fixtures only.

The user confirmed **no reviewed cases are available**. There is no human-reviewed model evaluation corpus, live cost report or evidence-backed model-quality score. Those acceptance requirements remain blocked on approved deidentified cases and authorized provider execution. Review attribution in a local file is operator attestation, not cryptographic proof. No dataset or successful real-model evaluation is invented.

## Verification and retained failures

Final per-app gate JSON files record lint, formatting, strict types, full tests and builds. Backend suites exercise real disposable PostgreSQL with tenant RLS; provider responses in grounding tests are mocked. Frontend success/error and source-withdrawal tests are fixtures. `browser-final.txt` records one actual Chrome journey against local PostgreSQL/Redis with fixture identities and provider keys deliberately cleared: provider-unavailable UI and viewer draft denial pass. It does not demonstrate real Clerk/model/GitHub success. No screenshot was captured.

The initial schema test exited 1 because the new module did not exist; its diagnostic was observed in session tool output, and no full raw log was captured for that initial run. Retained files show the backend formatting failures, unsupported frontend test matcher types, missing Playwright executable, incorrect browser setup route, and HTTP regression missing its verified fixture identity header. The first comparison against the immediately preceding phase also exposed a function-coverage decrease; substantive HTTP regression coverage was added rather than lowering the baseline. Corrections retain original assertions, production authentication and coverage/scan policy. `RESULTS.json` consolidates final commands/statuses and remaining limits.

## Setup and rollback

Configure approved `GROQ_API_KEY` and/or `OPENAI_API_KEY` privately using existing backend environment conventions. Keep keys out of chat, source and logs. Existing `GROQ_MODEL`/`OPENAI_MODEL`, quota settings and provider failure/fallback policy apply. Enable both flags consistently only after review; frontend public flags are baked at build time. Use approved nonproduction identities and sources. No existing GitHub repository may be accessed for live acceptance without separate approval.

There is no migration or new persistent source/decision store. Rollback disables the backend flag and removes the optional frontend flag at rebuild; existing streaming completion/search/tasks/receipts remain available. Existing data is unchanged. No push, deploy, production-data modification or later phase work occurred.

## Accepted local gates

- `python3 tools/quality/gates.py backend docs/quality/grounded-ai/backend-verified`: every command exits 0; 34 suites/336 tests, lint/format/strict types/build.
- `python3 tools/quality/gates.py frontend docs/quality/grounded-ai/frontend-accepted`: every command exits 0; 25 files/104 component tests plus 9 Node tests, lint/format/types/build.
- `node tools/ci/coverage.mjs backend backend/coverage/coverage-summary.json docs/quality/grounded-ai/backend-previous-phase-percentages.json`: exit 0. The baseline file explicitly derives percentages from the preceding phase's recorded comparison, without inventing counts. Final backend coverage: statements83.85%, branches74.89%, functions77.37%, lines86.08%.
- `node tools/ci/coverage.mjs frontend docs/quality/grounded-ai/frontend-accepted/frontend-coverage/coverage-summary.json docs/quality/decision-execution/frontend-final-pickers/frontend-coverage/coverage-summary.json`: exit 0. Final frontend47.87%,42.89%,45.30%,48.75%.
- `npm run openapi:check --prefix backend`: exit 0. Semantic comparison preserves every old path and adds one grounded endpoint.
- `E2E_CHROMIUM_PATH=/opt/google/chrome/chrome node tools/ci/browser.mjs grounded`: exit 0, one fixture Chrome journey, recorded in `browser-accepted.txt`.
- Both `npm audit --json --audit-level=high` commands exit 0, retaining full findings in the audit JSON files; lower severity findings are not suppressed. Pinned Semgrep and Gitleaks commands/exits are in `security-final.json`. Workflow YAML parses successfully; hosted CI was not run.
