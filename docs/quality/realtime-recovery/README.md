# Real-time editor and recovery

This phase strengthens the existing TipTap3/Yjs/Hocuspocus implementation. It does not replace the CRDT engine, change API/WebSocket messages, introduce a migration or lower any admission/security/coverage limit. All browser identities below are seeded fixtures, not real Clerk accounts. The prior real-Clerk acceptance blocker remains open.

## Read-only preflight

Started clean on `upgrade/enterprise` at `fadb379`, fourteen commits ahead of cached upstream. Root/frontend AGENTS, current PROGRESS, FINAL_REPORT, ARCHITECTURE, AUTHZ_MATRIX, RUNBOOK, CRDT_OPERATIONS, ADR007/010, related policy/source/tests and journal/revision migrations were read before modification. The installed Next client-component guide and actual Hocuspocus/TipTap/provider source informed the frontend work. No branch reconciliation, push or deployment occurred.

| Existing functionality | Source evidence | Assessment before changes |
|---|---|---|
| PostgreSQL journal before native SyncStatus acknowledgment | `backend/src/services/crdt-journal.ts`, `collaboration-server.ts`; installed Hocuspocus MessageReceiver | Implemented, retained; transaction-time writer policy, deduplication, current JSON/revision and indexing outbox commit before acknowledgment |
| Serialized snapshot compaction and restart load | Same services; `20261031010000_crdt_journal` and `202611010001_canonical_revision` migrations | Implemented, retained; row-locked snapshot plus committed updates; automatic64-record compaction and normal debounce |
| Tenant/role/source and ongoing transport checks | `security/workspace-policy.ts`, `realtime-identity.ts`, collaboration/socket factories, revocation integration tests | Implemented, retained; viewer protocol denial, active membership/source checks, passive sweeps and provider-session checks remain independent |
| Account/room-scoped IndexedDB and reconnect/token renewal | `frontend/src/lib/local-first-yjs.ts`, related component tests | Implemented, but connection/pending display state was not scoped to the new replica on a room switch; permission loss looked like ordinary offline recovery |
| Concurrent/offline and killed-process protocol tests | `backend/src/__tests__/collaboration.integration.test.ts`; existing browser `editor.spec.ts` | Implemented, retained; lacked a combined actual-browser checkpoint/journal/process-kill recovery journey |
| Historical revision restore product | `crdt-migration.ts`, schema, CRDT_OPERATIONS | Missing as a general product; conversion rollback refuses subsequent edits. A current checkpoint and retained conversion original are not a revision history. No unsafe restore UI added |

## Narrow changes and red/green evidence

`client-state-red.txt` reproduces two failures against the prior hook (four existing cases still pass): old room connection/pending state carries over, and a4403 access disconnect has no distinct exposed access state. `client-state-green.txt` passes after the fix. Connection status and acknowledgment count now carry their owning Y.Doc; a new room defaults offline rather than borrowing another replica's acknowledgment. Provider denial/4403 stops editing and exposes a replica-scoped access-unavailable state. Fresh authorized admission clears it. Existing general offline behavior and uncached renewal remain.

`DocumentSyncStatus` retains existing Saved/Saving/Offline labels for their original conditions and explains that Saved means remote journal acknowledgment. Access loss now says editing stopped and that pending local edits are not confirmed remotely. Local Y.Doc application is synchronous, while IndexedDB persistence is asynchronous; neither an offline edit nor a screenshot proves a remote commit.

The new test-only recovery controls require explicit E2E_RECOVERY mode, NODE_ENV=test, an isolated `devsync_e2e_` database and a random run capability checked with timingSafeEqual. They expose only generation, bounded document state metadata, normal compaction and a fixed crash request. Strict schemas reject unknown fields. Guard tests were written first (`control-guard-red.txt` records the absent-module compilation failure, not a discovered production vulnerability); `control-guard-green.txt` and full backend tests verify production/wrong-database/absent-capability rejection. Production app/server imports no recovery-control module, and production compilation excludes testing executables.

The browser orchestrator now launches `node --import tsx testing/server.ts` directly. The tracked PID is the server, so the fixed IPC crash request kills the actual process. The recovery CI target joins the existing matrix; it retains all original jobs, tests, scans and thresholds. Its sixty-second store debounce is test-only, used to expose a committed journal row before checkpointing; production debounce,64-record compaction, frame/state/rate limits and protocol remain unchanged.

## Actual browser evidence

Run from repository root, using installed Chrome:

```sh
E2E_CHROMIUM_PATH=/usr/bin/google-chrome node tools/ci/browser.mjs recovery
E2E_CHROMIUM_PATH=/usr/bin/google-chrome node tools/ci/browser.mjs core
```

Final recovery exit0: one combined journey passes (`browser-direct-process.txt`, [structured results](browser/RESULTS.json)). Core exit0: all12 unchanged journeys pass (`browser-core.txt`). Real Next/TipTap browser contexts communicate through the actual Hocuspocus protocol, migrated disposable PostgreSQL under a non-owner/non-bypass runtime role, and actual Redis. Only identity is replaced by the existing isolated fixture adapter.

The recovery journey demonstrates:

1. Three independent browser contexts: owner/editor concurrently change the document, viewer receives the result; authenticated awareness shows collaborators. Owner frames receive600ms delay in each direction, preserving FIFO delivery. Saving is observed before native acknowledgments arrive; eventual Saved and authoritative text follow. This is injected latency, not a WAN/performance measurement.
2. Owner disconnects and makes a local edit while editor continues online. An actual IndexedDB transaction is observed. The owner page is closed, HTTP restored while Yjs stays disconnected, then a new page recovers the local text before transport reconnect. Reconnection merges both contributions. This is local-replica recovery, not an installable offline app-shell claim.
3. Seventy repeated browser edits converge to identical TipTap document text. The journal count drops below64 while revision reaches at least70, exercising automatic compaction. Explicit existing journal compaction then leaves zero pending rows; decoding the persisted snapshot contains all markers.
4. A further edit receives native acknowledgment while still present in a journal row and absent from the snapshot. The actual server PID receives SIGKILL. Generation advances0→1 on replacement against the same DB/Redis. A fourth, fresh browser with no previous IndexedDB content receives both the snapshot markers and acknowledged journal edit. The other browsers reload and recover too. Fixture sessions are process-local, so the harness reauthenticates fixtures after restart; this is not Clerk session recovery evidence.
5. The real viewer TipTap instance dispatches an update despite read-only controls. The actual protocol returns negative SyncStatus; authoritative API/editor content excludes it. This is independent of a disabled button or a mocked transport.
6. An editor update is delayed while the owner removes that member. The API denies subsequent document reads; browser Yjs closes and editing stops, an actual Socket.IO presence connection disconnects, the delayed update does not persist, and later owner edits do not reach the removed browser. Existing transaction-time and cross-instance revocation regressions also pass in the backend suite.

[Recovered fixture screenshot](browser/recovered-fixture.png) was inspected after restart; it contains synthetic markers and fixture names only. It is not credential/provider evidence or a refreshed visual baseline. No authentication screenshot, token, trace or storage-state export was recorded.

## Failures retained and corrected

- First browser attempt failed because DOM text included remote cursor-name decoration inside a marker. The retry reads TipTap's actual document text and additionally requires identical content across clients. No original test/assertion was removed.
- Second attempt reached journal/checkpoint assertions but killed a tsx launcher, leaving its child listening. Replacement failed EADDRINUSE; generation never advanced. This was a failed experiment, not successful crash recovery. The exact orphan fixture process was verified/stopped (`orphan-fixture-cleanup.json`); unrelated stacks were untouched. Direct Node launch fixed the harness, and the final actual-kill journey passes. Earlier failed result JSONs and full logs remain.
- Initial sandboxed frontend build could not parse Next's TypeScript subprocess output. The elevated build retry passes, and the complete `frontend-final` sequence passes with all9 named Node tests plus92 component tests. The initial sandbox Node output reports only four file wrappers and is not substituted for those named results.
- Comparing the first accepted backend run against the retained prior-phase summary caught small statement/branch/line decreases, even though configured floors passed. The missing coverage included the transaction-denial catch and inline branches reached inconsistently by timing-based cases. An added regression pauses at journal entry after the frame check, changes the actual DB role, then resumes the real tenant transaction with the passive sweep delayed. It requires transport closure and no content/journal/indexing persistence. No authorization/persistence behavior is mocked. Failed comparison/summary records remain separately; final comparisons retain the original requirements. The intermediate comparison still showed small statement/branch deficits. Added explicit resource-window/frame limits and a real-protocol64-update checkpoint test, including the journal's own oversized-update rejection and recovery through an independent server. These are additional phase-specific regressions, not lower baselines.
- `backend-final` stopped at formatting of the shortened launcher argument array; formatting was applied and the accepted full sequence is recorded separately. Source format/security/coverage policies are unchanged.

## Verification, deployment and rollback

[RESULTS.json](RESULTS.json) records accepted commands/exits, coverage, scans and scope. Final full runs pass305 backend tests,92 component tests and9 named Node tests. Backend coverage is82.34/72.96/76.06/84.61; frontend45.03/41.39/42.50/45.75 (statements/branches/functions/lines). Every metric passes both the unchanged checked-in baseline and retained previous-phase summary comparison. `backend-final-verified` and `frontend-final` hold full lint/format/strict types/tests/build records; earlier runs remain separate. Backend tests include actual journal/revocation, migrated tenant RLS, conversion rollback refusal and two new recovery-control guards a deterministic precheck-to-commit revocation race, frame/window admission boundaries, and64-update compaction recovery. OpenAPI drift remains zero because no product contract changed. No dependency version or scanner exception changed; npm Moderate/Low advisories remain visible. No new container-image/hosted-CI/deployment certification is inferred.

No migration, data conversion, mass update, production restart or production snapshot restore is required for this patch. Roll back only the frontend display code and isolated test wiring if needed; do not clear IndexedDB, replace snapshots from JSON or relax server authorization. Retain the existing journal and database schema. A historical restore needs a separately reviewed revision model, current writer authority, expected-revision conflict handling and canonical Yjs operations; it must preserve acknowledged updates and record the restoration. The existing migration rollback is not a general document restore operation.

## Limits and stop

These are bounded local correctness results for small synthetic edits and an application-server SIGKILL while DB/Redis remain available. They do not prove database/disk-loss recovery, production backup/PITR, Redis outage behavior, multi-region capacity, long-offline batches over the64KiB frame limit, browser storage failure, universal browser behavior, or successful Clerk sessions. Existing admission/rate limits and membership/source/provider checks remain enabled. Three active clients and70 edits are not a load benchmark. Local access revocation cannot erase previously downloaded content.

Actual Clerk sign-in remains the prior phase's external acceptance item; follow `../identity-lifecycle/README.md` in normal supported browser profiles. No real provider success is inferred here. Hosted CI, deployment and production restore rehearsal require separately authorized operator work. General revision-history/restore UI remains a product/engineering item, not merely a missing credential. This phase stops after the recorded local delivery; no next phase or push is started automatically.
