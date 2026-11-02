# Dashboard evidence

[Review and critique](REVIEW.md), [final screenshot manifest](final/manifest.json).

Each pass has22 viewport PNGs: five states ×1440/390 ×dark/light, plus an actual empty-account state at360 in dark/light. Full-page axe runs against the actual dashboard and shell, not a shell-only selector. Final22 results report0 violations; incomplete entries remain in each JSON. The final browser suite has6 passing tests, including document creation/undo-by-archive, persisted workspace creation, retry recovery, workspace filtering, keyboard dialog restoration and viewer restrictions.

Run from backend: `NODE_ENV=test E2E_DASHBOARD=1 E2E_DASHBOARD_PASS=final E2E_CHROMIUM_PATH=/opt/google/chrome/chrome node node_modules/tsx/dist/cli.mjs testing/run-browser.ts`. It uses the existing isolated seed/login harness and stops its disposable processes/containers afterward. No provider credentials belong in test artifacts. Use E2E_DASHBOARD_FILTER only to explicitly select cases, not to relabel skipped work as passed. Default pre-existing suites remain selected when this mode is absent.
