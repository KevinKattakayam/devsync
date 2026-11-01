# Isolated browser identity fixture

This executable is a development fixture, excluded from `src`, `dist` and Docker build context. Production authentication remains Clerk. It is not a completed Playwright suite.

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

The frontend adapter/artifact, invitation acceptance, automated orchestration and full Playwright product journeys are still pending. Production-refusal, normal-app rejection and real database HTTP fixture tests exist. See ADR017 and docs/PROGRESS.md.
