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
