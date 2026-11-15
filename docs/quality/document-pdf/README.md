# Document PDF export verification

`GET /api/v1/documents/{id}/export.pdf` and the existing `/api` alias use the current workspace-authorized CRDT projection, then the existing restricted Markdown exporter. Active workspace members may export; membership, workspace suspension and archive checks occur inside the authorized transaction. Responses use `application/pdf`, a fixed attachment filename, `no-store` and `nosniff` headers.

Rendering uses pinned `pdf-lib` 1.17.1 (MIT) with built-in Helvetica fonts. It consumes plain text and heading levels only. It does not parse HTML, execute scripts or load URLs/resources. Marks, unsupported nodes, unsafe Markdown and characters unsupported by the built-in font return an explicit error. Limits: 256 KiB Markdown input, 40 pages and 2 MiB PDF output.

- Focused unit and disposable PostgreSQL authorization tests passed (5 tests with coverage disabled): valid PDF parse/content, markup rejection, size/page bounds, viewer access, foreign and revoked users, archived/suspended workspace, malformed rich text and absent authentication.
- Full gate `python3 tools/quality/gates.py backend docs/quality/document-pdf/final`: exit 0; lint, format, strict types, 43 suites / 399 tests and build.
- OpenAPI generation/check: exit 0. Coverage baseline comparison: exit 0; statements 85.17%, branches 76.28%, functions 80.69%, lines 87.63%.
- Pinned Semgrep/Gitleaks source and test scans: five commands, each exit 0; see `final/security.json`.
- `pdf-lib` package metadata: version 1.17.1, MIT. `npm install --save-exact` completed and its bundled audit reported 31 low/moderate findings, no high/critical. A later standalone `npm audit --audit-level=high` failed because registry DNS was unavailable; no dependency audit fix or threshold change was made.

The browser pipeline was not changed. No production data, deployment or provider integration was involved. Workspace archives, PDF UI, remaining portability flows and Phase 13 acceptance remain pending.
