# Isolated browser identity fixture

This fixture is separate from the normal API and excluded from production runtime output. Production authentication remains Clerk. Browser journeys use seeded identities, not real Clerk provider sessions. See [current results](../../docs/FINAL_REPORT.md) before interpreting a selectable suite as a passing result.

## Recommended runner

From repository root, with both dependency trees installed, Docker available and a compatible Playwright Chromium installed:

```sh
node tools/ci/browser.mjs shell
```

The helper also accepts `core`, `ai-cost`, `editor`, `kanban`, `settings`, `dashboard`, `decisions`, `snippet-safety` and `async-digest`. Run suites sequentially on a constrained host. It launches `testing/run-browser.ts` with NODE_ENV=test and the selected suite flags. The runner creates disposable PostgreSQL/Redis containers, migrates/seeds, grants a non-bypass runtime role, generates the frontend adapter and starts loopback servers, then cleans up its own processes/services. E2E_CHROMIUM_PATH can select an existing compatible browser executable; paths in historical logs are machine-specific.

The latest Phase5a-3 shell selection passed7 tests; the broader native pointer-drag journey remains open. These fixture journeys do not prove successful hosted CI, real Clerk login, provider billing or production capacity. Raw [quality records](../../docs/quality/phase5a-3/README.md) retain failures/incompletes. Never weaken assertions or refresh a screenshot merely to remove a failure.

## Manual fixture server

Prefer the orchestrated runner above. Manual startup is only for an already migrated/seeded disposable database, with seed IDs user_fixture_owner, user_fixture_editor and user_fixture_viewer and explicit SEED_ALLOW_WRITE=true when seeding:

```sh
cd backend
NODE_ENV=test node --import tsx testing/server.ts
```

Load private test configuration securely first; do not print its values.

| Variable       | Required boundary                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| NODE_ENV       | `test`; other modes refuse fixture startup.                                                                        |
| DATABASE_URL   | Disposable database name matching `devsync_e2e_<suffix>`; non-bypass runtime role after privileged migration/seed. |
| E2E_RUN_SECRET | Fresh random32-byte hexadecimal capability per run; no default.                                                    |
| PORT           | Optional, default5501; server binds127.0.0.1.                                                                      |
| FRONTEND_URL   | Exact isolated frontend origin for CORS and realtime checks.                                                       |
| REDIS_URL      | Private test Redis; shared-state suites need it.                                                                   |

Keep real provider keys out of this environment. `/__test/login` requires the run capability header and a seeded identity; me/token/logout use a bounded httpOnly SameSite session cookie. Logout invalidates the test session, tokens expire, and only the fixture identity allowlist is accepted. Real resource policy, RLS and transport factories remain in use. These local HTTP test cookies/routes are not a production authentication design. See [fixture-auth.ts](fixture-auth.ts), [server.ts](server.ts) and [run-browser.ts](run-browser.ts).

## Historical before captures

E2E_UI_CAPTURE=before/current and the detached main worktree paths in the old capture scripts reproduce a historical evidence workflow, not the ordinary E2E quickstart. The before workflow depended on cached worktree dependencies and replaced only auth/proxy/runtime configuration for protected UI capture against a disposable current backend. Consult the [before manifest](../../docs/ui/before/README.md) and [ADR017](../../docs/adr/017-isolated-browser-authentication-fixtures.md). It did not grant global SUPER_ADMIN authority or demonstrate real Clerk sign-in. Missing worktrees/dependencies must not be replaced by claims that the original environment was reproduced.
