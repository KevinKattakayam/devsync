# Deployment and local startup — Phase 5b

These are configuration and operating instructions, not a claim that hosted CI, Vercel, Railway, real Clerk login or a production restore was executed here. Actual local results and unresolved release blockers are in [docs/deployment/RESULTS.md](docs/deployment/RESULTS.md). No act run or deployment is part of this session.

## One-command local stack

From a clean checkout with Docker Engine/Compose available:

```sh
docker compose up --build --detach --wait
```

Open http://localhost:3000. With no identity keys it shows setup guidance, not a fake signed-in workspace. PostgreSQL, Redis, API, frontend and the existing background worker start; one-shot helpers generate local credentials, apply migrations, seed a sample workspace and grant a separate runtime role. Database/Redis ports are not published; app ports bind loopback. Override FRONTEND_PORT/BACKEND_PORT if needed. `/healthz` is frontend liveness; backend `/api/health` is liveness. Backend `/api/ready` correctly remains503 until identity configuration exists. A healthy local container is not a real Clerk verification.

Administrative database credentials and API/worker credentials use different named volumes. The API/worker mount only runtime credentials; both check the database role and reject superuser/RLS-bypass roles. Redis uses persistent AOF and noeviction, matching shared request quotas. Preserve local volumes if retaining data; generated passwords/encryption keys persist there. `docker compose down` stops the stack without deleting volumes. Removing volumes destroys that local data and encryption material; it is not a production upgrade procedure.

For actual local sign-in, configure private root .env settings CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and three real, distinct SEED_OWNER_CLERK_ID/SEED_EDITOR_CLERK_ID/SEED_VIEWER_CLERK_ID values **before starting a fresh local project**. Configure Clerk's localhost origins and allowed sign-in methods. Run the same command with `--build`. Default seed IDs are deliberately not provider accounts. Changing identity IDs on a previously seeded project can conflict with its reserved sample emails; use a new Compose project name/volumes instead of silently relinking users. Existing data should be migrated deliberately. No fixture login endpoint is enabled by Compose. AI providers are not configured by the default stack.

Compose is a local setup, not an internet-facing production database template. Production uses private managed settings, separate identities, TLS and explicit migration operations below.

## Existing Vercel frontend

Use the existing project, with repository Root Directory **frontend**, Next.js framework, Node22, `npm ci`, and `npm run build -- --webpack`. frontend/vercel.json records these settings and disables independent Git auto-deployments so they cannot bypass Quality. Set settings in both Production and Preview environments, with separate Preview identity/backend resources.

| Variable                                                                  | Required value                                                                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| DEPLOYMENT_MODE                                                           | `production` for both hosted Production and Preview; `local` is only the local setup build                                    |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY                                         | Public key for the corresponding real Clerk instance; public build input                                                      |
| CLERK_SECRET_KEY                                                          | Matching private key; Vercel secret setting, never a NEXT_PUBLIC value or Docker build argument                               |
| NEXT_PUBLIC_API_URL                                                       | `https://<api-host>/api/v1`                                                                                                   |
| NEXT_PUBLIC_SOCKET_URL                                                    | `https://<api-host>`; direct backend origin                                                                                   |
| NEXT_PUBLIC_YJS_URL                                                       | `wss://<api-host>`; client appends `/yjs`                                                                                     |
| BACKEND_URL                                                               | `https://<api-host>`; server REST rewrite origin, without `/api`                                                              |
| FEATURE_DECISION_RECEIPTS / FEATURE_SNIPPET_SAFETY / FEATURE_ASYNC_DIGEST | Optional exact `true`/`false`, default off; match API/worker settings when enabling                                           |
| SUPERADMIN_SERVICE_TOKEN                                                  | Optional private server-side proxy credential only if using that verified administration path; same strong backend credential |

The public variables and rewrite destination are build inputs. Rebuild after changing them; runtime overrides do not rewrite an old browser bundle. Docker entrypoint checks mode/key consistency with its recorded build. Production configuration requires HTTPS/WSS and configured public settings; the local setup screen is not a substitute for these. Structural validation does not prove that provider keys or DNS work.

Configure Clerk production/preview origins, callback/sign-in/sign-up URLs and methods in the actual provider dashboard. Real sign-in must be verified with configured users after deployment; current fixture tests do not do this. Socket.io and Hocuspocus connect directly to the always-on backend, not through a Vercel serverless WebSocket proxy.

## Railway API and background worker

Create/use an always-on backend service that supports HTTP upgrades and long-lived connections, plus a worker service and private PostgreSQL16+pgvector/standalone Redis. No hosting price, free-tier availability or capacity guarantee is asserted. Use repository Root Directory **backend** for both services. Current project-level configuration is `.railway/railway.ts`, using locked Railway SDK3.16.0. Legacy examples are retained only under docs/deployment/legacy, outside auto-discovery. Disable independent Railway Git auto-deploys; use the reviewed, gated workflow. The worker's PROCESS_ROLE is `worker`, API's is `api`.

Railway's current documentation deprecates per-service railway.json/toml and says legacy files stop being read on December1,2026. Before rollout, link the existing project, import its settings with `railway config pull` (without `--include-variables`), merge the checked-in service intent, and review a redacted `railway config plan`. If it is still legacy-managed, preview `railway config migrate`, then deliberately migrate/clear old Config File settings in the account; do not overwrite the existing project blindly. The named partial manages only application services, and `preserve()` retains configured secrets. Keep all additional existing variables/source settings during import. Apply only the reviewed account plan manually; no plan/apply was executed here. [Current IaC/migration guide](https://docs.railway.com/infrastructure-as-code).

The API image defaults to its non-root entrypoint and `node dist/server.js`. The worker runs the same image with the configured worker start command, preserving startup validation. API pre-deploy runs **migrate status**, not privileged DDL: apply migrations privately first. API readiness path is `/api/ready`; worker health is process liveness, not a promise of queue freshness. Monitor actual queue/outbox progress separately. Keep the services awake and configure graceful termination; Docker forwards signals and the application drains its existing collaboration/queue resources.

| Backend/worker variable                                                                                                                                        | Required value / behavior                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| NODE_ENV                                                                                                                                                       | `production` (image default)                                                                                                   |
| DEPLOYMENT_MODE                                                                                                                                                | `production` (image default); never use local mode for hosted deployment                                                       |
| PROCESS_ROLE                                                                                                                                                   | API `api`; worker `worker`                                                                                                     |
| PORT                                                                                                                                                           | Host-provided listening port for API; default5000                                                                              |
| DATABASE_URL                                                                                                                                                   | Private runtime-role PostgreSQL URL, with provider TLS settings; never migration/admin credentials                             |
| REDIS_URL                                                                                                                                                      | Private standalone Redis URL (`redis://` on trusted private network or `rediss://` for TLS); shared by every API/worker        |
| FRONTEND_URL                                                                                                                                                   | Exact HTTPS frontend origin, without a path/query; Preview backend uses the stable preview alias origin                        |
| CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY                                                                                                                       | Matching actual instance keys; public key field is named CLERK_PUBLISHABLE_KEY on backend                                      |
| ENCRYPTION_KEY                                                                                                                                                 | Stable privately generated64-hex-character key; preserve it separately with backups; do not generate a new key on every deploy |
| GROQ_API_KEY / OPENAI_API_KEY                                                                                                                                  | Optional private provider keys; missing keys degrade AI without granting extra authority                                       |
| GROQ_MODEL / OPENAI_MODEL / EMBEDDING_MODEL                                                                                                                    | Optional model overrides supported by the existing adapters; provider provisioning/spend limits are human configuration        |
| AI_QUOTA_USER_DAILY / AI_QUOTA_USER_MONTHLY / AI_QUOTA_WORKSPACE_DAILY / AI_QUOTA_WORKSPACE_MONTHLY / AI_QUOTA_USER_CONCURRENT / AI_QUOTA_WORKSPACE_CONCURRENT | Optional positive integer overrides; identical across API/workers. Defaults and exact operation units: AI_COST_SAFETY.md       |
| FEATURE_DECISION_RECEIPTS / FEATURE_SNIPPET_SAFETY / FEATURE_ASYNC_DIGEST                                                                                      | Optional flags; match frontend and indexing workers. Apply migrations before enabling                                          |
| RUN_EMBEDDING_WORKER_IN_API                                                                                                                                    | Leave false/unset when the dedicated worker is running                                                                         |
| SUPERADMIN_SERVICE_TOKEN                                                                                                                                       | Optional strong private service credential; do not configure a weak sample token                                               |
| OTEL_SDK_DISABLED / OTEL_EXPORTER_OTLP_ENDPOINT / SENTRY_DSN / METRICS_BEARER_TOKEN / LOG_LEVEL                                                                | Optional existing telemetry/reporting/metrics settings; configure private endpoints/tokens deliberately, never content logging |

See backend/.env.example for other optional Cloudinary/extraction/webhook settings. Do not configure obsolete JWT_ACCESS_SECRET/JWT_REFRESH_SECRET: authentication remains Clerk. Do not seed production or give the API migration credentials. Empty/malformed service URLs, invalid encryption-key format, missing production identity fields and unsafe runtime database roles prevent container startup; errors name fields without printing values.

## Database creation, migration and grants

Use the managed provider/admin connection privately to enable pgvector and provision a dedicated migration/object-owner role and a separate `devsync_runtime` login with NOSUPERUSER, NOBYPASSRLS, NOCREATEDB and NOCREATEROLE. Set its password privately, for example with psql's interactive `\password`; do not paste credentials into repository files or shell command examples. The runtime role must not own application tables or inherit a privileged role.

With a private migration connection already loaded into DATABASE_URL by your secret manager, from the reviewed checkout:

```sh
cd backend
npm ci
npm run db:migrate
```

Do not use db push. For existing databases follow [the verified baseline/adoption procedure](backend/prisma/README.md) first. Run [grant-runtime.sql](backend/docker/grant-runtime.sql) as the migration/object-owner role after migrating; it grants runtime table/sequence access and future default privileges while retaining database RLS. Example using a privately configured PostgreSQL service file:

```sh
psql 'service=devsync_migration' -v ON_ERROR_STOP=1 -f backend/docker/grant-runtime.sql
```

The psql example runs from repository root. Update grants deliberately if the provider uses a different runtime role name. Then give Railway only the runtime DATABASE_URL. A shared service-wide MIGRATION_DATABASE_URL would expose administrative capability to the API process; it is intentionally not used. Railway's migrate-status precheck rejects pending migrations. Seed is explicitly non-production and is not part of production rollout.

## GitHub Actions and deployment gates

main.yml defines Quality: cached installs, lint, format, strict types, tests/coverage, contract check, builds, High/Critical dependency/container gates, redacted Gitleaks history scan, Semgrep, fixture E2E/visual matrix and clean-clone Compose. Official actions are pinned to verified commits; scanner images to digests. No act. Hosted job results remain unverified until you push. Known Phase5a visual/scanner findings can and should block the workflow; no ignore or baseline refresh is introduced to force deployment.

Coverage checks compare every statements/branches/functions/lines percentage with the successful Quality artifact for the base commit. Missing artifacts fail closed after adoption. The first adoption only uses the checked-in measured Phase5a baseline; baseline data/algorithm are reviewed code and locally tested. An improvement becomes the next base artifact, so later drops above the old floor still fail. Configure artifact retention for your branch cadence and protect required Quality checks; missing retained base artifacts require an explicit recovery/re-run, not silently skipping the gate.

Set repository Actions **variables** NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SOCKET_URL, NEXT_PUBLIC_YJS_URL and BACKEND_URL for production-image builds (public values). Set environment-scoped **secrets** VERCEL_TOKEN, VERCEL_ORG_ID and VERCEL_PROJECT_ID for the existing Vercel project. Production additionally needs a Railway project/environment token RAILWAY_TOKEN and variables RAILWAY_PROJECT_ID, RAILWAY_ENVIRONMENT_ID, RAILWAY_SERVICE_ID, RAILWAY_WORKER_SERVICE_ID and BACKEND_URL. Optional RAILWAY_API_SERVICE_NAME/RAILWAY_WORKER_SERVICE_NAME must match existing display names (defaults backend/worker). Preview needs PREVIEW_DOMAIN, an owned stable alias whose isolated backend allows that exact FRONTEND_URL origin. Configure the corresponding Vercel Preview env values and a separate staging backend/Clerk instance; never point untrusted preview workspaces at production data.

Protect GitHub environments `preview` and `production` with appropriate reviewers and branch restrictions, and require successful Quality checks before merging. This repository cannot establish those hosted permissions for you. Deployment workflows are manual workflow_dispatch, taking a full reviewed commit SHA. A default-branch verifier requires a successful complete Quality workflow for that SHA before privileged build/deploy jobs run. Review source before dispatching; deployment builds execute that reviewed source with hosting credentials. Fork PRs do not automatically receive deployment secrets. Disable platform auto-deploys that would bypass these gates.

preview.yml pulls the existing project's Preview settings, builds/deploys with pinned Vercel CLI65.9.0 and assigns PREVIEW_DOMAIN. deploy.yml replaces the old ungated Railway push workflow: after manual review and Quality success, pinned Railway CLI5.71.0 first requires a read-only IaC plan with no drift, then uploads the checked-out source to both configured services, checks API readiness, then builds/deploys the existing Vercel production project. Apply migrations/grants before dispatch. No actual preview or production deployment was made here. CI preserves CycloneDX SBOMs and provenance, publishing the scanned image by digest only after all gates on main pushes. Railway currently rebuilds the reviewed source, so it is not a claim of exact promotion of that scanned digest; strict digest promotion needs corresponding host image-source configuration.

## Backup, restore and rollback

Before production adoption, configure provider backups/PITR, retention, access control, encryption and independent restore drills. Choose RPO/RTO from actual requirements; none were measured or promised here. Back up PostgreSQL data/schema/policies, the required encryption key separately, deployment settings privately and relevant Redis AOF/queue/quota state. Losing Redis resets allowances; ambiguous remote AI billing is not reconciled automatically. A database-only backup is not a complete application recovery plan.

Use a private PostgreSQL service definition/backup identity authorized to read **all tenants** despite forced RLS; an ordinary runtime role cannot provide a complete dump. Keep dumps and role/password metadata out of the repository/logs. For example:

```sh
pg_dump --dbname='service=devsync_backup' --format=custom --file=/secure-backups/devsync.dump
pg_restore --list /secure-backups/devsync.dump
```

Listing a dump is not a restore test. Restore into a **fresh isolated database**, with compatible PostgreSQL/pgvector and a prepared migration/object-owner role. Never overwrite the active database as a casual verification step:

```sh
pg_restore --dbname='service=devsync_restore' --exit-on-error --no-owner --no-acl /secure-backups/devsync.dump
```

Restore ownership/grants/RLS as the intended migration/runtime roles, then verify schema migration status, source counts, canonical CRDT/journal consistency, role/membership/cross-tenant denial, background work reconciliation and actual authorized sign-in against the isolated restored system. Preserve repository encryption keys. Reconcile membership revocations, suspensions and invitation/session state since the restore point before allowing writes: an old database snapshot can resurrect old grants. Redis jobs and external providers can replay/repeat work; no exactly-once billing or queue recovery promise is made.

For cutover, drain API/WebSockets/workers, retain a consistent recovery point, switch connections under operator control, recheck authority/health and resume only after recovery checks. Keep providers/AI paused if cost counters cannot be restored/reconciled safely. Roll back application source/images only against a schema-compatible version; forward-only migrations are retained. Feature flags can disable their additive UI/API scope. Do not automatically down-migrate, delete volumes, erase user updates or restore stale membership state to make a rollout appear healthy. Production backup/restore and provider recovery were not executed in this session.

A dump contains one database, not all cluster roles; retain required role/ownership configuration separately in protected operations storage. Restore only trusted backups, since source-controlled SQL can execute during restore. No dump/restore drill was run here.

Primary references: [Compose startup ordering](https://docs.docker.com/compose/how-tos/startup-order/), [Vercel Git deployment configuration](https://vercel.com/docs/project-configuration/git-configuration), [Vercel Actions deployment](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel), [Railway configuration](https://docs.railway.com/config-as-code/reference), [PostgreSQL dump](https://www.postgresql.org/docs/16/app-pgdump.html), [PostgreSQL restore](https://www.postgresql.org/docs/16/app-pgrestore.html). Provider-specific settings and hosted entitlements must be confirmed in the actual account.

## Phase 5a-3 runtime risk conditions

Application images pin Node22/Debian13 by digest and omit unused mount/umount/nsenter/infocmp executables. Compose API/worker/frontend run as UID1000 with all capabilities dropped and no-new-privileges. Production must enforce equivalent controls and avoid privileged operators/user-controlled native SQL or ACL execution; Docker USER alone is not that guarantee. The remaining44 High entries per image are accepted under the conditions listed in [the vulnerability inventory](docs/quality/phase5a-3/VULNERABILITIES.md). Critical count is0 in these local scans, not an all-clear or actual host assessment. No scanner ignores or CI gate exceptions were introduced.
