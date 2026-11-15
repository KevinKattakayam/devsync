// Test executable only; never imported by the production application/server.
import { timingSafeEqual } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { validateFixtureConfiguration } from './fixture-auth';
import { UnauthorizedError } from '../src/utils/errors';
import type { DocumentRoom } from '../src/services/crdt-journal';

interface RecoveryActions {
  generation: number;
  crash(): void;
  compact(room: DocumentRoom): Promise<void>;
  state(
    room: DocumentRoom,
    markers?: string[],
  ): Promise<{
    journalRows: number;
    snapshotBytes: number;
    revision: number;
    markerPresence?: Record<string, boolean>;
  }>;
}
const roomInput = z
  .object({
    workspaceId: z.string().regex(/^[a-zA-Z0-9_-]{1,191}$/),
    documentId: z.string().regex(/^[a-zA-Z0-9_-]{1,191}$/),
  })
  .strict();
const stateInput = roomInput
  .extend({
    markers: z
      .array(z.string().regex(/^\[[AB]\d{1,2}\]$/))
      .max(70)
      .optional(),
  })
  .strict();
export function createRecoveryControls(environment: NodeJS.ProcessEnv, actions: RecoveryActions) {
  const { secret } = validateFixtureConfiguration(environment);
  if (environment.E2E_RECOVERY !== '1')
    throw new Error('Recovery controls require explicit fixture mode');
  const router = Router();
  router.use((req, res, next) => {
    const supplied = req.header('x-e2e-run-secret') || '';
    if (
      Buffer.byteLength(supplied) !== Buffer.byteLength(secret) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
    )
      return next(new UnauthorizedError('Invalid fixture capability'));
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get('/generation', (_req, res) => res.json({ generation: actions.generation }));
  router.post('/state', async (req, res, next) => {
    try {
      const { markers, ...room } = stateInput.parse(req.body);
      res.json(await actions.state(room, markers));
    } catch (error) {
      next(error);
    }
  });
  router.post('/compact', async (req, res, next) => {
    try {
      await actions.compact(roomInput.parse(req.body));
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  router.post('/crash', (req, res, next) => {
    try {
      z.object({}).strict().parse(req.body);
      res.once('finish', actions.crash);
      res.status(202).end();
    } catch (error) {
      next(error);
    }
  });
  return router;
}
