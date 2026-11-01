# Isolated frontend authentication artifact

This is a development fixture. Production `src` imports no fixture code and has no fixture flag. The generated app also refuses production build/start in `next.config.ts`. Backend authentication, roles, RLS and collaboration policies remain in the actual application.

From `frontend`, run `NODE_ENV=test node testing/prepare.mjs`. It creates `.worktrees/frontend-fixture` and refuses to overwrite an existing artifact. Move an old artifact aside before regenerating. It copies application code and public assets, excludes environment files and links the installed development dependencies. No run secret is embedded in the frontend.

Run the backend fixture as described in `backend/testing/README.md`, with `FRONTEND_URL=http://127.0.0.1:3001` and port 5501. Then run `npm --prefix .worktrees/frontend-fixture run dev -- --webpack --hostname 127.0.0.1 --port 3001` from the repository root. Use 127.0.0.1 consistently for cookie same-site behavior.

Browser automation must log in by posting a seeded email to the backend's exact `http://127.0.0.1:5501/__test/login` endpoint with the ephemeral `x-e2e-run-secret` header, then visit the frontend using the same browser cookie context. Never set that header globally or persist it in traces, screenshots, storage-state files or committed configuration. Seeded identities are `user_fixture_owner`, `user_fixture_editor`, `user_fixture_viewer`; the current seed uses `sample-owner@devsync.invalid`, `sample-editor@devsync.invalid`, `sample-viewer@devsync.invalid`.

The adapter loads the authenticated fixture identity, obtains fresh bounded access tokens for the real API/socket providers and invalidates the backend session on logout. Login UI is replaced by an instruction page only in this generated tree. Clerk hosted sign-in and superadmin routes are not tested through this artifact. It does not implement invitation acceptance or orchestrate Playwright/database startup. Authenticated browser journeys remain unfinished; component tests simulate HTTP and do not establish an E2E pass.
