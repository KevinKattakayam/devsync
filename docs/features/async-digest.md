# Evidence-only async digest (P06)

## What it does

The digest is a personal, opt-in, in-app chronological view of recorded workspace activity. Every entry uses an actual Activity ID, its stored message and timestamp, and a verified link to a current readable source. It does not generate a summary, infer accomplishments, score individuals or call an AI model.

The delivered event set is **document creation, snippet creation and task creation**. Existing create transactions now attach typed source IDs and the recorded resource revision to their existing activity records. No additional event or historical accomplishment is invented. Older unlinked records are omitted rather than matched by title. Administrative records and AI-authored task-completion/PR summaries are not eligible. The UI names the supported scope and explains that an empty window is not proof nothing happened.

Each line links to its recorded-source permalink, which displays the exact event, time, activity ID and source kind/ID/revision. Opening that page rechecks current access and source existence. It also offers navigation to the current document, task board or snippet vault. Task/snippet collection links do not claim to open a detail drawer; the exact resource ID is visible in the proof. A recorded revision is provenance, not a browsable historical content snapshot or a claim about today's status.

## Enable, migrate and roll back

Apply forward-only Prisma migration `202611020003_async_digest` through the existing deployment workflow and grant the runtime role its normal scoped privileges on the new table. Set **FEATURE_ASYNC_DIGEST=true** on API and frontend instances. It defaults false in both example configurations. The backend independently gates every new API route and the frontend gates its page/navigation. A flag is not authorization.

The additive source metadata on existing creation records is recorded independently of the display flag, so events created before feature enablement can already have valid pointers. This adds no new activity counts, content snapshots or generated claims. Existing legacy/v1 DTOs and resource mutation behavior remain; the public digest operations are versioned under v2.

**Rollback note:** disable the flag and roll back the application while retaining the additive preference table and metadata. Do not reverse/drop the migration during application rollback. Previously attached source pointers remain harmless JSON metadata. A future destructive retirement requires a reviewed forward migration/retention decision. No historical activity backfill is performed.

No paid API, provider key, model, external messaging service or new runtime dependency is required. Existing authentication and database operation remain prerequisites. Seeded fixture tests do not require real Clerk sign-in.

## Evidence and visibility rules

Eligibility is evaluated in the same central tenant transaction as active-user, unsuspended-workspace and current membership checks. The SQL projection intersects each allowed activity type with its matching typed source:

| Activity        | Source                                                     | Recorded revision                   |
| --------------- | ---------------------------------------------------------- | ----------------------------------- |
| doc_created     | Existing unarchived document in this workspace             | Canonical CRDT revision at creation |
| snippet_created | Existing snippet in this workspace                         | Resource updatedAt at creation      |
| task_created    | Existing task whose column/board belongs to this workspace | Resource updatedAt at creation      |

Only source metadata version1 with a valid kind, bounded ID and revision is accepted. A foreign source ID, mismatched kind, missing source, unsupported event type or missing/invalid metadata cannot become a digest entry. The source joins run before LIMIT, so pagination does not expose hidden-event IDs, skipped counts or foreign titles. Current forced tenant RLS on resources remains in force. The application's present source policy is workspace membership; any future finer-grained ACL must also be intersected before this event set is expanded.

The displayed message comes from the recorded event. The existing local safety detector masks recognized sensitive-looking spans in memory; the entry then explicitly says it was masked. No raw message derivative or digest body is persisted. Detector limits still apply; the digest is not a secret scanner certificate or a historical database scrub. Event source pages use the same eligibility rules and do not fall back to an old copied message if a source becomes unavailable.

## Personal delivery and checkpoints

- Opening the off state does not create a preference or fetch a digest. Enabling creates/updates only the authenticated viewer's preference. Viewers, editors and owners can independently opt in/out and mark their own progress; none can configure another person's audience or checkpoint.
- A window contains at most seven days of eligible events as of its database-generated upper timestamp, after the viewer's acknowledged `(createdAt, id)` checkpoint. Pages return25 events in ascending `(createdAt, id)` order. Equal timestamps use the ID tie-breaker, preventing duplication between pages.
- A cursor binds workspace, actor, preference revision, window end and last visible event. It is bounded, encoded JSON, not an authorization credential or a secret. Each request repeats current policy/source checks. Scope mismatch, a changed preference revision or a cursor older than30 minutes requires refresh. The frozen window is stable for pagination, while removed sources can disappear between reads.
- **Mark through this event as seen** is explicit. The server rechecks that the target is currently eligible and within the current seven-day horizon, serializes the personal preference row and advances monotonically. It includes earlier chronological pages; the UI says so. Fetching never advances the checkpoint. Marking seen is a personal delivery action, not proof work was verified or completed.
- Preferences and acknowledgment use expected revisions. Concurrent first updates serialize; stale updates fail409 rather than losing another tab's choice. Acknowledgment invalidates older pagination cursors. A previously seen target can be acknowledged again without moving the marker backward.
- Turning off stops this view; it retains the private checkpoint for a later opt-in. Source-proof links are independently readable by an authorized current workspace reader, including one who has opted out of personal delivery. Knowing a link cannot bypass source authorization.

## API

All operations are authenticated, no-store and versioned under `/api/v2/workspaces/:workspaceId/digest`:

| Method/path               | Purpose                                                                  |
| ------------------------- | ------------------------------------------------------------------------ |
| GET `/preferences`        | Read own enabled/revision/checkpoint state; defaults off without writing |
| PUT `/preferences`        | Explicit own enabled flag plus expectedRevision                          |
| GET `/items?cursor=`      | Current source-filtered page; requires personal opt-in                   |
| POST `/acknowledge`       | Current visible activityId plus expectedRevision                         |
| GET `/events/:activityId` | Reauthorized recorded-source proof                                       |

Requests reject supplied recipient/user/workspace fields rather than trusting them. Current workspace read membership is sufficient for personal preferences and proofs; these operations do not mutate documents, tasks, snippets or workspace administration. The API has no broadcast, recipient-list, publish or external delivery operation.

## Storage and privacy

The new AsyncDigestPreference table stores only workspace/user identifiers, enabled state, a revision, checkpoint event ID/time and update time. It has a composite primary key, user/workspace deletion cascades and forced RLS requiring both the transaction's tenant and authenticated digest actor. A workspace owner cannot read another member's preference via this feature. Source messages and resource content are not copied into this table.

Existing Activity records receive only a typed source pointer and revision; no extra title/body copy is added. The digest queries current tenant data rather than creating a shared workspace summary/cache. No model provider, embeddings, training corpus, email/chat adapter, external URL fetch or background publication is involved. Request logging retains the existing body/query-free serialization; cursors are not bearer tokens. New state is private but operators/database backups can still contain identifiers and update times, so ordinary retention/access controls remain necessary.

A removed/inactive member or suspended workspace fails before retrieval or preference mutation. Archived/deleted sources disappear on a new read and proof links return unavailable. Previously rendered browser text can remain until refresh/close; this feature does not promise remote erasure or introduce a new passive-eviction protocol. Membership/source locks protect each request's transaction, not all future use of content a reader already saw.

Preferences are retained until user/workspace deletion or a future explicit maintenance policy; opt-out does not erase the checkpoint. Deleting/pruning an Activity may leave a historical checkpoint key, which still works as an ordering boundary and does not keep the activity alive. Existing activity retention/deletion is not silently rewritten.

## Design and limits

The page uses the shared shell, semantic tokens, wrapping layouts and existing controls. Native keyboard buttons and an expandable UTC window support inspection without a dense toolbar. Loading skeletons, an honest empty state, access/error retry, route error boundary and a separate source page are implemented. Rendering is plain text; recorded titles cannot inject markup or arbitrary URLs. Source URLs are built from verified kinds/IDs. Messages are bounded to1000 characters; source IDs/revisions are bounded. Pages and SQL work run within the existing transaction deadlines. Large-workspace performance has not been benchmarked.

This is the in-app creation-event digest, not complete change history. Continuous CRDT edits, resource updates/deletions, decisions, invitations, unknown/legacy events and AI summaries are not synthesized into entries. Human next-question annotations would need their own explicit recorded source/policy and are outside this bounded event set. Scheduled email/chat, delivery notifications, annotation workflows, historical backfill, snapshot diffs and new task/snippet detail views are not started. There are no disabled placeholder controls for them.

Automatic checks and captures cover the tested desktop/mobile themes; raw axe incompletes and remaining assistive-technology/browser/zoom limits are documented in docs/ui/after/async-digest/REVIEW.md. Actual run results belong in PROGRESS.md. No detection, productivity, onboarding, latency or model-quality metrics are inferred from the tests.

## Validation

Unit tests cover typed source metadata, bounded cursor encoding/decoding and forged preference/ack fields. Real migrated PostgreSQL tests use a non-owner/non-bypass role to cover real document/snippet/task producers, message/timestamp equality, actor+tenant RLS, viewer personal access, cross-workspace forged pointers, admin/AI/unlinked omissions, archive/delete rechecks, equal-time pagination, own-only monotonic checkpoints, subscription races, cursor scope/expiry, masking and revocation/suspension. Component tests cover explicit opt-in, source links/plain text, empty/retry states, explicit acknowledgment, cursor navigation and source retry. Seeded fixture Playwright exercises real activity/source/acknowledgment APIs in both themes and mobile/desktop; only its unavailable-network state is intercepted. No AI model is needed or called by this feature.
