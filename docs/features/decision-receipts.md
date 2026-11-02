# Decision receipts (P02)

## What it does

A manual receipt records a proposed decision, its rationale/tradeoffs, an exact quote from one current document or task, and a pinned source fingerprint. Drafts are proposals, not evidence of consensus. Workspace editors and owners can create, edit and delete drafts. Only an owner can explicitly accept a draft or supersede an accepted receipt with another current accepted receipt. Acceptance records the verified local actor and server timestamp. Accepted content is immutable; supersession preserves the original and links its replacement. No model infers consent, authorship or agreement.

The workspace Decisions page supports title-based source search, plain-text preview, quote editing, receipt search, draft changes, explicit confirmation for deletion/acceptance/supersession and source-change warnings. Document citations open the document; task citations open the board (the task ID remains part of the receipt). Changed sources do not silently rewrite the evidence. Drafts must be reviewed and saved against a current source before acceptance. A changed accepted source remains flagged; it does not automatically invalidate a human decision.

## Enable and migrate

Deploy the forward-only `202611020001_decision_receipts` Prisma migration using the existing deployment workflow. Set **FEATURE_DECISION_RECEIPTS=true** on both the backend and frontend. Any other value, including absence, disables the feature. The server-rendered shell hides navigation and the page returns not-found when disabled; API middleware independently returns404 before handling receipt operations. The frontend flag is read server-side on dynamic requests, not a browser credential or authorization mechanism.

**Rollback note:** set the flag off in both services and roll back the application version while retaining the additive table. Do not reverse the migration or drop records during an application rollback. A future destructive retirement requires an explicit reviewed export/retention decision and a new forward migration. Existing documents, tasks, CRDT journals and API contracts are unchanged. No new seed data is needed; the existing sample workspace supplies documents, tasks and owner/editor/viewer identities.

No external API, model, secret or paid dependency is used. No adapter or mock provider is needed. No key provisioning is required.

## Design and versioned API

New operations live only under `/api/v2/workspaces/:workspaceId/decisions`:

| Method/path suffix           | Behavior                                             | Authority                                               |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| GET `/`                      | Visible receipts, newest first                       | Current workspace reader                                |
| GET `/sources?q=`            | Up to50 matching document and50 task titles/IDs      | Current workspace reader                                |
| GET `/source?kind=&id=`      | Current plain text, title, ID, kind, fingerprint     | Current workspace reader; actual source tenant required |
| POST `/`                     | Create a draft; optional Idempotency-Key             | OWNER/EDITOR                                            |
| PATCH `/:receiptId`          | Replace draft fields with expected receipt revision  | OWNER/EDITOR                                            |
| DELETE `/:receiptId`         | Delete a draft with expected revision in JSON body   | OWNER/EDITOR                                            |
| POST `/:receiptId/accept`    | Explicit acceptance with expected revision           | OWNER                                                   |
| POST `/:receiptId/supersede` | Link another accepted receipt with expected revision | OWNER                                                   |

Strict bounded input schemas reject supplied status/actor/workspace/acceptance fields. Existing legacy/v1 contracts are retained. Receipt state transitions increment a revision; stale edits/actions return409. Source fingerprints bind kind, source ID, source text, and canonical revision/update timestamp. Quotes must be exact substrings of the selected current plain text. Markdown, HTML and code are rendered as text, never executed. Images, attributes and attached files are not source evidence.

The new table has forced tenant row-level security, a workspace foreign key, same-workspace composite supersession foreign key, and checks for valid state/acceptance combinations. Public handlers use the central active-principal, unsuspended-tenant and membership policy inside tenant transactions. Workspace mutation locks serialize receipt changes and membership changes. Source rows are locked while verifying quote/revision and accepting, so an accepted quote cannot race a source update. Receipt creation rechecks source authority before idempotency replay. Read responses are no-store.

## Security and privacy

Receipts are derivatives of their source. Every list request checks current tenant authority and each source again. Archived/deleted documents and missing tasks cause their receipts to be omitted entirely; inaccessible replacement sources do not expose a replacement ID. Source content and receipt quotes never flow across workspaces, even if one person belongs to both. Foreign receipt/source IDs return not-found inside an authorized workspace; nonmembers, viewers attempting mutations, inactive accounts and suspended workspaces are denied centrally. A previously cached page cannot grant permission; server checks run for every action. As with existing product pages, a page already rendered can retain readable text until refreshed or closed; this feature does not introduce transport-driven receipt eviction.

Only current workspace readers can see quotes, rationale and local actor IDs. Former members are displayed as such when no current member name is available. A removed author does not erase an accepted decision's historical actor ID or timestamp. Quotes and rationale persist with receipts until workspace deletion; archived sources hide derivatives rather than physically purging them. Existing idempotency storage can retain a create response for its bounded receipt lifetime. Source bodies, receipt quotes and rationale are not added to URLs, logs, analytics, embeddings, model prompts or external services by this feature. Source lookup sends title-search queries and resource IDs to the tenant-local API. Users should avoid including secrets or unnecessary personal data in rationale/quotes; this feature is not a secret scanner.

Acceptance means that the named owner accepted the recorded wording at that time. It is not proof of factual truth, legal agreement, unanimous team consent or a successful test/build. Supersession is explicit, never inferred from text. No automatic publishing, AI extraction, comment ingestion, cross-workspace rollup, productivity ranking or provider training is included.

## Bounds and interaction limits

- Maximum200 stored receipts per workspace, including accepted/superseded records and records whose sources are unavailable. This bounds synchronous authorization/revalidation work; it is not an unlimited archive. The API returns the bounded list, without pagination or total counts of hidden sources. Remove unwanted drafts before reaching the limit; accepted records are retained. Larger archives require a separately reviewed pagination/retention design.
- Title200 characters, rationale8000, quote5000, source preview64000. Source search matches titles and returns at most50 of each kind per query; refine the query to locate another source. Full rich text, binary attachments and selection coordinates are not captured. A fingerprint identifies a pinned source version but is not a browsable snapshot or cryptographic attestation by a third party.
- Sources with metadata-only changes may be flagged because update timestamps participate in the fingerprint. Receipt lists and membership display update on navigation/refresh, not by a new realtime protocol. A source changed during drafting returns409; reload/reselect it and review the quote. Source restoration can make a previously hidden receipt visible again.
- Accepted receipts cannot be edited or deleted individually; correct them by accepting another receipt and superseding. Draft deletion is confirmed and irreversible. Successful create/edit has an Undo action using the same current server policy/revision checks; Undo can fail if another person changes/accepts the draft or the source changes. A request in flight may complete after closing its dialog; use Refresh receipts before retrying.
- Retry of an identical create uses an idempotency key; changed inputs get a different key. A lost response is not claimed to be a failed save. Idempotency replay does not restore a draft that was later deleted. No offline mutation queue or automatic export is introduced.
- Semantic tokens, native labeled fields/buttons and Radix modal/select primitives provide wrapping layouts, keyboard operation and focus restoration. Loading skeletons, helpful empty states, request-error retry and route error boundary are included. Browser axe and viewport results are recorded separately; automated checks are not a screen-reader certification.

## Validation

Unit tests cover quote text extraction, fingerprint binding, bounds and forged workflow fields. Real migrated PostgreSQL tests use a non-owner/non-bypass RLS role for role/tenant/source checks, draft CRUD, immutable acceptance, supersession, races, stale sources, archived/deleted sources, idempotent replay and revocation. Frontend component tests cover empty/retry states, viewer controls, edit revision/fingerprint and explicit/stale acceptance. The seeded fixture Playwright journey exercises the UI lifecycle, viewer HTTP denials, archive hiding, retry and axe at desktop/mobile in both themes. Actual run results and remaining limits belong in docs/PROGRESS.md and docs/ui/after/decision-receipts/REVIEW.md; this document alone is not a claim those tests have passed.
