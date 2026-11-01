# Isolated browser identity fixture

This executable is a development fixture, excluded from `src`, `dist` and Docker build context. Production authentication remains Clerk. The separate browser harness now runs ten authenticated product journeys. These use fixture identities, not Clerk provider sessions.

Run `NODE_ENV=test node node_modules/tsx/dist/cli.mjs testing/server.ts` only after migrating and running the seed on a disposable database with the three fixture IDs `user_fixture_owner`, `user_fixture_editor`, `user_fixture_viewer` and `SEED_ALLOW_WRITE=true`.

| Variable         | Required value                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`       | `test`; production mode refuses startup                                                                                            |
| `DATABASE_URL`   | Disposable runtime connection with database name `devsync_e2e_<suffix>`; use a non-bypass RLS role after privileged migration/seed |
| `E2E_RUN_SECRET` | Fresh random32-byte hexadecimal capability per run; no default                                                                     |
| `PORT`           | Optional local port, default5501; server always binds127.0.0.1                                                                     |
| `FRONTEND_URL`   | Exact isolated frontend origin for CORS and real-time origin checks                                                                |
| `REDIS_URL`      | Optional private test Redis for multi-instance behavior                                                                            |

Keep real provider credentials out of this fixture environment. `/__test/login` requires `x-e2e-run-secret` and one seeded email. `/__test/me`, `/__test/token` and `/__test/logout` use its httpOnly, SameSite cookie. Fixture cookies are intentionally HTTP-only-local development transport; production has no such route, cookie parser or signing key. Tokens expire, sessions are bounded and logout invalidates the fixture session. Real request policies, tenant RLS and collaboration factories remain in use.

Run the complete isolated product suite from backend with `NODE_ENV=test node node_modules/tsx/dist/cli.mjs testing/run-browser.ts`. It creates disposable PostgreSQL/Redis containers, migrates/seeds the sample, creates a non-bypass runtime role, generates the frontend artifact and starts both servers on loopback. It shuts down the processes and containers afterward. Install Playwright Chromium first; an existing compatible executable can be selected with E2E_CHROMIUM_PATH. Locally the recorded runs use Chromium from the existing chromium-1200 installation.

Ten journeys cover fixture sign-in/out for all roles, workspace creation, two-context document merging, viewer UI/server denial, open-document revocation within five seconds, Kanban movement, snippet persistence and invitation acceptance/rejection. The invitation negative scenarios use an admin connection only to the disposable database to expire a record; application identity, policy, transactions, RLS and transports remain real. No protocol or provider-success mocks are claimed. The frontend adapter is under frontend/testing.

Capture mode: set E2E_UI_CAPTURE=current or before. Before requires the detached main worktree at .worktrees/phase1e-main and its cached original dependencies at .worktrees/phase1b-main/frontend/node_modules. This changes only that worktree's auth adapter/proxy/runtime config. Capture mode renders actual public Clerk widgets and uses fixture identities for product pages. E2E_UI_RETRY=missing retains previous successful images and retries gaps; manifests record unavailable pages. It does not grant global SUPER_ADMIN authority.

Production-refusal, normal-app rejection and real database HTTP fixture tests remain. Real Clerk sign-in is a separate missing configuration item; see docs/PROGRESS.md and ADR017/018.
