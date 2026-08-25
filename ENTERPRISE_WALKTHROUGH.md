# DevSync Enterprise Architecture Walkthrough

## Identity and authorization

Clerk is the identity authority. Enable Google and GitHub social connections in the Clerk dashboard, then enable SAML connections for enterprise tenants. The frontend uses Clerk's App Router provider and Proxy route protection; Express validates Clerk session tokens before resolving the matching local `User` record. DevSync retains `WorkspaceMember` as the authorization source of truth, so roles remain `OWNER`, `EDITOR`, and `VIEWER` even when users authenticate through SSO.

After a successful first login, `POST /api/auth/sync` provisions the local user. Existing local users must be mapped to their Clerk IDs before deploying the migration because password and refresh-token columns are deliberately removed.

### Existing databases

This repository historically used `prisma db push` and has no initial Prisma migration. Before production rollout, create a baseline migration from the **pre-enterprise** schema, mark that baseline as applied on the already-running database with `prisma migrate resolve --applied <baseline-name>`, then run `prisma migrate deploy` to apply `20260729180000_enterprise_platform`. Do not run the baseline DDL against an existing database. Fresh environments apply the baseline and enterprise migrations in sequence.

## Collaboration

Each document has a Yjs document addressed at `ws://<api-host>/yjs/<documentId>`. The upgrade handler verifies the Clerk session and checks workspace membership before completing the websocket handshake. Yjs updates and awareness/cursor state are broadcast through the standard y-websocket protocol, while compact Yjs state snapshots persist to `Document.yjsState`. TipTap uses collaboration and collaboration-cursor extensions; legacy Socket.io document events are gone.

## Workspace RAG

The migration enables `pgvector` and adds 1536-dimensional embeddings to documents, snippets, and tasks. Save handlers queue a background embedding refresh only when a content hash changes. AI completion first confirms workspace membership, performs cosine retrieval only within that workspace, and supplies the resulting context to Groq alongside the request.

Embedding jobs are persisted in `EmbeddingJob`, retried with exponential backoff, and drained by the API process. Production deployments should expose job failures through centralized logs/alerts.

`OPENAI_API_KEY` and `EMBEDDING_MODEL` configure embeddings; `GROQ_API_KEY` configures completion. Use an embedding model whose dimension matches the migration (1536), or update both migration and Prisma schema together.

## Unified workspace search

`GET /api/workspaces/:id/search?q=<query>` is membership-protected. It prefers vector search when embeddings are available and falls back to case-insensitive keyword matching across documents, snippets, and tasks when they are not. This makes search available during initial indexing and provider outages.

## GitHub PR automation

`POST /api/webhooks/github` validates `X-Hub-Signature-256` with the connected repository's stored secret, rejects duplicate delivery IDs, and reacts to `pull_request` events. A PR title/body containing `Fixes DEV-123`, `Closes DEV-123`, or `Resolves DEV-123` moves matching `Task.taskKey` records to the repository-configured opened/merged columns.

To test locally:

1. Start PostgreSQL with `docker compose up db` (the pgvector image uses host port `5433` by default) and apply `npm --prefix backend run db:migrate`.
2. Set the Clerk, Groq, OpenAI, and frontend variables from the two `.env.example` files.
3. Configure a repository record with its GitHub repository ID, webhook secret, and transition column IDs.
4. Start the API and expose it with a tunnel such as `ngrok http 5000`.
5. In the GitHub repository webhook settings, set the payload URL to `https://<tunnel>/api/webhooks/github`, use the same secret, select Pull requests, and use Redeliver to exercise a signed event.

## Required environment variables

- Backend: `DATABASE_URL`, `CLERK_SECRET_KEY`, `FRONTEND_URL`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `EMBEDDING_MODEL`.
- Frontend: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_YJS_URL`.
- Clerk dashboard: Google/GitHub OAuth credentials and per-tenant SAML connections.

Run `npm run worker` in a dedicated process for durable embedding processing. Set `ENCRYPTION_KEY` to a stable 32-byte hexadecimal key before connecting any GitHub repository; rotating this key requires a planned secret re-encryption migration. Use `/api/health` for liveness and `/api/ready` for database/configuration readiness.
