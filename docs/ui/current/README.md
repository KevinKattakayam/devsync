# Phase 1e current captures

28 successful captures at 1440px and 390px. The manifest records each actual route, HTTP status, final path and file. Historical filenames containing `audit-placeholder` now contain the real seeded `devsync-sample` UI. These are viewport captures with full-page height.

Source: upgrade/enterprise. Public authentication pages render actual Clerk widgets. Protected pages use the isolated owner identity and disposable migrated current backend; these are UI reference captures, not proof of original-main security or real Clerk sign-in. No provider session was fabricated.

The current frontend uses Next16.4.3. The new invitation page is captured at both widths; no corresponding route exists on original main. Its invitation IDs address disposable records and grant no authority without the authenticated verified recipient.

The mobile docs title has zero rendered width in both versions even though the API/DOM contain Welcome. The collector verifies the visible page heading and the loaded title separately and preserves the actual layout. This inherited UI limitation was not silently corrected in the before worktree.

Uncaptured: `/superadmin` at both widths returns HTTP500. Its server layout calls Clerk `currentUser()`/`auth()` and requires a real global SUPER_ADMIN session, which the fixture adapter cannot provide; its metrics loader also attempts the default backend on port5000, unavailable in this fixture. No global-admin bypass was added. Any historical `superadmin-*.png` files are old login redirects, excluded from the Phase1e manifest and not current evidence.

| Route | Width | File | Result |
| --- | ---: | --- | --- |
| `/` | 1440 | [home-1440.png](home-1440.png) | HTTP 200 |
| `/login` | 1440 | [login-1440.png](login-1440.png) | HTTP 200 |
| `/signup` | 1440 | [signup-1440.png](signup-1440.png) | HTTP 200 |
| `/sign-in` | 1440 | [sign-in-1440.png](sign-in-1440.png) | HTTP 200 |
| `/sign-up` | 1440 | [sign-up-1440.png](sign-up-1440.png) | HTTP 200 |
| `/dashboard` | 1440 | [dashboard-1440.png](dashboard-1440.png) | HTTP 200 |
| `/settings/billing` | 1440 | [settings-billing-1440.png](settings-billing-1440.png) | HTTP 200 |
| `/workspace/devsync-sample` | 1440 | [workspace-audit-placeholder-1440.png](workspace-audit-placeholder-1440.png) | HTTP 200 |
| `/workspace/devsync-sample/docs` | 1440 | [workspace-audit-placeholder-docs-1440.png](workspace-audit-placeholder-docs-1440.png) | HTTP 200 |
| `/workspace/devsync-sample/docs/devsync-sample-doc` | 1440 | [workspace-audit-placeholder-docs-audit-document-1440.png](workspace-audit-placeholder-docs-audit-document-1440.png) | HTTP 200 |
| `/workspace/devsync-sample/kanban` | 1440 | [workspace-audit-placeholder-kanban-1440.png](workspace-audit-placeholder-kanban-1440.png) | HTTP 200 |
| `/workspace/devsync-sample/snippets` | 1440 | [workspace-audit-placeholder-snippets-1440.png](workspace-audit-placeholder-snippets-1440.png) | HTTP 200 |
| `/workspace/devsync-sample/settings` | 1440 | [workspace-audit-placeholder-settings-1440.png](workspace-audit-placeholder-settings-1440.png) | HTTP 200 |
| `/superadmin` | 1440 | — | HTTP 500 |
| `/invitations/cmvxorltr0003a0lwisf7ivv1` | 1440 | [invitation-1440.png](invitation-1440.png) | HTTP 200 |
| `/` | 390 | [home-390.png](home-390.png) | HTTP 200 |
| `/login` | 390 | [login-390.png](login-390.png) | HTTP 200 |
| `/signup` | 390 | [signup-390.png](signup-390.png) | HTTP 200 |
| `/sign-in` | 390 | [sign-in-390.png](sign-in-390.png) | HTTP 200 |
| `/sign-up` | 390 | [sign-up-390.png](sign-up-390.png) | HTTP 200 |
| `/dashboard` | 390 | [dashboard-390.png](dashboard-390.png) | HTTP 200 |
| `/settings/billing` | 390 | [settings-billing-390.png](settings-billing-390.png) | HTTP 200 |
| `/workspace/devsync-sample` | 390 | [workspace-audit-placeholder-390.png](workspace-audit-placeholder-390.png) | HTTP 200 |
| `/workspace/devsync-sample/docs` | 390 | [workspace-audit-placeholder-docs-390.png](workspace-audit-placeholder-docs-390.png) | HTTP 200 |
| `/workspace/devsync-sample/docs/devsync-sample-doc` | 390 | [workspace-audit-placeholder-docs-audit-document-390.png](workspace-audit-placeholder-docs-audit-document-390.png) | HTTP 200 |
| `/workspace/devsync-sample/kanban` | 390 | [workspace-audit-placeholder-kanban-390.png](workspace-audit-placeholder-kanban-390.png) | HTTP 200 |
| `/workspace/devsync-sample/snippets` | 390 | [workspace-audit-placeholder-snippets-390.png](workspace-audit-placeholder-snippets-390.png) | HTTP 200 |
| `/workspace/devsync-sample/settings` | 390 | [workspace-audit-placeholder-settings-390.png](workspace-audit-placeholder-settings-390.png) | HTTP 200 |
| `/superadmin` | 390 | — | HTTP 500 |
| `/invitations/cmvxorq850009a0lw3qxtg2xn` | 390 | [invitation-390.png](invitation-390.png) | HTTP 200 |
