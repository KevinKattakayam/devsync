# Frontend CI image boundary

Without a hosted backend, Quality must not manufacture a production configuration. The `frontend/Dockerfile` `ci-build` stage compiles the existing local setup screen in production Node mode with no Clerk credentials or explicit API/socket/Yjs endpoints. `.dockerignore` excludes local environment files. It does not validate hosted authentication, connectivity or production readiness.

`ci-runner` uses the same pinned Node base and hardened non-root runtime dependency tree, labels its purpose `ci-scan-only-not-deployable`, and always refuses startup. It has no production entrypoint or build-settings file. The production `runner` remains the default/final Docker target with its existing strict configuration and runtime checks. A caller who deliberately overrides the image entrypoint can execute arbitrary Node code; the refusal is a safeguard, not a container security boundary against a malicious operator.

Quality tags the frontend image `devsync-frontend-ci-scan-only:ci`, retains mandatory High/Critical Trivy scanning and CycloneDX SBOM generation, and excludes this target from GHCR publishing and release provenance. API/extractor production publishing and provenance conditions are preserved. The scan-only image must never be used as a release artifact. A future frontend release must independently build the production runner with approved genuine settings and pass its scans, SBOM and provenance requirements; this checkpoint provides no production-image parity claim.

Local verification commands (no publishing):

```bash
docker build --target ci-runner -t devsync-frontend:ci-scan-only frontend
docker run --rm --network none devsync-frontend:ci-scan-only
# Expected: fixed refusal message and exit 1.
docker build --target runner frontend
# With no build arguments: expected rejection of missing production settings.
cd frontend
node tests/ci-image.test.mjs
npx vitest run tests/deployment.test.tsx
```

The CI-image regressions exercise the actual Next configuration for missing required values and HTTPS/WSS rejection, scan-only startup refusal, independent build stages and publishing exclusions. Test URLs use reserved `.invalid` names only inside configuration tests; no invented hosted endpoints are supplied to the image build.

The staging-safety subprocess failure was reproduced in Codex: `spawnSync` returned `EPERM`, status 1 and empty stderr before the child ran. Both unchanged staging-safety assertions passed in the permitted subprocess context. No safety test or promotion gate was weakened.

## Observed local results

- CI Docker build: exit 0, local image `sha256:fcde5f0dd7d02084963aed6638c1656e478f5b8c97a496d989cbecdd645d099b`.
- Startup with networking disabled and a production-mode override: refusal, exit 1 as required. Production runner build with no settings: missing Clerk publishable key, nonzero exit as required.
- Actual production configuration rejection/startup/workflow regressions: 4/4; existing deployment component regressions: 2/2; unchanged staging safety assertions: 2/2 in permitted context.
- Frontend lint, strict types, targeted formatting, workflow YAML parse, script syntax and diff checks: exit 0. The full frontend suite passed 39 files / 195 component tests and five Node test files. An earlier run during concurrent Docker compilation had one unchanged dashboard test time out; focused rerun passed 10/10 and the subsequent full run passed without test changes.
- Pinned workflow Trivy 0.68.2 archive vulnerability scan: exit 0, zero High/Critical findings. CycloneDX generation: exit 0. Reports remain under `/tmp/devsync-ci-image-security/` and are not committed. The initial socket-mount scanner invocation was rejected by automatic approval review; the safer successful scan used a read-only image archive with no Docker socket. An initial archive attempt failed on UID-based file access; retry as the archive owner succeeded without changing file permissions.
- Scanner warned Alpine 3.24 was absent from its EOL list. This is an identified scanner support limitation, not an assertion that the OS has no vulnerabilities. npm install reported eight moderate advisories; no package upgrades, audit suppression or threshold changes were made in this increment.

These results validate the local scan-only path. GitHub CI execution remains pending; no repository variables, provider resources, production configuration or hosted services were changed. Nothing was published or deployed.
