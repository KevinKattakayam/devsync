# DevSync — developer workspace

DevSync combines collaborative documents, task boards and stored code snippets. Clerk supplies authentication; current server policies enforce workspace membership and roles. This branch has known open findings and incomplete quality evidence. Read [PROGRESS.md](docs/PROGRESS.md) and the [quality report](docs/quality/README.md) before deployment.

## Supported scope

| Module            | Implemented behavior and limits                                                                                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documents         | TipTap editor, Yjs/Hocuspocus collaboration, durable update journal, nested documents, server-enforced viewer read-only access. Local CRDT persistence is not a complete offline/PWA product.                                                                                                                                               |
| Tasks             | Workspace-bound task boards, assignments, priorities and a keyboard move control. The broad pointer-drag browser journey currently has an unresolved failure; see the quality report.                                                                                                                                                       |
| Snippets          | Store, search and copy source text. Do not infer execution support or fifty-language highlighting: host execution is disabled.                                                                                                                                                                                                              |
| AI                | Optional configured Groq completion with configured OpenAI fallback, bounded streaming and atomic request allowances. Models are environment-configured. References are retrieved candidates, not verified claim support; allowance counts are not token/currency billing. Content sent for AI can be processed by the configured provider. |
| Members           | Owner/editor/viewer roles and explicit invitation acceptance. Provider accounts and verified identity configuration are still required for real Clerk sign-in.                                                                                                                                                                              |
| Decision receipts | Optional manual source-bound decisions; `FEATURE_DECISION_RECEIPTS`, default off. See [design and limits](docs/features/decision-receipts.md).                                                                                                                                                                                              |
| Snippet safety    | Optional heuristic redaction before confirmed save; `FEATURE_SNIPPET_SAFETY`, default off. It cannot guarantee secret-free content. See [design and limits](docs/features/snippet-safety-preflight.md).                                                                                                                                     |
| Async digest      | Optional evidence-only in-app digest of eligible recorded creation events; `FEATURE_ASYNC_DIGEST`, default off. No model or scheduled messaging. See [design and limits](docs/features/async-digest.md).                                                                                                                                    |

Billing plan/invoice controls, complete offline support, broad import/export, i18n and several advanced editor/board features remain incomplete. No end-to-end document encryption, unlimited scale, support SLA or production readiness is claimed. The API/database can read workspace content. Repository-secret encryption at rest is a separate control.

## Local setup

Use a supported Node version from both package manifests; the quality checks use Node22. Install Docker for the disposable PostgreSQL/Redis integration tests. Runtime PostgreSQL must include pgvector; Redis is required for shared admission and collaboration. Groq/OpenAI keys are optional; without them AI is unavailable while ordinary workspace work remains available.

From your existing checkout:

```sh
cd backend
npm ci
cp .env.example .env
cd ../frontend
npm ci
cp .env.example .env.local
```

Fill private environment values without committing them. Configure Clerk for the frontend/backend, the actual application origins, a migration database identity and a separate non-bypass runtime identity. Follow [DEPLOYMENT.md](DEPLOYMENT.md) and [the database guide](backend/prisma/README.md) for pgvector, migration adoption and least-privilege setup. Use `npm run db:migrate` in backend with the migration identity; do not replace migrations with `db push`.

Run `npm run dev` in backend and frontend in separate terminals. Default local ports are5000 and3000. Real sign-in requires your own Clerk accounts and configured methods. Seed records and test fixture login do not provision working Clerk accounts. The isolated browser harness is development/test-only; see [testing instructions](backend/testing/README.md).

## Quality and operations

Both applications expose `lint`, `format:check`, `typecheck`, `test` and `build` scripts. Backend integration tests need Docker. [docs/quality](docs/quality/README.md) records actual outputs, coverage scope, scanner findings and measurements that were not performed. A passing unit suite is not a deployment approval or a capacity benchmark. AI deployment/rollback constraints are in [AI_COST_SAFETY.md](docs/AI_COST_SAFETY.md).

See [SECURITY.md](SECURITY.md) for private disclosure guidance. No software license grant has been established in a tracked LICENSE file; the earlier unsupported MIT claim has been removed. Maintainer confirmation is required before publishing a license.
