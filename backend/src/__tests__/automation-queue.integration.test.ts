import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import type { Worker } from 'bullmq';
import Redis from 'ioredis';
import { randomBytes } from 'crypto';

jest.setTimeout(90000);
it('redacts automation dead-letter metadata after bounded retries in real Redis', async () => {
  const redis: StartedTestContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();
  const previous = process.env.REDIS_URL;
  process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  jest.resetModules();
  const queueModule = await import('../lib/queue');
  const redisModule = await import('../lib/redis');
  const stderr = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  let worker: Worker | undefined;
  try {
    const source = queueModule.getQueue(queueModule.QueueNames.AUTOMATION);
    const dlq = queueModule.getQueue(queueModule.QueueNames.DEAD_LETTER);
    worker = queueModule.createWorker(
      queueModule.QueueNames.AUTOMATION,
      async () => {
        throw new Error('private-fixture-error');
      },
      1,
    );
    await source.add(
      'private-fixture-name',
      { value: 'private-fixture-payload' },
      { jobId: 'private-fixture-id', attempts: 2, backoff: { type: 'fixed', delay: 10 } },
    );
    const deadline = Date.now() + 10000;
    while ((await dlq.getJobs(['waiting', 'delayed'])).length === 0 && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 30));
    const jobs = await dlq.getJobs(['waiting', 'delayed']);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data).toMatchObject({
      attemptsMade: 2,
      data: null,
      failedReason: 'Automation execution failed',
    });
    expect((await source.getJob('private-fixture-id'))?.failedReason).toBe(
      'Automation execution failed',
    );
    const disclosed = JSON.stringify({
      data: jobs[0].data,
      id: jobs[0].id,
      logs: stderr.mock.calls,
    });
    expect(disclosed).not.toContain('private-fixture-');
  } finally {
    stderr.mockRestore();
    await worker?.close();
    await queueModule.closeQueues();
    await redisModule.disconnectRedis();
    if (previous === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previous;
    await redis.stop();
  }
});

it('connects the automation producer and worker using a Redis ACL username', async () => {
  const container = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();
  const host = container.getHost(),
    port = container.getMappedPort(6379);
  const admin = new Redis({ host, port, maxRetriesPerRequest: 1 });
  const password = randomBytes(16).toString('hex');
  const previous = process.env.REDIS_URL;
  let worker: Worker | undefined;
  try {
    await admin.call('ACL', 'SETUSER', 'automation_fixture', 'on', `>${password}`, '~*', '+@all');
    await admin.call('ACL', 'SETUSER', 'default', 'off');
    process.env.REDIS_URL = `redis://automation_fixture:${password}@${host}:${port}`;
    jest.resetModules();
    const queues = await import('../lib/queue');
    const clients = await import('../lib/redis');
    const service = await import('../services/automation-worker');
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const source = queues.getQueue(queues.QueueNames.AUTOMATION);
      await service.automationQueueDeadline(source.waitUntilReady(), 5000);
      let processed = 0;
      worker = queues.createWorker(
        queues.QueueNames.AUTOMATION,
        async () => {
          processed++;
        },
        1,
      );
      await source.add('execute', { id: 'acl-fixture' }, { jobId: 'acl-fixture' });
      const deadline = Date.now() + 10000;
      while (processed === 0 && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 30));
      expect(processed).toBe(1);
      expect(JSON.stringify(errors.mock.calls)).not.toContain(password);
    } finally {
      await worker?.close();
      await queues.closeQueues();
      await clients.disconnectRedis();
      errors.mockRestore();
    }
  } finally {
    admin.disconnect();
    if (previous === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previous;
    await container.stop();
  }
});

it('returns from an automation enqueue during a real Redis outage', async () => {
  const redis = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();
  const previous = process.env.REDIS_URL;
  process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  jest.resetModules();
  const queueModule = await import('../lib/queue');
  const redisModule = await import('../lib/redis');
  const workerModule = await import('../services/automation-worker');
  const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  let stopped = false;
  const source = queueModule.getQueue(queueModule.QueueNames.AUTOMATION);
  try {
    await source.waitUntilReady();
    await redis.stop();
    stopped = true;
    const operation = source.add('execute', { executionId: 'fixture' });
    await expect(workerModule.automationQueueDeadline(operation, 3000)).rejects.toThrow();
    queueModule.resetAutomationQueue(source);
    await expect(workerModule.automationQueueDeadline(operation, 3000)).rejects.toThrow();
    expect(JSON.stringify(errors.mock.calls)).not.toContain('fixture');
  } finally {
    queueModule.resetAutomationQueue(source);
    await queueModule.closeQueues();
    await redisModule.disconnectRedis();
    errors.mockRestore();
    if (previous === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previous;
    if (!stopped) await redis.stop();
  }
});
