# Contributing

Use `upgrade/enterprise` for this upgrade. Follow [AGENTS.md](AGENTS.md), inspect [PROGRESS.md](docs/PROGRESS.md) and the [final report](docs/FINAL_REPORT.md), and check for deeper directory instructions. frontend/AGENTS.md requires relevant installed Next.js documentation before frontend implementation. Earlier security, tenant, collaboration and data-layer guarantees must be preserved.

Work in small reviewable commits. Never push or deploy without the task's authorization. Do not change application/API/WebSocket behavior in a documentation-only session. Version incompatible contracts; preserve legacy clients and independently enforce server authority. Never delete/weaken a test, add any/@ts-ignore/lint suppressions, remove a failure by relaxing a threshold, or refresh a baseline without a written intentional-change review. Avoid secrets in source, commands, examples, logs and browser artifacts.

## Environment

Both package manifests support Node `^22.12.0 || ^24.0.0 || >=26.0.0`; recorded checks and containers use22. Use npm lockfiles and `npm ci`. Docker is needed for real PostgreSQL/Redis integration tests. Install dependencies without copying private production environment files:

```sh
npm --prefix backend ci
npm --prefix frontend ci
```

For local services and real Clerk configuration, use [RUNBOOK.md](docs/RUNBOOK.md). Compose seed IDs are not provider accounts. The separate test harness creates its own migrated disposable database, non-bypass runtime role, Redis, seeded identities and generated frontend adapter. It refuses production mode and must never be shipped as normal authentication.

## Required gates

From repository root, after each logical implementation group:

```sh
npm --prefix backend run lint
npm --prefix backend run format:check
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run build
npm --prefix frontend run lint
npm --prefix frontend run format:check
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build -- --webpack
```

Run resource-heavy test/build/browser steps sequentially on constrained machines: shared-host load previously caused an unrelaxed policy-deadline failure. Keep failed output and the actual retry scope; do not mislabel an interrupted run green. Backend tests include real database/RLS/realtime regressions; frontend tests include a separate Node runner and Vitest component tests. Their coverage scopes differ.

Contract changes also require `npm --prefix backend run openapi:check` and an intentional artifact update when needed. Compare [API.md](docs/API.md) and the authorization matrix; client UI guards are not permission tests.

## Seeded browser suites

Install a compatible Playwright Chromium using the backend toolchain, or set E2E_CHROMIUM_PATH privately to an existing executable. Recorded Phase5a-3 used `/opt/google/chrome/chrome`; that path is machine-specific. From repository root:

```sh
node tools/ci/browser.mjs shell
```

The same helper accepts `core`, `ai-cost`, `editor`, `kanban`, `settings`, `dashboard`, `decisions`, `snippet-safety` and `async-digest`. These are selectable suites, not a claim they all passed in one current run. The latest recorded shell run has7 passes; native pointer drag in the broader core journey remains open. See [fixture instructions](backend/testing/README.md) and [quality evidence](docs/quality/phase5a-3/README.md). Do not use real Clerk sign-in for fixture screenshots unless the task specifically requires provider verification.

Keep screenshot/axe output under the task's evidence directory, retain raw incomplete/failed results, and never record test capabilities, tokens or private user content. Baseline updates require viewing expected/actual/diff, establishing the intended design change and documenting each reason; comparison tolerances and independent keyboard/server assertions remain required.

## Review and handoff

Document what changed, why, relevant migrations/feature flags, actual commands/results, risks and exact deferrals. Update CHANGELOG.md and docs/PROGRESS.md; feature docs must describe limits and privacy/authority, not invented novelty or capability. Use forward-only migrations and a rollback note, not casual destructive reversals. No paid provider, cloud deployment, legal compliance, performance or capacity result may be inferred from unit tests or configuration.

There is no tracked LICENSE grant. Maintainers must choose licensing and confirm contribution terms before accepting/distributing work; this file does not invent a DCO, CLA or ownership policy.
