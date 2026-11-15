// Fixture executable only; not mounted in the production application.
import { randomUUID, timingSafeEqual } from 'crypto';
import { Router } from 'express';
import { validateFixtureConfiguration } from './fixture-auth';

export function createLoadPreflight(environment: NodeJS.ProcessEnv) {
  const { secret } = validateFixtureConfiguration(environment);
  const runId = randomUUID();
  const router = Router();
  router.get('/load-preflight', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const supplied = req.header('x-e2e-run-secret') || '';
    if (
      Buffer.byteLength(supplied) !== Buffer.byteLength(secret) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
    ) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    res.json({ marker: 'devsync-isolated-fixture-v1', runId });
  });
  return router;
}
