import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { Job, Queue, Worker } from 'bullmq';

jest.setTimeout(90_000);

describe('BullMQ DLQ resilience', () => {
  let redis: StartedTestContainer;
  let queue: Queue<{ id: string }>;
  let dlq: Queue;
  let worker: Worker<{ id: string }>;

  beforeAll(async () => {
    redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).withWaitStrategy(Wait.forLogMessage('Ready to accept connections')).start();
    const connection = { host: redis.getHost(), port: redis.getMappedPort(6379), maxRetriesPerRequest: null as null };
    queue = new Queue('resilience-source', { connection, defaultJobOptions: { attempts: 2, backoff: { type: 'fixed', delay: 10 } } });
    dlq = new Queue('resilience-dlq', { connection });
    worker = new Worker('resilience-source', async () => { throw new Error('simulated redis dependent service outage'); }, { connection });
    worker.on('failed', (job: Job<{ id: string }> | undefined, error: Error) => {
      if (job && job.attemptsMade >= (job.opts.attempts || 1)) void dlq.add('failed-job', { sourceJobId: job.id, failedReason: error.message }, { jobId: `dlq-${job.id}` });
    });
  });

  afterAll(async () => { await worker.close(); await queue.close(); await dlq.close(); await redis.stop(); });

  it('routes an exhausted job to the DLQ rather than dropping it', async () => {
    await queue.add('requires-redis', { id: 'job-1' }, { jobId: 'job-1' });
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 10_000;
      const timer = setInterval(async () => {
        try {
          const jobs = await dlq.getJobs(['waiting', 'delayed']);
          if (jobs.some((job) => job.data.sourceJobId === 'job-1')) { clearInterval(timer); resolve(); }
          else if (Date.now() > deadline) { clearInterval(timer); reject(new Error('DLQ did not receive exhausted job')); }
        } catch (error) { clearInterval(timer); reject(error); }
      }, 25);
    });
    const [job] = await dlq.getJobs(['waiting', 'delayed']);
    expect(job.data).toEqual(expect.objectContaining({ sourceJobId: 'job-1', failedReason: expect.stringContaining('outage') }));
  });
});
