# Phase 5b actual results

On upgrade/enterprise; local commits only, no push, act or deployment. Phase5a evidence was finalized separately as0120530; its open scan/visual findings are retained rather than relabeled passing.

## App/configuration gates

Both apps pass lint, Prettier format, strict types, tests and production builds. Backend:28 suites/259 tests. Frontend:17 files/74 component tests plus the separate Node runner. Actual gate commands, exit statuses, outputs and coverage are under evidence/. Tests cover deployment validation, no private child content in unconfigured setup, protected-route redirects, real-provider boundary preservation and independent frontend liveness. No tests or assertions removed, thresholds relaxed or fixture authentication added to production.

Coverage comparison against the measured Phase5a baseline passes all four metrics. Current backend statements80.87%,branches71.34%,functions74.69%,lines83.11%; frontend40.88%,38.37%,39.38%,41.33%. The comparison algorithm's synthetic drop/missing-data unit test passes. This is not a hosted coverage-artifact retrieval result. The CI baseline/artifact mechanism still needs hosted execution after push.

Static actionlint1.7.7 validation exits0 without diagnostics on the workflow set. It is not a GitHub job run. Official action references were resolved from their public GitHub tag metadata and pinned; exact SHAs are retained in action-pins.json. Deployment CLI versions were read from public registry metadata: Vercel65.9.0, Railway5.71.0. No CLI deployment was run. Docker/Compose configuration validation passes; installed Compose is5.6.1.

## Clean clone, migrations and seeds

First attempt at deeae09: clean clone had no copied dependency trees/private env files, but Docker build failed because frontend fixture imports were excluded from the build context. Fixed by retaining build-stage testing source while keeping the runtime image restricted to standalone output; no test deleted or suppressed. Failed raw output is in clean-clone-first/.

Retry at d75e5b9 passed in99.304 seconds including builds/startup, using existing Docker cache. This is a clean Git checkout, not a cold Docker-cache benchmark. API/frontend UID1000, liveness200, one seeded sample workspace, protected identity401 without Clerk, readiness503 without Clerk, runtime rolsuper=false/rolbypassrls=false and no administrative credential mount in the API. No actual Clerk sign-in, logged-in sample workspace journey or provider operation is claimed.

The final Compose source adds the existing worker with process liveness. A final clean-clone verification of that complete service graph is pending the configuration commit; its result will be recorded here. Each verification uses random project/volume names, loopback host ports3405/5405 and no private environment copying. Only its own temporary stack/volumes are removed. Local UI without keys is setup guidance by the user's explicit choice.

## Hosted work and release blockers

Quality, coverage artifact comparison, source/container scans, SBOM/provenance/image publication, fixture E2E/visual jobs and manual reviewed preview/production workflows are authored, not claimed hosted-green. Known Phase5a pointer/visual failures and Gitleaks match triage can block Quality. High/Critical container/dependency gates are not bypassed. The new source images have not been given invented CVE counts. No baseline refresh, gitleaks allowlist or weakened security check is used to force release.

Human configuration required: Vercel/Railway project/service IDs and private tokens; public build variables; protected GitHub environments/required checks; independent platform auto-deploys disabled; separate staging backend/Clerk settings and owned preview alias; production runtime/migration roles, pgvector, shared AOF/noeviction standalone Redis, TLS/origins and real sign-in verification. API migration-status precheck does not replace the separate privileged migration/grant step. Runtime services intentionally do not receive migration credentials.

Production DNS/provider validation, live preview/production deployment, actual backup/restore/PITR/drain/cutover drills and strict promotion of the exact scanned image digest are not executed here. Railway currently rebuilds reviewed source; CI image publication/SBOM/attestation is preserved but does not prove Railway runs that same digest. Backup notes are instructions with no invented RPO/RTO or restoration claim. See DEPLOYMENT.md for exact variables and steps. Earlier product/PWA and Phase5a measurement deferrals remain open; no Phase5c started.
