# Markdown export verification

`GET /api/v1/documents/{id}/export-markdown` returns `text/markdown` with no-store caching for authorized current workspace members. It reconstructs the journal in the same authorized tenant transaction and rejects archived documents. Only single-line paragraphs and ATX headings supported by the existing importer are exported; marks, other nodes and text that would change meaning are rejected.

Focused unit tests: 2 passed with coverage disabled. Focused PostgreSQL integration tests: 2 passed with coverage disabled, covering journal freshness despite a stale projection, round-trip, foreign and revoked users, archived source and unsupported marks. OpenAPI generation and consistency passed. Full backend gate: lint, format, types, 41 suites / 387 tests and build passed. Coverage comparison to the existing baseline passed: statements 84.93%, branches 76.19%, functions 80.11%, lines 87.31%. Raw gate logs are in `backend/`.

Markdown export is restricted, not a general rich-text export. PDF, CSV, workspace archives and other Phase 13 features remain pending. No production data or external provider was used.
