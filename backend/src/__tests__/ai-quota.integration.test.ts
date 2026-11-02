import { GenericContainer, StartedTestContainer } from 'testcontainers';
import Redis from 'ioredis';
import { AiQuota, defaultAiLimits } from '../services/ai-quota';
let container: StartedTestContainer, redis: Redis;
beforeAll(async () => {
  container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  redis = new Redis({ host: container.getHost(), port: container.getMappedPort(6379) });
}, 60000);
afterAll(async () => {
  await redis?.quit();
  await container?.stop();
});
beforeEach(async () => {
  await redis.flushdb();
});
it('atomically caps parallel requests without partial charging and releases concurrency', async () => {
  const quota = new AiQuota(redis, {
    ...defaultAiLimits,
    userDaily: 3,
    userMonthly: 3,
    userConcurrent: 20,
    workspaceConcurrent: 20,
  });
  const calls = await Promise.allSettled(Array.from({ length: 20 }, () => quota.acquire('a', 'w')));
  expect(calls.filter((c) => c.status === 'fulfilled')).toHaveLength(3);
  expect((await quota.usage('a', 'w')).user.daily).toBe(3);
  for (const c of calls) if (c.status === 'fulfilled') await c.value();
});
it('shares user allowance across workspaces while isolating workspace counters', async () => {
  const quota = new AiQuota(redis, { ...defaultAiLimits, userDaily: 1 });
  await (
    await quota.acquire('a', 'w1')
  )();
  await expect(quota.acquire('a', 'w2')).rejects.toThrow('quota exceeded');
  expect((await quota.usage('b', 'w2')).workspace.daily).toBe(0);
  await (
    await quota.acquire('b', 'w2')
  )();
  expect((await quota.usage('b', 'w2')).workspace.daily).toBe(1);
});
it('enforces workspace monthly and user concurrency limits', async () => {
  const q = new AiQuota(redis, { ...defaultAiLimits, workspaceMonthly: 1 });
  const release = await q.acquire('a', 'w');
  await release();
  await expect(q.acquire('b', 'w')).rejects.toThrow('quota exceeded');
  const c = new AiQuota(redis, { ...defaultAiLimits, userConcurrent: 1 });
  const done = await c.acquire('a', 'other');
  await expect(c.acquire('a', 'third')).rejects.toThrow('concurrency');
  await done();
  await (
    await c.acquire('a', 'third')
  )();
});
it('fails closed when admission storage fails', async () => {
  const q = new AiQuota({
    eval: async () => {
      throw new Error('offline');
    },
    mget: redis.mget.bind(redis),
    zrem: redis.zrem.bind(redis),
  });
  await expect(q.acquire('a', 'w')).rejects.toThrow('no provider request started');
});
for (const limit of ['userDaily', 'userMonthly', 'workspaceDaily', 'workspaceMonthly'] as const)
  it(`independently enforces ${limit}`, async () => {
    const q = new AiQuota(redis, { ...defaultAiLimits, [limit]: 1 });
    await (
      await q.acquire('a', 'w')
    )();
    await expect(q.acquire('a', 'w')).rejects.toThrow('quota exceeded');
  });
it('enforces workspace concurrency across distinct users', async () => {
  const q = new AiQuota(redis, { ...defaultAiLimits, workspaceConcurrent: 1 });
  const release = await q.acquire('a', 'w');
  await expect(q.acquire('b', 'w')).rejects.toThrow('concurrency');
  await release();
  await (
    await q.acquire('b', 'w')
  )();
});
it('enforces a shared workspace daily cap under parallel distinct users', async () => {
  const quota = new AiQuota(redis, {
    ...defaultAiLimits,
    workspaceDaily: 3,
    workspaceConcurrent: 20,
  });
  const outcomes = await Promise.allSettled(
    Array.from({ length: 20 }, (_, i) => quota.acquire(`user-${i}`, 'shared')),
  );
  expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
  expect((await quota.usage('reader', 'shared')).workspace.daily).toBe(3);
  for (const result of outcomes) if (result.status === 'fulfilled') await result.value();
});
it('resets UTC calendar periods and expires abandoned concurrency leases', async () => {
  const quota = new AiQuota(redis, {
    ...defaultAiLimits,
    userDaily: 1,
    userMonthly: 1,
    userConcurrent: 1,
  });
  await quota.acquire('actor', 'workspace', new Date('2026-01-31T23:59:00Z'));
  const release = await quota.acquire('actor', 'workspace', new Date('2026-02-01T00:02:00Z'));
  expect(
    (await quota.usage('actor', 'workspace', new Date('2026-02-01T00:03:00Z'))).user.monthly,
  ).toBe(1);
  await release();
});
it('refunds confirmed pre-provider failures exactly once under parallel settlement', async () => {
  const quota = new AiQuota(redis, { ...defaultAiLimits, userDaily: 1 });
  const release = await quota.acquire('actor', 'workspace');
  await Promise.all(Array.from({ length: 10 }, () => release(true)));
  expect((await quota.chargedUsage('actor', 'workspace')).user.daily).toBe(0);
  expect((await quota.chargedUsage('actor', 'workspace')).workspace.monthly).toBe(0);
  expect((await quota.usage('actor', 'workspace')).user.daily).toBe(1);
  await (
    await quota.acquire('actor', 'workspace')
  )();
  expect((await quota.chargedUsage('actor', 'workspace')).user.daily).toBe(1);
});
it('never refunds an already settled ambiguous attempt and reports typed UTC reset', async () => {
  const quota = new AiQuota(redis, { ...defaultAiLimits, userDaily: 1 });
  const now = new Date('2026-11-02T12:00:00Z');
  const release = await quota.acquire('actor', 'workspace', now);
  await release();
  await release(true);
  await expect(quota.acquire('actor', 'workspace', now)).rejects.toMatchObject({
    statusCode: 429,
    limit: {
      type: 'AI_QUOTA_EXCEEDED',
      scope: 'user',
      period: 'daily',
      resetAt: '2026-11-03T00:00:00.000Z',
    },
    retryAfter: 43200,
  });
});
it('admits provider operations only after reservation, including parallel exhaustion', async () => {
  const quota = new AiQuota(redis, { ...defaultAiLimits, userDaily: 2, userConcurrent: 20 });
  const provider = jest.fn(async () => 'output');
  const outcomes = await Promise.allSettled(
    Array.from({ length: 20 }, async () => {
      const release = await quota.acquire('actor', 'workspace');
      try {
        return await provider();
      } finally {
        await release();
      }
    }),
  );
  expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
  expect(provider).toHaveBeenCalledTimes(2);
  await expect(quota.acquire('actor', 'workspace')).rejects.toThrow('quota exceeded');
  expect(provider).toHaveBeenCalledTimes(2);
  expect((await quota.chargedUsage('another', 'elsewhere')).workspace.daily).toBe(0);
  expect((await quota.chargedUsage('another', 'workspace')).user.daily).toBe(0);
});
