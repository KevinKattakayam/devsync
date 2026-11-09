import { knowledgeSearchRouter } from './routes/knowledge-search.routes';
import { createAutomationRouter } from './routes/automation.routes';
import { githubInstallationRouter } from './routes/github-installation.routes';
import express from 'express';
import {
  createAccountLifecycleRouter,
  createWorkspaceLifecycleRouter,
} from './routes/lifecycle.routes';
import { clerkMiddleware } from '@clerk/express';
import cors from 'cors';
import helmet from 'helmet';
import { generalLimiter } from './middleware/rate-limit.middleware';
import { traceContext } from './middleware/tracing.middleware';

import authRoutes from './routes/auth.routes';
import workspaceRoutes from './routes/workspace.routes';
import documentRoutes from './routes/document.routes';
import taskRoutes from './routes/task.routes';
import snippetRoutes from './routes/snippet.routes';
import { aiUsage } from './middleware/ai-quota.middleware';
import { authMiddleware } from './middleware/auth.middleware';
import aiRoutes from './routes/ai.routes';
import aiV3Routes from './routes/ai-v3.routes';
import asyncDigestRoutes from './routes/async-digest.routes';
import snippetSafetyRoutes from './routes/snippet-safety.routes';
import decisionReceiptRoutes from './routes/decision-receipts.routes';
import { githubExecutionRouter } from './routes/github-execution.routes';
import githubWebhookRoutes from './routes/github-webhook.routes';
import ingestionRoutes from './routes/ingestion.routes';
import scimRoutes from './routes/scim.routes';
import stripeWebhookRoutes from './routes/stripe.webhook';
import superadminRoutes from './routes/superadmin.routes';

import { requestContext, requestLogging } from './middleware/request-context.middleware';
import { errorEnvelope, errorMiddleware } from './middleware/error.middleware';
import { measureHttp, metricsEndpoint } from './observability/metrics';
import healthRoutes from './routes/health.routes';
import { ApiMount, generateOpenApi } from './openapi';

const app = express();

// Correlation and error envelopes precede parsing, so malformed requests are traceable.
app.use(requestContext, errorEnvelope, requestLogging, measureHttp, traceContext);
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use('/api/v1', healthRoutes);
app.use('/api', healthRoutes);
app.get('/metrics', metricsEndpoint);
app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buffer) => {
      (req as express.Request).rawBody = buffer;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test' && process.env.CLERK_SECRET_KEY) app.use(clerkMiddleware());
app.use(generalLimiter);

/** One router implementation for both contracts; no copied authorization handlers. */
const mounts: ApiMount[] = [{ prefix: '/api/v1', router: healthRoutes, security: [] }];
function mountApi(path: string, router: express.Router, security?: ApiMount['security']) {
  mounts.push({ prefix: `/api/v1${path}`, router, security });
  app.use(`/api/v1${path}`, router);
  app.use(
    `/api${path}`,
    (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      res.setHeader('Deprecation', `@${Date.parse('2026-11-01T00:00:00Z') / 1000}`);
      next();
    },
    router,
  );
}
mountApi('/auth', authRoutes);
mountApi('/workspaces', workspaceRoutes);
mountApi('/documents', documentRoutes);
mountApi('/tasks', taskRoutes);
mountApi('/snippets', snippetRoutes);
app.use('/api/v2/workspaces/:workspaceId/snippet-safety', snippetSafetyRoutes);
mounts.push({
  prefix: '/api/v2/workspaces/:workspaceId/snippet-safety',
  router: snippetSafetyRoutes,
});
mountApi('/ai', aiRoutes);
app.use('/api/v3/ai', aiV3Routes);
mounts.push({ prefix: '/api/v3/ai', router: aiV3Routes });
app.use('/api/v2/workspaces/:workspaceId/digest', asyncDigestRoutes);
mounts.push({ prefix: '/api/v2/workspaces/:workspaceId/digest', router: asyncDigestRoutes });
app.use('/api/v2/workspaces/:workspaceId/decisions', decisionReceiptRoutes);
mounts.push({ prefix: '/api/v2/workspaces/:workspaceId/decisions', router: decisionReceiptRoutes });
const accountLifecycle = createAccountLifecycleRouter(),
  workspaceLifecycle = createWorkspaceLifecycleRouter();
const automation = createAutomationRouter();
app.use('/api/v2/workspaces/:workspaceId/automation', automation);
mounts.push({ prefix: '/api/v2/workspaces/:workspaceId/automation', router: automation });
app.use(
  '/api/v2/workspaces/:workspaceId/github-repositories/:repositoryId/execution',
  githubExecutionRouter,
);
mounts.push({
  prefix: '/api/v2/workspaces/:workspaceId/github-repositories/:repositoryId/execution',
  router: githubExecutionRouter,
});
app.use('/api/v2/workspaces/:workspaceId/search', knowledgeSearchRouter);
mounts.push({ prefix: '/api/v2/workspaces/:workspaceId/search', router: knowledgeSearchRouter });
app.use('/api/v2/account', accountLifecycle);
mounts.push({ prefix: '/api/v2/account', router: accountLifecycle });
app.use('/api/v2/workspaces/:workspaceId/lifecycle', workspaceLifecycle);
mounts.push({ prefix: '/api/v2/workspaces/:workspaceId/lifecycle', router: workspaceLifecycle });
app.get('/api/v2/ai/usage', authMiddleware, aiUsage);
app.use('/api/v2/webhooks/github-installation', githubInstallationRouter);
mounts.push({
  prefix: '/api/v2/webhooks/github-installation',
  router: githubInstallationRouter,
  security: [{ GithubSignature: [] }],
});
mountApi('/webhooks/github', githubWebhookRoutes, [{ GithubSignature: [] }]);
mountApi('/webhooks/stripe', stripeWebhookRoutes, [{ StripeSignature: [] }]);
mountApi('/superadmin', superadminRoutes, [{ ClerkSession: [] }, { SuperadminService: [] }]);
mountApi('', ingestionRoutes);
app.use('/scim/v2', scimRoutes);
mounts.push({ prefix: '/scim/v2', router: scimRoutes, security: [{ ScimToken: [] }] });
export const apiDocument = generateOpenApi(mounts);
app.get('/api/docs', (_req, res) => {
  res.json(apiDocument);
});
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});
app.use(errorMiddleware);

export default app;
