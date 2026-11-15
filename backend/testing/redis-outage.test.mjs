import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { GenericContainer } from 'testcontainers';
import { Queue, QueueEvents, Worker } from 'bullmq';
import Redis from 'ioredis';

test(
  'disposable Redis pause and recovery preserves one queued job',
  { timeout: 90000 },
  async () => {
    const container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    const connection = {
      host: container.getHost(),
      port: container.getMappedPort(6379),
      maxRetriesPerRequest: null,
    };
    const queue = new Queue('audit-outage', { connection });
    const events = new QueueEvents('audit-outage', { connection });
    const probe = new Redis({ ...connection, commandTimeout: 1000 });
    probe.on('error', () => {});
    let release;
    let paused = false;
    let worker;
    try {
      await events.waitUntilReady();
      await probe.ping();
      let started;
      const active = new Promise((resolve) => {
        started = resolve;
      });
      const hold = new Promise((resolve) => {
        release = resolve;
      });
      let executions = 0;
      worker = new Worker(
        'audit-outage',
        async () => {
          executions += 1;
          started();
          await hold;
        },
        { connection },
      );
      worker.on('error', () => {});
      const job = await queue.add(
        'synthetic',
        {},
        { jobId: 'fixed-audit-job', removeOnComplete: false },
      );
      let timer;
      try {
        await Promise.race([
          active,
          new Promise((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('Synthetic worker did not start')), 15000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      const pause = spawnSync('docker', ['pause', container.getId()], {
        stdio: 'ignore',
        timeout: 10000,
      });
      assert.equal(pause.status, 0, 'disposable Redis pause must succeed');
      paused = true;
      await assert.rejects(() => probe.ping(), /timed out/i);
      const resume = spawnSync('docker', ['unpause', container.getId()], {
        stdio: 'ignore',
        timeout: 10000,
      });
      assert.equal(resume.status, 0, 'disposable Redis resume must succeed');
      paused = false;
      release();
      await job.waitUntilFinished(events, 15000);
      const duplicate = await queue.add(
        'synthetic',
        {},
        { jobId: 'fixed-audit-job', removeOnComplete: false },
      );
      assert.equal(duplicate.id, job.id);
      const counts = await queue.getJobCounts('waiting', 'active', 'completed');
      assert.equal(counts.waiting, 0);
      assert.equal(counts.active, 0);
      assert.equal(counts.completed, 1);
      assert.equal(executions, 1);
      assert.equal(await job.getState(), 'completed');
    } finally {
      if (paused)
        spawnSync('docker', ['unpause', container.getId()], { stdio: 'ignore', timeout: 10000 });
      release?.();
      probe.disconnect();
      await Promise.allSettled([worker?.close(), events.close(), queue.close()]);
      await container.stop();
    }
  },
);
