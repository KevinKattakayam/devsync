# ADR012: canonical server document mutations

Context: REST and task-completion agents wrote TipTap JSON while connected editors used Yjs. Compaction could overwrite those server changes. A whole-document replacement also cannot infer a caller's intended merge with a newer revision.

Options: keep two writable formats; send untrusted server HTTP requests into WebSockets; or mutate the authoritative Yjs state within the existing PostgreSQL transaction and refresh loaded rooms from that journal.

Decision: initialize new REST documents as Yjs. Server mutations lock the document, load snapshot plus committed updates, change its actual XML fragment, and atomically store the snapshot, JSON projection and monotonic revision. Agent summaries append Yjs paragraphs under the initiating user's current writer policy, checked both before provider disclosure and after provider latency. Legacy unattributed jobs fail closed; they are not silently run as an owner.

Add `PUT /api/v1/documents/:id/content` with mandatory `crdtRevision` for compare-and-set whole-content replacement. The legacy PATCH contract remains supported, with atomic canonical replacement; supplying a revision opts it into conflict detection. Legacy replacements without a revision retain their existing last-writer intent and should migrate to PUT; they are not advertised as safe stale-save detection. Metadata PATCH contracts remain unchanged.

Each loaded document checks its database revision every500ms and applies changed committed state to its live Y.Doc. This gives REST/worker writes durable fanout across independent instances and legacy/canonical room aliases without depending on a transient publish succeeding. Redis remains the fast editor-to-editor path. Refresh retries after failures; per-connection authorization independently fails closed. Shutdown stops and awaits the refresh loop.

Consequences: this adds bounded-by-room-count database reads and JSON projection work on journal appends. Performance under production-scale load has not been measured. PostgreSQL remains authoritative. Compaction never copies a possibly stale live room into storage. A revision column requires the new forward migration. This does not convert ingestion, other workers or offline billing reservations, nor solve all retry/idempotency semantics for AI jobs.
