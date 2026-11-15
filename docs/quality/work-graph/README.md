# Unified work graph — incomplete foundation checkpoint

Started clean at3d92625 on upgrade/enterprise. Root/frontend AGENTS, current progress/final report, architecture/authz, source-reference policies, GitHub controller/webhook, schema, receipt/RLS migrations and related tests were inspected. No interrupted work-graph changes were present. Task planning remains unfinished from the previous phase; its review-policy question does not block this different phase.

## Existing and missing behavior

- `services/decision-receipts.ts` binds document/task quotes to revisions and rechecks current source visibility. `routes/decision-receipts.routes.ts` hides receipts whose underlying source is unavailable and gates the feature. Preserve these semantics for decision endpoints.
- `services/async-digest.ts` already has versioned document/task/snippet source pointers and tenant-scoped eligibility checks. Activity text is not an authoritative source catalogue.
- `GitHubRepository` stores workspace, repository ID, optional installation ID and configuration. `controllers/github-repository.controller.ts` restricts repository management/listing to OWNER. The webhook checks repository HMAC and tenant authority; delivery rows contain event/delivery IDs, not a durable issue/PR catalogue. Do not infer installation validity from a saved ID or webhook fixture.
- No WorkLink table, unified endpoint resolver, backlink/search API or Related work UI exists yet. No graph migration or product route has been added in this checkpoint. The requested document/task/decision/PR browser flow remains unimplemented and unverified.

## Implemented foundation

`backend/src/services/github-work-source.ts` provides a provider-proof adapter for issue/PR pointers. It accepts a configured repository binding, rejects a mismatched workspace before token acquisition, validates numeric identities and safe slug segments, uses fixed GitHub API origins, refuses redirects and applies bounded request deadlines. It verifies resource number, canonical URL and repository identity; issues cannot masquerade as PRs.404/410 disclose no title; other provider/configuration failures become redacted503. No title cache, source database copy, PAT fallback or credential logging is added.

The default token issuer signs an App JWT using private backend GITHUB_APP_ID/GITHUB_APP_PRIVATE_KEY, requests installation authority narrowed to one repository ID and issues/pull_requests read permissions, and rejects expired responses. The adapter is **not wired to a product route** and is not a substitute for authenticated local policy. Future callers must resolve active principal, workspace/source permissions and current repository binding before external I/O, then recheck those policies and unchanged binding afterward. In particular, current OWNER-only repository visibility must not be widened implicitly.

Official API contract reviewed: [GitHub installation token endpoint](https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app). Existing repository metadata and source content remain authoritative; the adapter only resolves provider proof.

## Proposed graph design — not implemented

Use an additive forced-tenant-RLS WorkLink relation with typed source/target pointers, relationship type, server-derived proof metadata, creator, timestamps, optional pinned revisions and deletedAt. Store no titles, excerpts, URLs supplied by the caller, tokens or provider payload copies. Use canonical endpoint ordering for symmetric related links and directional ordering for directional relationships; enforce unique active edges and no self-link.

Create under the existing current-writer workspace transaction, validating and locking both local endpoints in stable order. Validate decisions through their original source policy and feature gate, tasks through Column/Board tenancy, snippets through their own workspace, and documents through current non-archive policy. A polymorphic pointer is not a foreign key: add database endpoint-binding validation rather than relying solely on string IDs. Preserve existing API/WebSocket contracts through new v2 routes and a default-off rollout flag.

Reads/backlinks/search must reauthorize both endpoints on every response, including idempotent replay. Return404 for foreign IDs. When an authorized anchor has an old link to a withdrawn/stale source, return only a safe unavailable item with no title, URL, excerpt or hidden source metadata. Revision mismatch requires explicit refresh/review; do not silently overwrite proof. Scope idempotency to actor/workspace/input, store pointer receipts rather than resolved titles, and revalidate sources before replay. Soft-delete must check current authority and handle unavailable counterparts explicitly without leaking them. Disable routes/UI for rollback while retaining the additive table and records.

A Related work panel should use authorized source search and backlinks, keyboard-operable selection, explicit unavailable/error/retry states, existing tokens, and canonical navigation to the actual source. No duplicate source editor or storage product is needed.

## Evidence and failures

`provider-red.txt` records the test-first missing-module failure. Focused fixture tests subsequently passed (`provider-green.txt`); the full gate sequence includes the expanded adapter cases. Tests cover workspace-binding rejection, endpoint/repository mismatch, redirects, withdrawal, error redaction, issue/PR distinction and actual RSA signature verification with generated fixture keys and a synthetic transport. None establishes successful real GitHub installation/API access.

The first full backend baseline exposed a prior-phase handshake race: the budget test expected1 but received2 consistent with another initial frame arriving. Production server changes considered during diagnosis were reverted. The existing test now awaits initial acknowledgment and pending-message drainage; its original exact counter/limit assertions remain. Failed run is retained under backend; final run is separate. No test assertion or limit was lowered.

Final commands/exits are in RESULTS.json and gate records. Both final app gate sequences pass (315 backend tests;92 frontend component plus9 Node tests), with OpenAPI and source-security exits0. Backend prior-phase coverage comparison passes. Frontend configured thresholds pass, but the additional prior-phase comparison remains failing after an unchanged rerun: the unchanged async-digest component records one fewer covered statement/function (see coverage-status.json and both retained outputs). This is unresolved verification work; no baseline or test was lowered. Frontend is unchanged. No new UI/browser feature, graph DB/RLS integration test or provider smoke can be claimed from these adapter tests. Source/schema/API contracts remain unchanged apart from the added internal adapter and test synchronization.

## Provider setup and remaining engineering

For later real verification, an operator must approve a disposable repository, install the actual GitHub App with issue/PR read permissions, configure matching repository/installation IDs through existing owner settings, and privately supply GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY to the backend secret environment. Do not paste keys/tokens or commit an environment file. Keep the host clock synchronized; do not loosen JWT checks. Exercise an actual issue and PR through the future authorized endpoint and verify title/URL, repository denial, installation removal and deletion. No live request or installation success was attempted here.

Provider configuration alone cannot finish this phase. WorkLink persistence/migration, local endpoint adapters, API/search/backlinks, transaction/idempotency integration, Related work UI, OpenAPI additions, real DB cross-tenant/archive/stale cases and the requested browser flow all remain engineering work. This checkpoint is incomplete and is not a release or a completed graph phase. No push, deployment or automatic next phase.
