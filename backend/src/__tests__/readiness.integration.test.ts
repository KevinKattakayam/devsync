import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer } from 'testcontainers';
import { PrismaClient } from '@prisma/client';
import express from 'express';
import request from 'supertest';
import { createHealthRouter } from '../routes/health.routes';
jest.setTimeout(60000);
it('checks real PostgreSQL and Redis, rejects outages, and bounds response time', async () => {
  const postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  const redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  const db = new PrismaClient({ datasourceUrl: `${postgres.getConnectionUri()}?connect_timeout=1` });
  const previous = { clerk: process.env.CLERK_SECRET_KEY, encryption: process.env.ENCRYPTION_KEY };
  process.env.CLERK_SECRET_KEY = 'fixture-presence-only'; process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  const app = express(); app.use(createHealthRouter(db, `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`));
  try {
    const ready = await request(app).get('/ready');
    expect(ready.status).toBe(200); expect(ready.body).toMatchObject({ database: 'ok', redis: 'ok' });
    await redis.stop();
    let start = Date.now(); const noRedis = await request(app).get('/ready');
    expect(noRedis.status).toBe(503); expect(noRedis.body.redis).toBe('unreachable'); expect(Date.now() - start).toBeLessThan(3000);
    await postgres.stop();
    start = Date.now(); const neither = await request(app).get('/ready');
    expect(neither.status).toBe(503); expect(Date.now() - start).toBeLessThan(3000);
    expect((await request(app).get('/health')).status).toBe(200);
  } finally {
    await db.$disconnect(); await Promise.allSettled([redis.stop(), postgres.stop()]);
    if (previous.clerk === undefined) delete process.env.CLERK_SECRET_KEY; else process.env.CLERK_SECRET_KEY = previous.clerk;
    if (previous.encryption === undefined) delete process.env.ENCRYPTION_KEY; else process.env.ENCRYPTION_KEY = previous.encryption;
  }
});
