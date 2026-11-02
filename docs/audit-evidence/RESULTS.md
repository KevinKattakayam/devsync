# Execution evidence

Date 2026-10-31. Node v22.23.2, npm 10.9.8; Docker server 29.9.2. Commands ran against source copies in ignored `docs/audit-evidence/runtime/{backend,frontend}` so installation, generated Prisma client, Next output and temporary tests did not change application paths. Existing ignored local env files were reused in those copies; values are excluded from all published evidence. Logs are raw stdout/stderr, not rewritten summaries. No `npm audit fix`, source edits, data migrations, account mutations, deployment or fabricated test passes.

| Check | Actual outcome | Raw evidence |
|---|---|---|
| backend npm ci --no-audit | Initial restricted run stuck in install/generation, later canceled (130); elevated retry succeeded (817 packages) | backend-install.log, backend-install-escalated.log |
| frontend npm ci --no-audit | Success (570 packages); deprecated collaboration-cursor warning | frontend-install.log |
| backend npm audit --json | Restricted EAI_AGAIN; elevated audit returned 49 entries: 2 critical / 12 high / 31 moderate / 4 low | backend-audit.log, backend-audit-escalated.json |
| frontend npm audit --json | Restricted EAI_AGAIN; elevated audit returned 73 entries: 2 critical / 16 high / 54 moderate / 1 low | frontend-audit.log, frontend-audit-escalated.json |
| backend npm test | Elevated final: 2 suites pass, 2 fail to compile; 3 individual tests pass. RLS imports and queue Worker generic fail; no tests changed | backend-tests-escalated.log; initial/retry logs retained |
| backend npm run test:e2e | Exit 0, **2 skipped**, no executed tests: E2E_WORKSPACE_ID/E2E_STORAGE_STATE absent | backend-e2e.log |
| frontend npm test | Missing script | frontend-tests.log |
| backend npm run lint | Missing script | backend-lint.log |
| frontend npm run lint | Exit 1: 105 problems, 52 errors / 53 warnings | frontend-lint.log |
| backend npx --no-install tsc --noEmit | Initial generated-client errors during stalled Prisma install; final generated-client check succeeds | backend-typecheck.log, backend-typecheck-retry.log, backend-typecheck-final.log |
| frontend npx --no-install tsc --noEmit | Exit 0 | frontend-typecheck.log |
| backend npm run build | Initial generation network failure; elevated retry exit 0 with Prisma generation and tsc | backend-build.log, backend-build-retry.log, backend-build-escalated.log |
| frontend npm run build | Restricted Turbopack subprocess bind EPERM; elevated exit 0, compiled and type-checked all routes | frontend-build.log, frontend-build-escalated.log |
| backend npm run dev | Restricted tsx IPC EPERM; elevated server starts on5000, Redis repeatedly ECONNREFUSED127.0.0.1:6379 | backend-dev.log, backend-dev-escalated.log |
| frontend npm run dev | Restricted port3000 EPERM; elevated Next ready, public pages render | frontend-dev.log, frontend-dev-escalated.log |
| GET /api/health | HTTP200 status ok | health-probe.log |
| GET /api/ready | HTTP503 database unreachable | ready-probe.log |
| docker compose config --quiet | Exit0 with obsolete version + missing Clerk/encryption/public-key warnings (verbatim logged) | compose-probe.log |
| Terraform version/validation | terraform executable absent, no validation result claimed | terraform-probe.log |
| UI route capture | 28 screenshots: 14 routes × desktop1440/mobile390, height1000, fullPage. Protected routes redirected to login | ui-results.json, ui-capture.log, ../../ui/before/README.md |

Initial command exit statuses/time bounds are in commands.json; generated-client rerun statuses in retry-commands.json. Elevated exits are recorded by tool execution and final status in final-commands.json. An empty type-check log means successful no-output completion, not skipped work. Backend build success excludes test source by tsconfig; it does not contradict Jest compilation failures.

Dependency advisories include transitive/meta-vulnerabilities and build tools. They do not demonstrate 122 exploitable production bugs. Exact provider advisory URLs/ranges/remediation are preserved in each JSON. Backend critical entries include handlebars and proxy-addr; frontend critical entries include next and next-auth. Maintainer reference checked during audit: [Multer security advisories](https://github.com/expressjs/multer/security/advisories). Import-candidate list is a literal-reference heuristic only; peer dependencies/config/CLI may still require packages. Registry outdated output is recorded separately and is not automatic upgrade advice.

The application was not fully exercised: database readiness failed; Redis was absent; no seeded authenticated workspace/role identities or captured E2E login state was available. Docker engine availability does not fix missing baseline migration or provide identities. No new database or cloud service was provisioned. Authentication barriers were preserved. Full editor/mobile/accessibility/concurrency/load/DR and provider/Stripe/SCIM integration results remain unverified, with verification actions in PROGRESS.md.
