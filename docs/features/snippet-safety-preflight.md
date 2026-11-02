# Snippet safety preflight (P04)

## What it does

Snippet safety provides a local preview and a server-enforced, explicitly confirmed save that removes detected credential values. There is no save-anyway override. Editors and owners can create a snippet or load an existing snippet, review the masked fields and findings, then save. Viewers can inspect the saved finding metadata but cannot run preflight or mutate snippets. Every operation uses the current central workspace/role policy; a browser result is never authority.

The feature is a bounded heuristic check, not proof that a snippet contains no secrets. It does not execute code, validate credentials with a provider, revoke keys, infer secret ownership, train a model, export content or call an LLM. A warning recommends rotating credentials that may have been exposed. Redaction cannot revoke a key or undo disclosure elsewhere.

## Deployment, migration and rollback

Apply forward-only Prisma migration `202611020002_snippet_safety` through the existing deployment process. It adds a composite snippet/workspace unique index and a `SnippetSafetyFinding` table with forced tenant RLS, a same-workspace snippet FK and fixed-mask CHECK constraints. No snippet bodies are rewritten by the migration. Ensure the runtime role has the same scoped table privileges used for the other tenant tables.

Set **FEATURE_SNIPPET_SAFETY=true** consistently on all API, frontend and indexing-worker instances. It defaults off; examples are in both services' `.env.example`. The frontend dynamically hides the navigation/page when disabled, and the backend independently returns404 for the new API. This flag is not permission. When enabled, legacy/v1 writes also reject detected values through the existing400 error envelope, so older clients cannot bypass the preflight guard. Their request/response DTOs remain unchanged; their existing clean-write semantics remain supported.

**Rollback note:** disable the flag consistently and roll back the application while retaining the additive table/index. Do not drop findings or attempt a destructive down migration during rollback. Already-redacted content cannot be restored; raw values are intentionally not retained. Disabling the flag restores the legacy behavior, including the absence of this additional safety policy. A future schema retirement requires a new reviewed forward migration.

No paid API, key, extra detector executable or external rule package is required. Existing optional embeddings remain behind the pre-existing embedding adapter/quotas; fixture tests inject explicitly synthetic vectors and make no provider call. P04 works without configuring an embedding provider.

## Rules and licensing

Rule set v1 is original project code using bounded JavaScript regexes, with no Gitleaks/TruffleHog code, rule bundle, binary, extra licence or provider-validation API. The following are pattern families, not verified credential types:

| Finding type          | Heuristic                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| private-key           | Selected PEM private-key headers, through their footer or the end of a truncated input                                             |
| github-token          | Recognizable GitHub-style token prefixes with a sufficiently long opaque suffix                                                    |
| aws-access-key        | AKIA/ASIA-prefixed20-character uppercase/digit identifiers                                                                         |
| provider-key          | Selected sk-/gsk_/xox-/AIza-style prefixed strings                                                                                 |
| bearer-token          | Bearer followed by a sufficiently long opaque value                                                                                |
| credential-assignment | Named key/token/secret/password assignments with values at least8 characters; quoted values can include spaces/escaped punctuation |
| credential-url        | User/password components in selected HTTP/database URI forms                                                                       |

GitHub documents its token prefix families in its [format announcement](https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/); AWS documents [AKIA/ASIA identifiers](https://docs.aws.amazon.com/IAM/latest/UserGuide/securing_access-keys.html). These sources explain recognizable formats, not the quality or completeness of this detector. Synthetic unit tests do not establish recall, precision or whether a candidate is an active credential. No detection-quality figures are claimed.

The browser and server carry the same pure detector in their own build contexts; semantic parity fixtures cover both copies. This preserves the existing independently built Docker/fixture contexts. Changes to rules must update both implementations and their tests. The server rescans every save, so browser drift or a forged client request cannot authorize storing a detected value.

## Flow and storage boundary

1. The user enters title, language, description and code. Drafts stay in component memory; no localStorage, IndexedDB or autosave is introduced.
2. Review runs the local detector, immediately replaces the rendered fields with masked content, and asks the authorized server for a fresh preflight. Original fields remain only in a short-lived in-memory ref for the explicit save/rescan. Nothing is persisted by preflight.
3. The user reviews the result and chooses Save redacted snippet. The server independently scans the submitted fields, validates the redacted output bounds, and writes only masked content. Edit masked draft discards the in-memory original; a new review is then required.
4. Create writes the snippet, masked findings, generic activity, create receipt and embedding outbox atomically. Idempotency fingerprints and response storage use only the redacted content and constant findings, never raw input or raw-match hashes. An identical create retry returns the existing safe result. Two raw candidates producing the same redacted content/findings intentionally share the safe request fingerprint.
5. Edit checks the source snippet's workspace and expected updatedAt under the workspace write lock. It replaces the fields (an omitted description is cleared rather than retaining older content) and latest P04 finding metadata, clears the previous embedding/hash, then queues reindexing in the same transaction. A stale edit returns409; reload before retrying. A lost edit response may require a reload rather than replaying the edit.

Besides tenant/resource identifiers, finding storage contains **only the finding type and its constant masked preview**. It stores no raw value, candidate hash, value prefix/suffix, raw excerpt, location or original draft. Database CHECK constraints require the preview to be exactly `[REDACTED:<type>]`. Findings are unique by type in each scan and represent the most recent P04 save, not a complete history or a statement that all current content is safe. They cascade when the snippet is deleted. Existing snippet copies/backups are not remotely erased by this feature.

All fields are checked, including title/description/language, to keep detected values out of activity and safe-save receipts. Legacy writes fail before their write, activity, idempotency persistence and embedding queue. With the flag enabled, snippet-list projections mask matches in older source rows in memory. Embedding reads and semantic snippet context also mask before provider disclosure. Tenant authorization remains before content retrieval/disclosure and after asynchronous embedding work as in earlier phases.

## Versioned API and permissions

All new endpoints are under `/api/v2/workspaces/:workspaceId/snippet-safety` and return no-store responses:

| Operation                  | Authority                                  | Result                                                                     |
| -------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| POST `/preflight`          | Current OWNER/EDITOR                       | Redacted fields and constant finding metadata; no persistence              |
| POST `/save`               | Current OWNER/EDITOR                       | Explicit confirmRedaction=true; safe create201 or revision-checked edit200 |
| GET `/findings?snippetId=` | Current workspace reader, including VIEWER | Only same-tenant snippet finding types/masks                               |

Strict schemas reject client-supplied findings/authority fields and unconfirmed saves. Existing central active-user, unsuspended-tenant and membership locks apply. A foreign snippet/findings ID inside an authorized workspace returns not-found; foreign/nonmember/viewer write attempts are denied. An owner of two workspaces still cannot bind one workspace's edit to the other's snippet. The metadata FK and RLS also reject cross-tenant access through the non-bypass runtime role. A user can manually paste text they already possess; the server does not retrieve another workspace to scan it.

## UI and accessibility

The flag adds Snippet safety to workspace navigation at `/workspace/:id/snippets/safety`. The dedicated composer uses semantic design tokens, labeled native fields, Radix Select, monospace code, visible focus, wrapping controls, loading skeletons, helpful empty/read-only states, failure/retry, and a route error boundary. Review focuses its heading; Enter works for review and source selection. Masked fields remain readable/selectable while review locks editing. Buttons retain full token opacity on enabled hover. No unreviewed save or secret-restoring Undo is offered.

Screenshots/axe reports and critique are in docs/ui/after/snippet-safety. Raw incomplete items are retained; zero automated violations is not screen-reader certification. Existing Code Snippet Vault presentation and unrelated execution/AI features were not redesigned as part of P04.

## Limits and privacy

- Title200 characters, language50, description1000, code256KiB. Redacted output is checked against the same bounds; expansion past a limit returns400 before storing. Scanner work is capped per field. Oversized historical data can fail closed rather than being silently sent to a provider.
- False positives and false negatives are unavoidable with these rules. Unsupported credential formats, short values, encoded/obfuscated/split expressions, many multiline literal forms and unknown prefixes can evade detection. Environment references are not resolved. No credential-validity check, entropy claim or exhaustive scanner coverage is provided. Harmless examples may be removed; edit the masked draft or use an environment reference instead of bypassing the guard.
- Source bodies must transit the authenticated API in memory so the server can rescan. Use the existing HTTPS deployment boundary. Request logging omits bodies/queries and error telemetry does not retain request content; tests check the actual request-log sink and persisted rows/receipts. Infrastructure outside this application, browser extensions and operator-added instrumentation require their own policies.
- This is not an automatic historical cleanup/backfill. Pre-existing source rows, activities, receipts, backups, downloaded snippets and already-produced vectors may contain older data. List projections mask old matches, and a reviewed save replaces that snippet's stored fields/vector, but it does not purge every prior copy. Plan a separate consented/operator cleanup before treating an existing deployment as comprehensively scrubbed.
- Original browser input is cleared on reset, unmount/principal/workspace change and successful save; a pending authenticated save may finish after navigation. Preflight failure retains only the masked editable draft and needs another review. Reload snippets discards unsaved drafts. Raw values are never inserted into warning messages, finding previews, URLs, newly introduced telemetry or persisted by the P04 save path.
- Other users' changes appear on reload. No new realtime protocol, offline queue, version history, export path, bulk cleanup, provider validation or external secret-revocation capability is introduced.

## Tests and operational requirements

Unit tests cover complete masking across fields, private-key truncation, assignment punctuation, idempotent masks, bounds and browser/server parity using synthetic non-credentials. Integration tests use migrated PostgreSQL with a non-owner/non-bypass role, test log sink, and synthetic embedding adapter for permission/isolation, safe/idempotent persistence, stale edits, legacy bypass denial, source-to-index disclosure, mask-only DB constraints and fail-closed output growth. Fixture Playwright uses real seeded identity/API/database paths; only the unavailable-preflight case intercepts a network request. It exercises create, edit, viewer boundaries, retry, keyboard and axe in both themes at desktop/mobile widths. Actual results are in PROGRESS.md, not implied by this description.

Human action is limited to normal migration/privileges and consistent feature enablement. No paid API/key is required. Historical cleanup, provider-side key rotation and additional scanner/assistive-technology coverage are follow-ups, not performed by this feature.
