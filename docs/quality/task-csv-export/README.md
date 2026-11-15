# Workspace task CSV export verification

`GET /api/v1/workspaces/{id}/tasks/export-csv` and the existing `/api` alias require an active workspace owner, editor or viewer. The workspace transaction checks membership and suspension and reads tasks through their columns and boards in that workspace. A fixed download filename, `text/csv`, `nosniff` and `no-store` headers are set. The existing version 1 codec prefixes data cells for spreadsheet safety. It supports column ID, title, description, priority, assignee ID and due date; task keys, labels and other fields are excluded. Null descriptions and assignees become empty fields. The response refuses more than 1,000 tasks or 1 MiB rather than truncating. The task, board and column schemas have no archive flag; deleted tasks are not returned.

- Focused PostgreSQL fixture tests: 2 passed with coverage disabled; cover owner/editor/viewer access, foreign and revoked users, missing authentication, suspended workspace, deleted task, formula content and workspace isolation.
- `python3 tools/quality/gates.py backend docs/quality/task-csv-export/backend`: exit 0; lint, formatting, strict types, 42 suites / 392 tests and build.
- OpenAPI generation and consistency: `NODE_ENV=test node --import tsx src/scripts/openapi.ts --write` and `--check`, exit 0. The initial npm invocation failed in the sandbox because tsx could not open its IPC socket; the IPC-free invocation passed.
- Focused integration initially failed in the sandbox because Testcontainers could not access a container runtime; the authorized disposable PostgreSQL retry passed.
- `node tools/ci/coverage.mjs backend backend/coverage/coverage-summary.json tools/ci/coverage-baseline.json`: exit 0; statements 84.98%, branches 76.22%, functions 80.45%, lines 87.50%. Existing thresholds were unchanged.
- Pinned Semgrep and Gitleaks source/test scans: five commands, each exit 0; see `security.json`.

CSV import, task-key and label portability, archive export, PDF and Phase 13 acceptance remain pending. No production data or external provider was used.
