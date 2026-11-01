# ADR017: production-excluded browser authentication fixtures

Context: the application uses Clerk. Development keys exist locally, but the read-only admin API check returns403 without a provider error, and no real browser identity fixture IDs were supplied. Provider validity is unverified. The user explicitly authorized a test-only login path if provider authentication cannot be automated.

Options: require provider-managed browser sessions; add an environment-triggered backdoor to the production app; or build an isolated test composition and frontend artifact using the actual application routes/policies.

Decision: keep production Clerk authentication. A trusted request-scoped authentication strategy permits a separate test executable to compose fixture identity resolution. No request header, cookie or environment variable can select that strategy in the production server. The test executable/login provider lives outside src/dist and the final Docker artifact, refuses production mode, requires an isolated database name and random per-run secret, and binds loopback. Its fixture cookies/tokens identify only seeded test accounts and are rejected by the production Clerk strategy. No production login route is added.

The frontend test artifact is generated into an ignored staging directory with an explicit fixture auth adapter and login page. The production frontend source/build has no fixture flag or adapter. Browser automation adds the ephemeral run capability only to the exact local fixture-login endpoint; it is never a public bundle variable or a deployment credential. Real database policy, API handlers, sockets and CRDT code remain in use. Negative tests must verify production-mode refusal and absence of fixture routes/tokens in the production application.

Consequences: these tests verify authenticated product behavior, not Clerk's hosted sign-in UI or provider session issuance. Provider integration still needs a valid development instance/identities in a separate smoke test. Fixture source and generated artifacts must remain outside production packages and be included in development lint/type checks.

Implementation status: backend fixture composition and production-rejection regressions are implemented. Frontend artifact generation, invitation acceptance and Playwright product flows remain pending; this ADR is not a browser E2E pass.

Phase1d increment: frontend/testing now generates a separate development-only tree with fixture identity/token/logout adapter. Generator and generated production-build refusal, source isolation, component behavior and generated type checking are verified. This still does not implement browser orchestration or establish authenticated Playwright/Clerk sign-in success. Current Clerk admin access is HTTP200; required three identity mappings/sign-in method remain missing.
