import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { prisma } from '../lib/prisma';
import { isDraining } from '../lib/lifecycle';
export function createHealthRouter(database: PrismaClient = prisma, redisUrl = process.env.REDIS_URL || 'redis://localhost:6379') {
const router = Router();
router.get('/health', (_req, res) => { res.json({ status: 'ok', timestamp: new Date().toISOString() }); });
router.get('/ready', async (_req, res, next) => {
  if (isDraining()) { res.status(503).json({ error: 'Server draining' }); return; }
  // An independent bounded probe never leaves commands queued on BullMQ clients.
  const redis = new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false, connectTimeout: 1000, commandTimeout: 1000, retryStrategy: () => null, maxRetriesPerRequest: 0 });
  redis.on('error', () => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const databaseCheck = database.$transaction(async tx => { await tx.$executeRaw`SET LOCAL statement_timeout = '1000ms'`; await tx.$queryRaw`SELECT 1`; }, { maxWait: 1000, timeout: 1500 });
    const cache = redis.connect().then(() => redis.ping());
    const result = await Promise.race([
      Promise.allSettled([databaseCheck, cache]),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Readiness timeout')), 1800); }),
    ]);
    const configured = Boolean(process.env.CLERK_SECRET_KEY && process.env.ENCRYPTION_KEY);
    const ready = configured && result.every(item => item.status === 'fulfilled');
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable', configured, database: result[0].status === 'fulfilled' ? 'ok' : 'unreachable', redis: result[1].status === 'fulfilled' ? 'ok' : 'unreachable' });
  } catch (error) { if (error instanceof Error && error.message === 'Readiness timeout') res.status(503).json({ status: 'unavailable', error: 'Dependencies unavailable' }); else next(error); }
  finally { if (timer) clearTimeout(timer); redis.disconnect(); }
});
// The app owns the central error handler; exporting the router keeps aliases identical.
return router;
}
export default createHealthRouter();
