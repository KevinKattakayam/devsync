# Phase1c landing-page recapture

Original main9deffe2 was run in the existing separate worktree. The landing page again returned HTTP500 at both widths, with a self-proxy ECONNRESET in the runtime log. A worktree-only change excludes the already-public root route from Clerk middleware. With that change, the original landing UI renders HTTP200 at1440px and390px; both home screenshots below have been replaced and visually inspected. The deeper Clerk/proxy failure remains unverified; this is an isolated workaround, not a production fix or a DB issue proven by tracing.

The exact one-line workaround, runtime and before/after capture output are in docs/phase1c-evidence/original-main-workaround.patch, original-main-runtime.log, original-main-home-capture.log and original-main-home-capture-workaround.log. No protected route was made public. Authenticated interiors remain unfinished: Clerk admin access is unverified and the new isolated browser-auth fixture has not yet been connected to a frontend artifact. Existing protected-route images below are historical login redirects, not populated workspace screenshots. The earlier manifest is retained for those attempts.

---

# Original-main BEFORE capture — partial UI coverage

Captured from detached original `main` commit `9deffe2` in the separate `.worktrees/phase1b-main` worktree, without modifying its application code. Viewports: 1440×1000 and 390×1000, full-page screenshots, system Chrome driven by Playwright. Existing ignored Clerk configuration was supplied; no login/session authorization was bypassed. The temporary worktree/processes were lost during a session restart, so captures were completed again in the persistent workspace worktree.

All 14 page route shapes were attempted at both widths. Eight public authentication-page captures rendered; 18 protected-route captures redirected to login. Landing-page requests to 127.0.0.1 timed out after 25 seconds at each width; a separate localhost retry returned HTTP500 and `Internal Server Error`, which is what the two home images now show. The runtime log records `Failed to proxy http://localhost:3100/ Error: socket hang up` / `ECONNRESET`. Root cause is **unverified**; reproduce with this original commit and inspect middleware/proxy/Clerk handling. No working landing UI is claimed.

**Authenticated interior screenshots remain blocked.** Original main's `db:seed` command targets absent `backend/prisma/seed.ts` (I09). The current branch's seed is tested against disposable PostgreSQL, but no three real Clerk test identities/credentials were provided for browser fixtures. Placeholder route IDs therefore represent route shapes, not seeded data. These screenshots replace access-state captures, not the requested populated interiors. The scope is incomplete; do not treat login images as workspace/editor/Kanban evidence.

Exact attempts, final URLs, status and page errors: [route manifest](../../phase1b-evidence/original-main-ui-results.json), [landing retry](../../phase1b-evidence/original-main-home-retry.json). Original runtime/install/capture/seed logs are in `docs/phase1b-evidence/`. No production data or credentials were added to these artifacts.

| Route | Width | Capture | Actual result |
|---|---:|---|---|
| `/` | 1440 | [home-1440.png](home-1440.png) | HTTP500 error page |
| `/login` | 1440 | [login-1440.png](login-1440.png) | HTTP200 public authentication page |
| `/signup` | 1440 | [signup-1440.png](signup-1440.png) | HTTP200 public authentication page |
| `/sign-in` | 1440 | [sign-in-1440.png](sign-in-1440.png) | HTTP200 public authentication page |
| `/sign-up` | 1440 | [sign-up-1440.png](sign-up-1440.png) | HTTP200 public authentication page |
| `/dashboard` | 1440 | [dashboard-1440.png](dashboard-1440.png) | Login redirect; interior blocked |
| `/settings/billing` | 1440 | [settings-billing-1440.png](settings-billing-1440.png) | Login redirect; interior blocked |
| `/workspace/audit-placeholder` | 1440 | [workspace-audit-placeholder-1440.png](workspace-audit-placeholder-1440.png) | Login redirect; interior blocked |
| `/workspace/audit-placeholder/docs` | 1440 | [workspace-audit-placeholder-docs-1440.png](workspace-audit-placeholder-docs-1440.png) | Login redirect; interior blocked |
| `/workspace/audit-placeholder/docs/audit-document` | 1440 | [workspace-audit-placeholder-docs-audit-document-1440.png](workspace-audit-placeholder-docs-audit-document-1440.png) | Login redirect; interior blocked |
| `/workspace/audit-placeholder/kanban` | 1440 | [workspace-audit-placeholder-kanban-1440.png](workspace-audit-placeholder-kanban-1440.png) | Login redirect; interior blocked |
| `/workspace/audit-placeholder/snippets` | 1440 | [workspace-audit-placeholder-snippets-1440.png](workspace-audit-placeholder-snippets-1440.png) | Login redirect; interior blocked |
| `/workspace/audit-placeholder/settings` | 1440 | [workspace-audit-placeholder-settings-1440.png](workspace-audit-placeholder-settings-1440.png) | Login redirect; interior blocked |
| `/superadmin` | 1440 | [superadmin-1440.png](superadmin-1440.png) | Login redirect; interior blocked |
| `/` | 390 | [home-390.png](home-390.png) | HTTP500 error page |
| `/login` | 390 | [login-390.png](login-390.png) | HTTP200 public authentication page |
| `/signup` | 390 | [signup-390.png](signup-390.png) | HTTP200 public authentication page |
| `/sign-in` | 390 | [sign-in-390.png](sign-in-390.png) | HTTP200 public authentication page |
| `/sign-up` | 390 | [sign-up-390.png](sign-up-390.png) | HTTP200 public authentication page |
| `/dashboard` | 390 | [dashboard-390.png](dashboard-390.png) | Login redirect; interior blocked |
| `/settings/billing` | 390 | [settings-billing-390.png](settings-billing-390.png) | Login redirect; interior blocked |
| `/workspace/audit-placeholder` | 390 | [workspace-audit-placeholder-390.png](workspace-audit-placeholder-390.png) | Login redirect; interior blocked |
| `/workspace/audit-placeholder/docs` | 390 | [workspace-audit-placeholder-docs-390.png](workspace-audit-placeholder-docs-390.png) | Login redirect; interior blocked |
| `/workspace/audit-placeholder/docs/audit-document` | 390 | [workspace-audit-placeholder-docs-audit-document-390.png](workspace-audit-placeholder-docs-audit-document-390.png) | Login redirect; interior blocked |
| `/workspace/audit-placeholder/kanban` | 390 | [workspace-audit-placeholder-kanban-390.png](workspace-audit-placeholder-kanban-390.png) | Login redirect; interior blocked |
| `/workspace/audit-placeholder/snippets` | 390 | [workspace-audit-placeholder-snippets-390.png](workspace-audit-placeholder-snippets-390.png) | Login redirect; interior blocked |
| `/workspace/audit-placeholder/settings` | 390 | [workspace-audit-placeholder-settings-390.png](workspace-audit-placeholder-settings-390.png) | Login redirect; interior blocked |
| `/superadmin` | 390 | [superadmin-390.png](superadmin-390.png) | Login redirect; interior blocked |
