# ADR 004 — Inert AI markup and tenant-bound automation (E02/G08)

Status: accepted.

Context: generated Markdown kept arbitrary raw HTML before dangerouslySetInnerHTML; a correctly signed GitHub webhook resolved task keys globally and could move another tenant's task into its own workspace.

Options: preserve raw HTML and attempt blacklist filtering, add a sanitizer/complete Markdown engine, or make raw HTML inert before the existing small Markdown subset adds fixed tags. For automation, a signature proves sender identity but not ownership of task references.

Decision: escape all ordinary HTML before formatting; separately escape fenced code exactly once. Do not create arbitrary links/images/iframes from raw model text. Preserve existing heading/list/table/code formatting. Restrict webhook task reads and writes to repository workspace through explicit relationship predicates inside a tenant transaction; do not rely on global task-key uniqueness or on superuser RLS behavior.

Consequences: raw HTML is intentionally displayed as text, including within headings/lists/tables. This closes the unsafe preview sink, but is not a claim that all stored rich-text JSON schemas and editor URLs are validated. GitHub's early delivery acknowledgment/idempotency design (G09) remains unresolved. Mocks validate cross-tenant behavior; database migrations/RLS tests are a separate gate.

Evidence: the two HTML regression cases fail before and pass after, while code escaping stays passing. A signed workspace-A PR referencing a B task invoked B's update before the fix and cannot do so afterward.
