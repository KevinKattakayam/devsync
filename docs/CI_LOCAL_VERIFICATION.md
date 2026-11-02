# Phase1e local CI verification

The complete command gate is `phase1e-evidence/contracts-results.json`: both clean installs, lint, format, strict types, tests and builds pass. Backend:16 suites/192 tests with existing coverage floors. Frontend:7 Node tests/10 component tests, webpack build. The separate actual browser/API run is `contracts-browser-retry.log`:11 passed. OpenAPI now has55 complete documentation contracts; universal runtime output validation is not claimed.

The Turbopack investigation found sandbox EPERM on every tested local bind. Host binds succeed; a cached failing Turbopack graph repeated EPERM without a TCP bind syscall. Moving only the generated `.next` tree aside made a host build bind127.0.0.1:0 and complete. The final current-tree default build is recorded separately in `turbopack-final-host.log`. Webpack remains the explicit group gate.

Downloaded official act v0.2.94 into `/tmp/devsync-act` and verified its release archive digest (`act-install.json`). Both workflow listings pass. The quality dry run and image-security dry run (which includes its quality dependency) crash in act's `containerReference.GetHealth`/`waitForServiceContainer` with a nil-pointer panic and exit2. Their output is retained. An initial run also failed at the sandbox cache write, and an initial dry run exited on the image-selection prompt; the retry uses explicit runner mapping and /tmp caches. The Railway dry run exits0 and validates its plan only: every success line is prefixed DRYRUN. No container execution, publish or deployment is claimed from these dry runs. Secret/env/variable files were explicitly `/dev/null`.

Every step not verified by actual workflow execution:

| Workflow / group | Unverified steps |
| --- | --- |
| main.yml quality | checkout; setup-node and npm cache; Actions service-container networking/health; hosted npm ci/lint/format/types/tests/OpenAPI/build execution; upload-artifact coverage; GitHub Clerk variable/secret injection. Equivalent local commands pass, but these Actions steps did not run. |
| main.yml image-security | checkout; setup-buildx; registry login; both Docker image builds/load and GHA cache; Trivy HIGH/CRITICAL gate; SARIF upload; CycloneDX SBOM generation; SBOM artifact upload/365-day retention; immutable image publication; SLSA attestation. None executed. The PR dry-run plan reaches the failing quality dependency. |
| deploy.yml | checkout; global Railway CLI install; backend deployment; frontend deployment. Only the dry-run plan passed. No deployment was executed. |
| Browser CI | The11 local Playwright/API cases pass, but the current workflow does not invoke the new isolated browser harness. No CI browser pass is claimed. |

No push, registry publication, deployment, key rotation or Phase2 work occurred. The failed local act engine does not establish that the repository workflow fails on GitHub; exact hosted execution remains unverified. Historical reports below are retained as historical limitations.

---

# Phase 1d local verification

Actual output is in phase1d-evidence/. Backend baseline passes all six commands with 186 tests; frontend passes all commands with the supported `next build --webpack` builder. Default `next build` failed locally at Turbopack port binding even on an approved retry. The exact default frontend CI build is therefore **not locally verified successful**. The final fixture gate uses webpack explicitly and records that command. OpenAPI drift passes, but complete schemas/E2E are still absent.

Both YAML workflow files parse locally (workflow-parse.json); `act` and `actionlint` are absent (ci-capabilities.json). Local quality runs do not execute Actions or reproduce its service topology.

Steps not verified through the workflow:

- Quality: actions/checkout, actions/setup-node and npm cache restoration; hosted PostgreSQL/Redis service creation/networking; exact default Turbopack build; coverage artifact upload. Install/lint/format/types/tests and backend build were run as local commands, not as Actions steps. CI Clerk variable/secret injection was not verified.
- Image security: checkout, setup-buildx, registry login, both Docker image builds and GHA cache, Trivy HIGH/CRITICAL scan, SARIF upload, CycloneDX SBOM generation, SBOM artifact upload/retention, immutable image publication and SLSA provenance attestation. None was run. Publishing was not authorized and was not attempted.
- Railway deploy: checkout, global Railway CLI installation, backend deployment and frontend deployment. None was run. Deployment is outside this session's authorized local work.
- Authenticated Playwright is not a workflow step and has not been verified locally. No browser result is inferred from Node/component/backend integration tests.

Historical Phase1c report follows.

---

# Phase1c local CI verification

The latest complete local command gate is phase1c-evidence/browser-fixture-results.json. Both apps pass clean install, lint, formatting, strict type checks, tests and build. Backend includes fixture-source lint/type checks and186 passing tests with existing coverage floors. Frontend retains5 Node and6 component tests. Local install uses npm ci --no-audit; a dependency audit/security-scan pass is not claimed.

Backend integration tests use actual disposable PostgreSQL/pgvector and Redis containers, including non-bypass RLS clients and independent real-time servers. This exercises the quality commands outside GitHub Actions; it does not verify the exact Actions service networking or hosted runner. OpenAPI drift is separately checked in final-openapi-check.log. The source AST scan finds zero explicit any annotations and zero suppression markers, including the test executable.

Both workflow YAML files parse locally. act and actionlint are not installed (ci-local-capabilities.json). The following remain unverified: GitHub-hosted action execution/caches/uploads; image builds, Trivy SARIF scans, SBOM/provenance; registry publication; Railway deployment. No publish/deploy step was run. Frontend Docker build-time Clerk configuration also needs an actual image-build check; a successful local frontend build with ignored development configuration does not prove that path works.

Authenticated Playwright product journeys are unfinished and are not currently a verified CI gate. Existing E2E tests were not deleted or weakened; their prior fixture-dependent skips are not represented as passes. The new backend login fixture is only the foundation for an isolated browser artifact. Full query/response OpenAPI contracts remain partial and explicitly marked incomplete.
