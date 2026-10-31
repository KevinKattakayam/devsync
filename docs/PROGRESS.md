# Phase 1b session — in progress (2026-11-01)

- Baseline: both installs, lint commands, type-checks, tests and builds passed. Frontend had 55 warnings. Evidence: `phase1a-evidence/phase1b-baseline-*` (runner location retained from Phase 1a).
- Read audit, authorization matrix, fix order, prior progress and ADRs. Root AGENTS.md and docs/MASTER_PROMPT.md were absent; followed the user-supplied AGENTS.md and frontend/AGENTS.md. ADR007 was written before realtime implementation.
- Current group: durable authorized document CRDT journal, Redis fanout, safe conversion/rollback, offline client lifecycle and real regression tests. Ten collaboration integration scenarios pass in isolation and in the full backend suite. First full gate exposed a revocation race, mock-hook teardown and nullable token callback error; those were fixed without removing/weaking assertions. Failed outputs are retained.
- Frontend retry gate: install, lint, type-check, tests and production build pass; remaining warnings are reported in raw logs. Backend retry gate passes: 10 suites / 65 tests, plus clean install/lint/type-check/build. Frontend has four new component tests plus retained original unit tests; lint has 0 errors / 50 warnings. Outputs: `phase1b-evidence/realtime-frontend-results.json` and `realtime-retry-results.json` (backend).
- Outstanding Phase 1b: API reliability/versioning/idempotency/OpenAPI, full observability, Socket.io expiry/revocation cleanup, E2E, coverage/CI/format gates, original-main screenshots. G06 REST/agent projections, legacy alias cross-topic fanout and large offline-batch UX remain open. See CRDT_OPERATIONS.md.
- Requires human action: provision private authenticated Redis and persistent WebSocket hosting, adopt new migrations with separate non-bypass runtime credentials, take and rehearse restoring a production backup, plan maintenance migration; provide real Clerk test identities for authenticated browser fixtures/screenshots. No push, deployment or key rotation performed.
- Phase 1a's historical unfinished items below remain truthful; the new user assertion that 1a is complete does not match this ledger. Clerk authentication and prior security tests are retained.

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
