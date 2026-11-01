# Phase 2b shell captures

[Final captures and manifest](final/manifest.json), [rubric review](REVIEW.md), [final axe results](final/axe.json), [bounds](final/measurements.json), [prior-incomplete review evidence](final/gallery-manual-review.json).

40 final viewport PNGs: default, commands, empty commands, help, focus, user menu, workspace menu, document tree, collapsed rail (desktop) or navigation drawer (mobile), Copilot;1440/390px ×dark/light. Actual seeded owner sessions use the test-only fixture login and disposable migrated PostgreSQL/Redis, with real API/Yjs data. The two nested review documents are created through the existing API. No real Clerk sign-in or production data is represented.

Initial captures are partial because the first run failed; see REVIEW.md and the retained browser-initial.log. final-review-failed retains the first final attempt. Final successful run: browser-corrections.log,6 tests pass. Test fixtures shut down after each run. Product interiors appear in screenshots but shell axe includes only shell navigation/topbar/skip link and open dialogs/menus/listboxes. This is not a whole-product WCAG result.

Playwright baselines are tracked in backend/testing/browser/shell.spec.ts-snapshots. Run from backend: `NODE_ENV=test E2E_SHELL=1 E2E_SHELL_PASS=final E2E_CHROMIUM_PATH=/opt/google/chrome/chrome node node_modules/tsx/dist/cli.mjs testing/run-browser.ts`. Omitting E2E_SHELL_UPDATE compares against tracked baselines; set it to1 only for an intentional reviewed update. This session created the baselines with the explicit update flag and did not run a redundant comparison afterward.
