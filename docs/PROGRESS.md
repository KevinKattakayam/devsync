# Progress — Phase 1b partial delivery

Branch: `upgrade/enterprise`. No push, deployment, production data change, key rotation or Phase2 work. Phase1b is **not complete** and is not a production-readiness certification. Historical Phase1a gaps are retained below; its ledger did not match the assertion that it was complete.

## Done

- Read audit, authorization matrix, fix order, progress and ADRs; root AGENTS.md and docs/MASTER_PROMPT.md were absent. Followed user-supplied AGENTS.md and frontend/AGENTS.md. ADR007 preceded realtime implementation.
- `e3d32fa`: retained actual Yjs/TipTap/Hocuspocus, added tenant-RLS PostgreSQL update journal committed before acknowledgement, deduplication/compaction, Redis fanout, per-frame policy and viewer enforcement, member/role/token eviction and resource admission limits. Offline replicas now isolate room/account, reconnect with fresh tokens/backoff, and avoid browser-side legacy imports. Migration has dry-run, retained backup, repeatable apply, conservative rollback and seed-data tests.
- `3611dc5`: shared /api/v1 and legacy routers, correlated compatible errors, DB/Redis readiness, bounded shutdown, optional sanitized pino/OTLP/Sentry, protected metrics, route/Zod-generated partial OpenAPI and drift checks.
- `13b021b`: quality group with asynchronous request correlation, stronger real admission/token/ephemeral-room/reconciliation tests, warning-free frontend lint, Prettier across both apps, critical/global measured coverage floors, Node toolchain alignment, and CI configuration for install/lint/format/types/tests/contracts/build with PostgreSQL/Redis and dependency caching. No tests removed or assertions relaxed; the offline fixture now waits for actual transport closure, and admission tests assert the generic protocol denial plus resource invariants.
- Original-main BEFORE captures attempted in a separate unmodified worktree. Public auth pages and login access states were captured; landing retry shows HTTP500. Full authenticated interiors remain blocked. See ui/before/README.md.

## Verification

Final gates pass, consolidated in `phase1b-evidence/delivery-results.json`: backend from `final-retry-results.json`, frontend from `final-results.json`. Both clean installs, lint, formatting, strict type-checks, tests and builds pass. Backend: **13 suites / 83 tests** with coverage enforcement. Frontend: **0 lint warnings/errors**, retained original Node tests and four component tests. The first final backend reinstall timed out because a clock rollback left Node headers future-dated; ssh2 repeatedly regenerated its native Makefile. Only future timestamps in the specific Node-header cache were normalized (contents unchanged), then the entire backend gate passed. No install scripts or tests were bypassed.

All-source backend coverage from that verified run: **47.01% statements / 32.81% branches / 39.10% functions / 48.47% lines**; collaboration-server coverage is **87.72% statements / 80.47% branches / 93.54% functions / 91.23% lines**. This is limited overall coverage, not comprehensive security proof. Seventeen collaboration scenarios use real Yjs/WebSockets/PostgreSQL/Redis; child processes verify SIGKILL recovery and actual OTLP export. The frontend transport/IndexedDB API is simulated only in lifecycle component tests.

Final dependency audits: backend **0 Critical / 0 High / 41 Moderate / 2 Low**, frontend **0 Critical / 0 High / 16 Moderate / 0 Low**. Nonzero audit exits are retained; I01 is not fully closed. The final OpenAPI drift check passes (`delivery-openapi-check.log`). CI YAML parses locally; no GitHub workflow execution or Playwright E2E pass is claimed. Failed gates/attempts remain evidence.

## Deferred — exactly what and why

| Priority / area | Remaining work and reason |
|---|---|
| Canonical content / G06, G01 | Compaction derives JSON and marks embeddings stale, but REST/agent JSON mutations still need canonical Yjs operations and affected metadata routes still have inherited RLS gaps. Requires transactional server mutation/API integration; current work prioritized durable socket edits and regression gates. |
| Realtime compatibility/scaling | Bare-ID aliases use separate Redis topics from canonical names; mixed-name immediate fanout remains open. Limits are per instance, not cluster-wide. Large offline batches need chunking/product handling. Redis outage catch-up, strict pending-queue bounds under sustained DB latency, stale-timeout awareness and load/heap behavior are not fully verified. Do not advertise these as completed scale guarantees. |
| Socket.io ongoing authorization | Existing inbound domain policies remain, but the Hocuspocus expiry/removal sweep is not a complete Socket.io session/outbound-room revocation implementation. Needs analogous real transport tests before expansion. |
| Atomic create idempotency | No create-endpoint Idempotency-Key implementation. Requires atomic database/controller work; a response cache with a create/ack crash window was deliberately not presented as a fix. Existing webhook deduplication is separate. |
| Full contracts | OpenAPI route/body schemas and drift checks are implemented; query/response/bespoke validators remain unregistered and operations explicitly mark validation incomplete. Requires endpoint contract modeling. |
| Full observability/resource lifecycle | New API pino logs preserve correlation and redact data; legacy console/worker logs and worker shutdown remain. Explicit tenant-transaction spans exist; complete Prisma-engine and ioredis6 auto-span coverage is not claimed. Production collectors, scrape rules and error-report delivery are not provisioned. |
| Strict no-any / full lint policy | AST inventory finds 32 legacy explicit TypeScript any annotations, with no suppression markers in scanned source. Backend lint remains its inherited syntax policy alongside strict tsc; a comprehensive no-explicit-any rule is not yet green. Safely typing legacy routes/services needs more contract work; no casts/suppressions were added to hide failures. Inventory: phase1b-evidence/legacy-type-escape-inventory.json. |
| Authenticated E2E and CI E2E gate | Not implemented/executed. Three real Clerk test identities/credentials are absent; invite acceptance and portions of requested auth lifecycle do not exist in inherited1a. Fixtures and missing flows must be addressed before end-to-end claims. Existing browser tests remain present; no skips were added to make CI green. |
| BEFORE interiors / I09 | Main's seed command points to missing prisma/seed.ts (real ERR_MODULE_NOT_FOUND retained); no authenticated seeded browser session exists. 18 protected captures are login redirects, eight public auth captures render, and two home retries show HTTP500. Runtime logs show proxy ECONNRESET; root cause remains unverified. Current seed conversion is tested on disposable DBs, not misrepresented as a populated main UI. |
| Other inherited1a gaps | Custom cookie rotation/reuse revocation, startup/rate controls, broader validation/quotas/data/API gaps remain as listed in the historical ledger. Clerk remains; no auth cutover was fabricated. |

## Requires human action

- Provide three existing Clerk development/test identities and approved browser login credentials/testing capability. Configure repository variable NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and secret CLERK_SECRET_KEY for CI builds; no production credentials should enter fixtures.
- Provision private authenticated Redis and persistent WebSocket hosting; Vercel request functions do not host these long-lived servers. Configure metrics scrape secret and optional OTLP/Sentry destinations/retention if desired.
- Review migration privileges, take and rehearse restoring a DB backup, test existing production data and schedule writer-stopped conversion. Adopt migrations with separate non-bypass runtime credentials. Do not roll back over subsequent edits.
- Review remaining Moderate/Low advisories and the open security/data/realtime items before production adoption. No keys rotated, no infrastructure applied, no push performed.

Detailed operations/ADRs: CRDT_OPERATIONS.md, API_OPERATIONS.md and adr/007–009. Raw baseline/gates/failures, coverage, audits and UI manifest are under phase1b-evidence/ (initial baseline runner logs remain in phase1a-evidence/phase1b-baseline-*). The original-main worktree is detached under .worktrees/phase1b-main; its application tree is unchanged and ignored configuration stays uncommitted.

---

# Progress — Phase 1a partial delivery

Updated 2026-10-31. Branch `upgrade/enterprise`. No push, deployment, production database mutation, key rotation or real identity provisioning. Phase 1a is **not complete**; do not treat this branch as production-ready. Root AGENTS.md and docs/MASTER_PROMPT.md were absent; the user's supplied session rules were followed. Phase 0 evidence remains in AUDIT.md and audit-evidence/.

## Done

| Findings | Code changes and regression evidence |
|---|---|
| D01 Critical | Middleware uses parsed Zod output; controller independently validates a strict profile allowlist. Role, Clerk ID and nested membership assignment attacks reject before ORM mutation. |
| E01 Critical | All host child-process execution removed. Existing endpoint returns503; no insecure enable flag. Harmless execution-boundary regressions fail before/pass after. Execution functionality remains unavailable until a genuinely isolated executor exists. |
| D02 Critical / D07 | Document workspace must match room prefix; missing/archived documents reject; shared membership/active-user/tenant policy applies; viewer connection marked read-only by Hocuspocus. Protocol/model not rewritten. Ongoing revocation and RLS-safe resolution still C01/G01. |
| D03/D04 | Socket join/leave/cursor and all four Kanban mutation inputs invoke shared workspace policy. Kanban requires writer role, target task/columns bound to workspace and canonical stored task data; moves must match committed state. Positive member/editor cases preserved. |
| D05/D06/D08 | Member updates/deletes bind target workspace, columns require board workspace editor permission, parent creation validates tenant/archive state and nested children filter workspace. D08 additionally enforced by composite database FK. D09/D10 remain open. |
| E02 | AI raw HTML escaped before trusted Markdown formatting, including headings/lists/tables; existing code escaping retained. HTML attack regressions fail before/pass after. This does not validate all stored TipTap JSON. |
| G08 | Signed webhook task reads and updates explicitly restrict repository workspace in one tenant transaction. Regression proved foreign-task update before and blocks it after. G09 delivery processing still open. |
| G02 / G12 partial | Historical baseline generated from actual pre-enterprise Git schema; four existing migrations unchanged. Actual full migration chain tested on empty pgvector; forward identity NOT NULL, tenant relationship/list indexes and composite parent constraint. Existing-data adoption requires verification/backfill. Pagination/other RLS callers still open. |
| I09 | Non-production seed script, explicit write opt-in and three supplied Clerk IDs, atomic tenant transaction and stable fixture IDs. Actual seed twice is idempotent. It creates local records, not working Clerk accounts/passwords. |
| I02 | Existing PostgreSQL/queue suites repaired without deleting assertions. Explicit lint/typecheck/test scripts added; frontend lint errors fixed through types/component identity/effect structure without rule suppression or ts-ignore. Quality-only Kanban dependency stabilization does not fix its LWW data model. |
| I01 partial / hygiene | Next16.4.3, coherent TipTap3.32.2, Express4.22.3, Multer2.5, Zod4.6.7, matching testcontainers12 tooling; unused NextAuth/deprecated cursor dependency removed. Direct import dependencies declared. No forced or peer-bypassed installation. Both env examples cover current variables; artifacts ignored. No actual committed secret identified in reviewed source; exhaustive historical secret scanning was not done. |

Root CHANGELOG.md, updated AUTHZ_MATRIX.md, migration/seed guide and six ADRs document decisions and limitations. Audit narratives retain Phase0 source locations and now point to current status. Recovered historical baseline is recorded in phase1a-evidence/pre-enterprise-schema.prisma.

## Final verification

- Backend: **9 suites / 55 tests passed**, including actual disposable database/Redis integration. Frontend: **5 unit tests passed**.
- Both clean installs, lint commands, application/seed typechecks and production builds pass. Frontend lint: **0 errors / 55 warnings**; warnings remain visible. Backend lint is newly introduced syntax checking alongside strict tsc; no previous backend lint rules were disabled.
- Dependency audits: backend **0 Critical / 0 High / 39 Moderate / 2 Low**; frontend **0 Critical / 0 High / 16 Moderate / 0 Low**. These are advisory entries, not application exploit counts; I01 is not wholly closed.
- Group1–4 logs and group3/group4-results.json record each group. For final dependencies, use **group5-results.json backend** and **group5-retry-results.json frontend**. The first frontend group5 clean install failed on an npm lockfile AJV inconsistency; normal install repaired it and clean install/checks then passed. Failed peer-resolution attempts are retained.
- Critical pre-fix:9 failed/2 passed, post-fix:11 pass. Authorization pre-fix:22 failed/4 passed; final30 authorization cases pass. HTML, webhook, migration, seed, hierarchy and dependency-floor red/green evidence retained. Initial root-level Prisma validation lacked DATABASE_URL; actual isolated migration and generated-client checks subsequently pass without defaulting credentials.
- No Playwright E2E or new authenticated screenshots; no CRDT rewrite, observability feature or OpenAPI work. Mocked handler tests do not claim complete raw-socket/provider/RLS coverage.

## Unfinished Phase 1a — in priority order

| Area / findings | Exactly what remains and why |
|---|---|
| Authentication replacement / C01–C04 | **Clerk remains the current implementation.** Requested custom httpOnly/Secure/SameSite cookies, short access lifetime, rotating refresh families/reuse revocation, server logout revocation, Argon2id, single-use verification/reset tokens, account-safe messages and cookie CSRF are **not implemented**. A provider-versus-custom question was raised; no answer received. The request authorizes further implementation, but deployed account/session cutover still needs a verified mapping/plan; no unsafe dual-auth shortcut was introduced in this session. |
| Startup/config/rate controls | Required-secret fail-fast validation, Redis-backed per-IP/per-account limiting, a production CORS allowlist configuration and OAuth/TOTP feature-flag policy remain. Existing configured CORS, Helmet and in-memory IP limits were retained; not replaced with claims of the requested design. |
| C01 ongoing access / D09/D10 | Active-session token expiry, logout/member/tenant revocation and eviction across Socket.io and Hocuspocus remain incomplete. Shared policy checks active user/tenant on affected operations but cannot be advertised as session-family revocation. Cross-workspace assignee validation and transactional last-owner invariants still need fixes/tests. |
| Full authorization centralization | Shared policy covers workspace middleware, task editor/column creation and affected socket/Hocuspocus boundaries. Standalone document/snippet resolvers, AI checks, SCIM/service/global-admin exception policies and every other route have **not** all been centralized. AUTHZ_MATRIX explicitly records remaining boundaries. |
| G01 High RLS coverage | Unscoped document/snippet/task lookup/mutation, collaboration persistence, search, embeddings and background paths still need tenant transactions and real migrated-schema controller tests with a least-privilege runtime role. The new database test proves policies, not full caller correctness. Do not bypass RLS to make these paths work. |
| E03/E04/H08 | Multer package upgraded, but upload still buffers before membership and OCR remains unisolated/unbudgeted. Frontend upload URL is still hardcoded localhost. Every body/query/param, rich-text node/attribute/URL and socket envelope is not yet fully bounded/sanitized. Snippet source is escaped data and cannot execute on host, but comprehensive stored-content validation remains. |
| F01–F03 AI | Atomic per-user/per-workspace reservations and accurate output/context/agent metering, concurrency/cost caps, streaming deadline/cancellation/retry/fallback, untrusted-context delimiting, archived retrieval exclusion and sensitive-error/prompt-log redaction remain. The XSS fix makes raw output inert; it does not solve prompt injection or quota accounting. These need a coherent tested billing/provider design, not hurried estimates presented as real usage. |
| G03/G04/G05/G07/G09/G10/G11 | Bounded Redis outage behavior, PostgreSQL/BullMQ embedding producer-consumer alignment, leases/retries, atomic task ordering/summary writes, durable webhook/Stripe processing, persistence failure propagation and durable embedding outbox still open. Signed webhook movement alone does not fix its early dedup acknowledgment. |
| Data lifecycle / G12 | Indexes are done; pagination on every list endpoint, remaining multi-step transactions, soft-delete policy and full cascade/restore review are not. Existing workspace/column cascade deletion behavior was not silently changed. |
| I01 remaining / I08 | Remaining Moderate/Low advisories and deprecations need separate compatibility review; no blanket forced major upgrades performed. License/disclosure policy and exhaustive historical secret scan remain. |

These are unfinished implementation tasks, not all external blockers. The delivered groups end at a passing, reviewable commit boundary; remaining security/session/tenancy work needs another substantive Phase1a increment rather than declaring completion or rushing a contract migration.

## Deferred outside this delivery

As requested, CRDT representation/replay/projection redesign (B01/B03/G06 and related H03/I04), observability, OpenAPI and Playwright E2E were not started. B02 received only a stable-fetch quality repair; B04 resource caps, B05 tab/heartbeat/rejoin correctness, H01 SSE framing and H02 local cache isolation remain. Frontend mock settings/history/billing/analytics, broader a11y/mobile/theme/template work (H04–H07/H09/H10), unsupported product claims (A01–A03) and infrastructure/CI/KEDA/Redis topology issues (I03–I07) remain in the audit. Frontend presence DTOs were aligned during typing, not a claim of complete B05 remediation.

## Requires human action

1. **No deployment yet:** review remaining High findings, especially G01/C01/F01/H08, before treating this branch as ready. No commits were pushed or applied to production.
2. If host execution was reachable, review access/incident scope and rotate exposed **Clerk, database, Redis, Groq/OpenAI, Stripe/webhook, superadmin-service, GitHub repository-webhook and Cloudinary credentials** as applicable. AES key rotation requires planned re-encryption of stored repository secrets before replacing ENCRYPTION_KEY. No actual key was rotated here.
3. Provide verified existing-user-to-Clerk identity mapping and the deployed schema/migration history. Back up and rehearse on a clone before baseline adoption or running legacy destructive identity migrations. Forward migration deliberately blocks null Clerk IDs and cross-tenant parents; do not reset/push/delete records to bypass it.
4. For usable authenticated fixtures, create three isolated Clerk test identities, supply their IDs in SEED_*_CLERK_ID and run the seed only in an isolated non-production database with explicit opt-in. Automated fixture IDs are not real login accounts. Provider dashboard/session/MFA/origin policy access remains unverified.
5. Confirm identity cutover expectations (requested custom auth versus retained provider) and authoritative deployment target; docs historically describe several. This is planning input for the remaining implementation, not a claim that custom auth requires permission to begin.
6. Supply licensing/disclosure ownership and the missing MASTER_PROMPT.md if still authoritative. No novel performance claims or benchmarks were invented.

## Session boundary

Five logical code groups are committed with finding IDs; final documentation accompanies the dependency group. Every delivered group has real install/lint/type/test/build evidence. Phase1a remains partial. Stop here; Phase1b has not begun.
