import express from 'express';
import { clerkMiddleware } from '@clerk/express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { ZodError } from 'zod';
import { generalLimiter } from './middleware/rate-limit.middleware';
import { AppError } from './utils/errors';
import { traceContext } from './middleware/tracing.middleware';

import authRoutes from './routes/auth.routes';
import workspaceRoutes from './routes/workspace.routes';
import documentRoutes from './routes/document.routes';
import taskRoutes from './routes/task.routes';
import snippetRoutes from './routes/snippet.routes';
import aiRoutes from './routes/ai.routes';
import githubWebhookRoutes from './routes/github-webhook.routes';
import ingestionRoutes from './routes/ingestion.routes';
import scimRoutes from './routes/scim.routes';
import stripeWebhookRoutes from './routes/stripe.webhook';
import superadminRoutes from './routes/superadmin.routes';

const app = express();

// Security & parsing
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb', verify: (req, _res, buffer) => { (req as any).rawBody = buffer; } }));
app.use(express.urlencoded({ extended: true }));
app.use(traceContext);
// Authentication is integration-tested with real Clerk credentials. Unit tests
// run without external credentials and exercise only public/security utilities.
if (process.env.NODE_ENV !== 'test') app.use(clerkMiddleware());
app.use(morgan('dev'));
app.use(generalLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/snippets', snippetRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/webhooks/github', githubWebhookRoutes);
app.use('/api/webhooks/stripe', stripeWebhookRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/scim/v2', scimRoutes);
app.use('/api', ingestionRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness is intentionally stricter than liveness: orchestration can avoid
// routing traffic until the database and essential production configuration work.
app.get('/api/ready', async (_req, res) => {
  try {
    const { prisma } = await import('./lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    const configured = Boolean(process.env.CLERK_SECRET_KEY && process.env.ENCRYPTION_KEY);
    res.status(configured ? 200 : 503).json({ status: configured ? 'ready' : 'degraded', database: 'ok', configured });
  } catch {
    res.status(503).json({ status: 'unavailable', database: 'unreachable' });
  }
});

// 404 Route Fallback
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Centralized Express Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Operational App Errors (BadRequest, Unauthorized, Forbidden, NotFound, Conflict)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Zod Validation Errors
  if (err instanceof ZodError) {
    const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    res.status(400).json({ error: messages });
    return;
  }

  // Body Parsing / Malformed JSON Syntax Errors
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
    res.status(400).json({ error: 'Invalid or malformed JSON payload' });
    return;
  }

  // Prisma Known Request Errors
  if (err?.code === 'P2025') {
    res.status(404).json({ error: 'Requested record not found' });
    return;
  }
  if (err?.code === 'P2002') {
    res.status(409).json({ error: 'Record unique constraint failed' });
    return;
  }
  if (err?.code === 'P2003') {
    res.status(400).json({ error: 'Invalid reference or foreign key constraint' });
    return;
  }
  // PostgreSQL RLS rejects are expected authorization outcomes, never process
  // crashes.  Do not expose policy/table details to the caller.
  if (err?.code === '42501' || /row-level security/i.test(String(err?.message || ''))) {
    res.status(403).json({ error: 'Access denied for this workspace' });
    return;
  }

  // JWT Errors
  if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Unexpected internal server errors
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
