# Phase1a execution results

All commands ran on upgrade/enterprise. Actual stdout/stderr and status files are retained; no Playwright E2E, cloud deployment, production DB mutation or push. Backend integration tests start disposable PostgreSQL/pgvector and Redis containers. No existing tests/assertions were removed or weakened.

| Group | Pre-fix regression evidence | Final gate |
|---|---|---|
| Critical + quality | critical-red.log:9 failed/2 passed | group1: backend5 suites/17 tests; frontend1 test; installs/lint/typecheck/build pass |
| Authorization | authz-red.log:22 failed/4 passed | group2: backend6 suites/47 tests (30 authorization cases including positive canonical cases); both service gates pass |
| AI rendering / webhook tenant | xss-red.log:2 failed/1 passed; github-tenant-red.log:foreign task update observed | group3-results.json: backend7 suites/48 tests; frontend3 tests; all gate steps pass |
| Migrations / hierarchy / seed | migrations-red.log:3 failed; hierarchy-red.log:foreign-parent insert accepted | group4-results.json: backend8 suites/52 tests; frontend3 tests; all gate steps pass |
| Dependencies | deps-backend-red.log:3 floor failures; deps-frontend-red.log:Next floor and unused NextAuth failures | group5-results.json backend and group5-retry-results.json frontend: installs/lint/typecheck/tests/build pass; backend9 suites/55 tests, frontend5 tests |

Frontend final lint:0 errors,55 warnings (warnings increased after the rule-package update; none hidden). Final builds and both application/seed typechecks succeed. Node unit tests are not browser E2E. Mocks validate authorization handler boundaries; they are not evidence of raw-protocol load testing or full application RLS coverage.

Current pre-upgrade npm audits: backend60 entries including2 Critical/12 High; frontend73 including2 Critical/16 High. Final audits: backend41 (0 Critical/0 High/39 Moderate/2 Low); frontend16 (0 Critical/0 High/16 Moderate/0 Low). These are advisory entries, not application-finding counts or proven exploits. Exact before/intermediate/final JSON and attempted-fix logs are committed. Remaining Moderate/Low advisories are still open. No audit fix --force or peer-bypass flags used.

Failed environment/tooling attempts are retained: initial root-level Prisma validate lacked DATABASE_URL; actual isolated migration deployment and generated-client builds then passed. Dependency resolver rejected mixed TipTap peers; coherent release resolution succeeded. npm ci caught AJV transitive-placement inconsistency; normal npm install repaired it and a subsequent clean npm ci passed. A prior backend test run overlapped dependency replacement and produced an invalid source-map warning; final gates run installation and checks sequentially per service. The initial webhook harness imported the server emitter; its emitter is now mocked and final tests exit normally. No such transient result is counted as a final passing check.

The isolated migration test runs the actual migration chain, verifies forced RLS with a non-owner NOSUPERUSER NOBYPASSRLS role, checks tenant isolation/LOCAL reset, verifies indexes, runs the actual seed twice and rejects a cross-workspace parent through the composite FK. It does not certify existing production schema/data or complete G01 across application callers.

Sensitive local env values and installed dependencies are not included. The ignored dependency-resolution directory is a temporary npm artifact. Historical schema contains old column definitions only, not credentials or working accounts.
