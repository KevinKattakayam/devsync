import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import type { Worker } from 'bullmq';

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
