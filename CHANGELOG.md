# Phase 5b — containers, gated CI and deployment configuration

- Add multi-stage non-root application images with health checks and separate migration tooling.
- Add local Compose credential initialization, migrations/seeds and a non-bypass runtime database role; keep administrative credentials out of the API container.
- Add local identity setup guidance and explicit production configuration validation without enabling fixture authentication.
- Add coverage-drop gating, security/E2E/Compose jobs and reviewed manual preview/production workflows; retain SBOM/provenance and publish only scanned images after all gates.
- Document exact Vercel/Railway settings, separate migration/runtime authority, backups/restores and honest hosted verification limits.

# Phase 5a — practical audit fixes and bounded quality evidence

- Require full AES-GCM authentication tags and reject malformed/tampered encrypted-secret envelopes while retaining valid v1 ciphertext behavior.
- Constrain reset redirect destinations and preserve browser origin through relative Location; retain the documented legacy GET/logout-CSRF limitation.
- Replace unsupported landing, billing and overview claims with explicit limits; fix measured overview contrast using semantic tokens.
- Correct README feature/setup/license claims and add private-disclosure guidance.
- Retain raw coverage, audits, redacted scanner output, browser failures and exact deferrals under docs/quality; four changed-page cases pass and four unchanged visual-baseline cases fail. No all-green E2E or capacity claim.

# Phase 3f follow-up — AI reservation settlement

- Atomically refund confirmed pre-provider failures once; retain conservative charges for ambiguous/partial attempts and preserve legacy cumulative admissions.
- Add versioned usage/reset error contracts, bounded Redis/provider operations, safe429 backoff and output limits; show resets and concurrency in settings.
- Add parallel admission/refund, timeout/output and privacy policy regressions; record operational tradeoffs in ADR020.
- Complete the case-file evaluation scaffold without datasets/results; add seeded usage/quota journeys and correct the editor toolbar grouping role.
- Validate255 backend tests,71 frontend component tests plus the Node runner, both builds and four final Playwright journeys;12 final axe reports have zero violations. Record remaining manual contrast and remote-billing limits.

# Phase 4b — P06 evidence-only async digest

- Add a feature-flagged personal digest of recorded creation events with typed source pointers, reauthorized source proofs and deterministic pagination; no model or generated claims.
- Add forward-only actor/tenant-RLS preferences, explicit opt-in and private monotonic checkpoints; filter unavailable/foreign/admin/AI/unlinked sources before paging.
- Add design-system pages, skeleton/empty/retry states and keyboard UTC window disclosure; retain exact evidence and coverage limits.
- Verify245 backend tests,79 frontend tests and four final seeded Playwright journeys;32 final axe reports show zero violations. Document raw incompletes, retention and rollback.
- P06 only; no paid API/key, other feature or push.

# Phase 4b — P04 snippet safety preflight

- Add feature-flagged local/server preflight and explicitly confirmed redacted create/edit through versioned v2 endpoints; reject legacy detected-value writes when enabled.
- Persist only constant finding types/masks with forced tenant RLS and a composite FK; atomically store masked content/activity/receipts/outbox and protect index disclosure.
- Add design-system composer, readable preview, viewer metadata, skeleton/empty/error/retry states and keyboard support; correct nested navigation selection.
- Verify234 backend tests,73 frontend tests, four final seeded Playwright journeys and28 final axe captures with zero violations. Document heuristic/historical-data limits and forward-only rollback.
- P04 only; no new paid API/key, other feature or push.

# Phase 4b — P02 decision receipts

- Add feature-flagged, tenant-isolated document/task decision receipts with exact revision-bound quotes, editable drafts, explicit owner acceptance and immutable supersession.
- Add a forward-only Prisma migration with rollback instructions and versioned v2 contracts; preserve existing authorization and CRDT behavior.
- Add design-system UI, loading/empty/retry states, keyboard focus restoration and hover contrast correction; enforce viewer read-only access on the server.
- Verify222 backend tests,69 frontend tests and four seeded Playwright journeys;40 final axe captures report zero violations. Document raw incompletes, bounds and remaining review limits.
- P02 only. No paid API/key, other feature or push.

# Phase 3f — AI cost and safety

- Enforce atomic user/workspace daily/monthly request allowances and concurrent-operation limits before AI provider calls; add authorized versioned usage API and settings display.
- Disable SDK retries, restrict fallback to explicit pre-admission rejections, cancel bounded editor calls and avoid generation replay on task/PR retries.
- Add evaluation case/runner/scorer scaffold without datasets/results, parallel Redis quota tests and provider/isolation failure tests.
- Document request-versus-billing semantics, durable Redis requirements, embedding redelivery and uncompleted browser/axe acceptance. Defer PWA to Phase5; no Phase4b or push.

# Phase 4a — research and proposals

- Add source-linked research across17 products and developer pain points, with explicit evidence limits for target segments, India connectivity and non-English collaboration.
- Document32 proposals with effort, impact, reuse, novelty, security and dependency constraints; score all and select eight bounded, free/open-tool-friendly directions.
- Reject cross-workspace leakage, training on user content and unconsented capture. Record unvalidated demand/connector terms and further research as deferred.
- Documentation only: no feature implementation, API change or push.

# Phase 3e — transport acceptance and review

- Correct source-label contrast; preserve failed evidence and raw axe incomplete items. Final four seeded transport-fixture browser tests pass with eight final captures/zero reported axe violations.
- Verify retained generated labels/reference legends and disabled partial-output actions without calling or claiming to evaluate a live model.
- Record54 frontend/193 backend tests and builds; explicitly defer atomic quotas/usage, streamed fallback, evaluation scaffold and PWA. No Phase4 or push.

# Phase 3e — reliable editor AI stream and provenance

- Parse bounded complete SSE frames across split UTF8/CRLF, require completion before applying, and expose stop/retry guidance for partial or failed streams.
- Separate quick-action instructions from untrusted document context; number existing workspace source records and strengthen the prompt policy without changing HTTP/SSE contracts.
- Label preview/copied/applied editor text as AI-generated, retain reference legends and reject stale selection replacements. Preserve workspace policy and CRDT insertion/Undo.
- Explicitly defer atomic quotas/usage, streamed fallback, evaluation scaffold and PWA work within the timebox.

# Phase 3d — bounded review acceptance

- Save eight final dark/light board/drawer captures and raw axe reports; final five browser tests pass, including keyboard-only moves and authorization denials.
- Record residual layout/accessibility gaps, missing per-page acceptance and remaining Kanban/snippets scope explicitly. No3e or push.

# Phase 3d — Kanban movement and task drawer

- Add named keyboard move controls alongside native dragging, server-scope edit gating, move Undo via existing authorization and canonical refresh on failure.
- Replace custom task modal with Radix Drawer; add loading/access retry and honest error feedback. Preserve backend contracts and local-first transport.
- Add seeded move/drawer browser coverage and viewer/cross-workspace denial checks; defer remaining Kanban and snippets redesign within the timebox.

# Phase 3c — editor acceptance and review

- Preserve cached content on metadata failure; put read-only semantics on the actual editor textbox, retain visible canvas focus, and enlarge task targets.
- Add seeded block-flow, clipboard/table/selection, two-context merge, offline/reconnect and actual-protocol viewer-denial browser tests. Preserve default journeys and central authorization.
- Save40 final dark/light review captures and raw axe reports with zero reported violations; record incomplete accessibility/layout work and A remainder/B–E deferrals honestly.
- Final51 component tests,192 backend tests, six browser tests and production builds pass. No3d or push.

# Phase 3c — editor foundation

- Replace the crowded toolbar/card with a focused document canvas, selection formatting, keyboard slash commands and a formatting fallback using existing design tokens/components.
- Add existing-schema table/task insertion, table controls and contextual code language/copy controls. Preserve local-first Yjs synchronization and server-authorized read-only behavior.
- Add document load retry/error/skeleton states and title-save feedback/Undo. Retain existing AI requests behind a shared dialog; remove fabricated history/restore controls.
- Defer dragging/callouts and B–E rather than changing CRDT schema or API contracts within the timebox.

# Phase 3b — settings browser acceptance and review

- Add seeded settings main-flow, central editor/viewer admin-denial and responsive state tests, retaining default browser journeys.
- Align member actions with recipient-specific labels; review40 final dark/light settings captures with zero reported axe violations. Preserve raw incomplete items and failed/interrupted output.
- Record final45 frontend/192 backend tests and production builds; defer B–F, complete invitation history and remaining overlay/alignment/accessibility limits in PROGRESS.md.

# Phase 3b — workspace access settings

- Replace mock workspace settings with searchable real members/roles and verified invitation controls using existing APIs and design-system components.
- Add owner-only UI, confirmation, optimistic role changes with Undo, invitation receipt retry/revocation Undo, loading/empty/error retry and keyboard regressions. Keep backend contracts and authorization unchanged.
- Explicitly label in-view invitation history; defer provider security, profile/metadata, tokens, audit, export and account deletion within the timebox.

# Phase 3a — dashboard review and browser acceptance

- Clarify New workspace and the document destination; tighten the mobile heading/action layout and preserve room to scroll past the shared floating control.
- Repair empty shell presence-group semantics discovered by the full-page audit. Add seeded dashboard main-flow/fault/empty/permission tests without changing production backend behavior.
- Save initial/final dashboard captures and rubric review:22 final states, zero reported axe violations,6 browser tests pass. Final gates pass with35 frontend component tests and192 backend tests. Retain incomplete entries and initial failures; defer landing, onboarding and unsafe workspace-creation undo.

# Phase 3a — dashboard foundation

- Replace the workspace-card dashboard with recent documents, tasks matched to the local account, real activity, workspace filtering/navigation and quick actions using the existing shell and tokens.
- Add bounded existing-API aggregation, loading skeletons, partial/total failure retry, a route error boundary and useful empty states. Keep workspace creation accessible with input-preserving retry.
- Add optimistic quick document creation with receipt-bound retries and undo by archival, including undo before the create response. No backend or API contract changes.

# Phase 2b — shell acceptance and review

- Complete mobile Drawer, scoped presence using the existing join DTO, keyboard commands/help, Copilot focus handling, mobile title fix and narrow-route wrapping. Preserve backend and API contracts.
- Correct foundation CSS layer ordering and dark primary action text; disable only the fixture's development indicator.
- Add40 real final shell captures,40 Playwright visual baselines, shell axe and prior-incomplete focus/contrast review. Final6 browser tests pass; baseline creation is not an independent visual comparison. Record unresolved open-Popover reference confirmation and broader product-screen work explicitly.
- Final gates: frontend Node4 files +26 component tests, backend192 tests, lint/format/types and both builds pass. i18n deferred; no Phase3 or push.

# Phase 2b — shared app shell

- Replace the logged-in layout with neutral navigation, collapsible rail, workspace switcher, nested document disclosures, breadcrumbs, user menu, focus mode and mobile Drawer.
- Integrate existing resource APIs with the command primitive; add keyboard help, scoped navigation state and named responsive document title sizing.
- Share the shell across dashboard/workspace/billing/invitation routes and retain the superadmin server guard around the same shell. No backend/API contract changes.

# Phase 2 — UI foundation, group 2

- Add semantic controls, Radix modal/drawer/select/menu/popover/tooltip/tabs/selection primitives, identity/status/loading/empty/keyboard controls, a supplied-action command palette and a shared Sonner toast host.
- Add development-only /design-system with interactive light/dark/system examples. Product-shell integration is deferred; backend contracts and authentication are unchanged.
- Add keyboard/focus/pending-action and token-contrast regressions plus a browser axe audit for the component workbench. Preserve initial failing axe evidence; fix background focus and avatar semantics before delivery.

# Phase 2 — UI foundation, group 1

- Specify a neutral, keyboard-first UI direction, measured light/dark contrast pairs, geometry, motion, icon and future shell rules in docs/ui/DESIGN.md.
- Replace global glass/gradient decoration with semantic Tailwind v4 tokens; restore distinct light/dark scopes, reduced motion and theme-aware editor styles.
- Serve Geist Sans/Mono through next/font/local; correct toast CSS-variable colors. Backend/API/auth/collaboration behavior is unchanged.

# Phase1e — authenticated browser journeys, invitations, UI evidence and contracts

- Add disposable non-bypass browser orchestration and10 retained product journeys plus real HTTP DTO validation; final Playwright/API run 11 passes. Fix test-only self-referencing database binding and premature JSON parsing; production auth/signature behavior remains intact.
- Add verified-recipient invitation creation/acceptance/revocation with tenant/recipient RLS, atomic role application and expiry/reuse/concurrency coverage. UI provides a shareable link and makes no email-delivery claim.
- Capture54 actual before/current UI images at 1440px/390px; original main stays in a separate worktree. Superadmin interiors remain unavailable; manifests explain why.
- Complete55 OpenAPI/Zod HTTP contracts and enforce route/request/response schema inventory plus recursive-reference integrity. Final full gates:192 backend tests,7 frontend Node tests,10 component tests; both builds pass using webpack. Clean host Turbopack build confirms sandbox/cache origin of the earlier bind failure.
- Record actual act workflow listings, failing quality/image dry runs and successful deploy-plan dry run; no publish/deploy/push occurred. Real Clerk sign-in remains blocked by configuration not visible in project env files. See docs/PROGRESS.md and CI_LOCAL_VERIFICATION.md for required actions and remaining checks.

# Phase 1d — frontend fixture increment (partial)

- Add production-excluded frontend fixture generation and identity/token/logout adapter, isolation regressions and four component tests; generated app type-checks.
- Verify Clerk admin access HTTP 200 and key alignment without exposing credentials. Real three-user sign-in remains blocked on identity mapping/sign-in method.
- Retain actual baseline/gate failures and retries. Default Turbopack is blocked by local port binding; webpack build passes. Authenticated Playwright, invitation acceptance, paired screenshots and complete API contracts remain unfinished; see docs/PROGRESS.md.

# Phase1c — browser fixture foundation and evidence

- I02/C01: production Clerk authentication retained behind trusted composition; separate guarded test-only login executable and negative production-route/credential checks.186 backend tests and full gates pass. Browser adapter, acceptance flow and E2E remain unfinished.
- I09: original-main landing500 reproduced; worktree-only public-root workaround yields real1440px/390px home captures. Authenticated interiors remain incomplete. Local CI verification and exact remaining work/human actions are recorded.

# Phase1c — atomic create idempotency group

- G09/D07/I02: atomic RLS-protected create receipts for all current durable REST/SCIM creates; authority/scope/body binding, concurrent duplicate fencing, rollback, TTL and replay permission checks. OpenAPI header contracts, real SQL fault injection and183 passing backend tests. Repository list matches the existing OWNER route; provider fixtures are isolated.

# Phase1c — embedding and self-profile group

- G01/G04/G10/C01/D01: tenant-bound writer-authorized embedding outbox, central maintenance scope, leased/revision-fenced delivery and stale-result checks; standalone PostgreSQL consumer and draining scheduler. Central active self-profile/IdP policy with serialized profile updates.169 backend tests and full gates pass; no explicit any or suppressions.

# Phase1c — service authority group

- C04/D07/G08/G09/I02: central SCIM/repository/global-admin/signed-billing policies; tenant-only SCIM membership effects, registered repository jobs, atomic webhook DB effects, customer/subscription binding and preserved admin suspension.160 backend tests pass. Remove all remaining explicit any annotations and enforce no-explicit-any in backend lint.

# Phase1c — AI/search/ingestion group

- G01/E03/F01: central membership checks before upload parsing, balance/provider work and usage writes; tenant-scoped search; canonical atomic ingestion with PDF cleanup; bounded AI request schema and untrusted-context separation; attributed offline replay keys.149 backend tests pass. Atomic quotas and remaining provider/service authorities stay open.

# Phase1c — workspace authorization group

- D05/D10/G01: central transactional principal/workspace/member/repository policies; active user checks, workspace-scoped reads and writes, atomic workspace/invitation activities, concurrent last-owner protection. Full gates pass with145 backend tests; existing tests retained.

# Phase1c — realtime revocation group

- C01/D03/D07/B05: shared Clerk realtime identity, per-packet and bounded passive Socket.io policy checks, role/member/expiry eviction across backend instances; retain and bound Hocuspocus checks. Public Socket.io middleware replaces the private untyped packet override.
- B05/H03: socket-scoped aggregated presence, fresh renewal/reconnect tokens, no late-token orphan and no prior-account state reuse. Real PostgreSQL/Redis/Socket.io/Hocuspocus revocation tests and frontend lifecycle regressions added; 87 backend tests and all quality gates pass.

# Phase 1b — quality gates and evidence (partial delivery)

- I02/B04: retain coverage thresholds and add real admission, token renewal/expiry, local eviction, ephemeral viewer and reconciliation cases; 83 backend tests pass. AsyncLocalStorage preserves pino request correlation.
- I02: warning-free frontend lint, shared Prettier configuration and formatting across both apps, measured global/critical coverage floors, Node engine alignment and stricter cached CI quality steps with PostgreSQL/Redis services. Existing tests are retained; authenticated E2E is deferred.
- I09: refresh original-main route captures and record missing seed source, login redirects and HTTP500 landing evidence without claiming populated UI coverage. Full remaining scope and human actions are in docs/PROGRESS.md.

# Phase 1b — API reliability and telemetry group (2026-11-01)

- Phase 1b: versioned API aliases, correlated safe errors, bounded PostgreSQL/Redis readiness and shutdown, protected metrics, optional sanitized tracing/error reporting and pino HTTP logs.
- I02: checked-in route/Zod-generated partial OpenAPI with drift checks; real readiness-outage and OTLP-collector tests; enforced critical collaboration coverage floors. Full gates pass with 75 backend tests. Known remaining scope is explicit in docs/PROGRESS.md.

# Changelog

- Phase1c D07/D09/G01/G06/G07: transactional central authorization and RLS-safe resource handlers; tenant-bound active assignees, atomic task ordering/activity/embedding outbox, canonical REST/actor-attributed agent document writes and revision-based live-room refresh. Add conflict-checked PUT content API while retaining legacy PATCH semantics. Real PostgreSQL/CRDT regression tests and ADR011/012.

## Phase 1a — partial delivery (2026-10-31)

- D01: strict parsed profile mutations prevent ORM field/role assignment.
- E01: disable native host execution while preserving its endpoint with HTTP503.
- D02/D07: bind collaboration document tenant and enforce viewer read-only permissions.
- I02: repair PostgreSQL/queue tests; add explicit lint/type/unit-test gates and fix frontend lint errors without rule suppression.

Historical Phase 0 audit: see docs/CHANGELOG.md. No production deployment or key rotation performed.

- D03/D04/D05/D06/D08: authorize socket domain events, bind resources and member mutations to their workspace, and validate document hierarchy ownership.
- E02/G08: render raw AI HTML inert and bind signed webhook task movement to repository tenant within a transaction.
- G02/G12/D08/I09: source-backed baseline, forward tenant indexes and composite hierarchy constraint; explicit non-production seed; versioned migration scripts and environment templates.
- I01: upgrade advisory-affected dependencies and remove unused NextAuth; final audits show no Critical/High dependency entries, with Moderate/Low entries explicitly retained.

# Phase 1b — collaboration group (2026-11-01)

- B03/B04/G10: tenant-scoped PostgreSQL CRDT journal committed before acknowledgement, row-locked compaction, Redis fanout, resource limits and durable legacy conversion with guarded rollback.
- C01/D02/D07: per-message document policy checks, passive member/role/expiry eviction, read-only protocol enforcement and bounded WebSocket admission.
- H02/I04: account/room-scoped offline replicas, fresh reconnect tokens, editor read-only/status handling, real PostgreSQL/Redis/Yjs collaboration tests and frontend editor/lifecycle component tests. Phase 1b is still in progress; remaining scope is tracked in docs/PROGRESS.md.
