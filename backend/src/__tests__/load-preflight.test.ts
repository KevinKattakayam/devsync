import express from 'express';
import request from 'supertest';
import { createLoadPreflight } from '../../testing/load-preflight';

const environment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://fixture:fixture@localhost/devsync_e2e_load',
  E2E_RUN_SECRET: 'ab'.repeat(32),
};

it('refuses unsafe fixture configuration', () => {
  for (const override of [
    { NODE_ENV: 'production' },
    { DATABASE_URL: 'postgresql://fixture:fixture@localhost/devsync' },
    { E2E_RUN_SECRET: '' },
  ])
    expect(() => createLoadPreflight({ ...environment, ...override })).toThrow();
});

it('requires the capability and returns only a stable non-secret run marker', async () => {
  const app = express();
  app.use('/__fixture', createLoadPreflight(environment));
  for (const value of ['', 'cd'.repeat(32), 'short']) {
    const result = await request(app)
      .get('/__fixture/load-preflight')
      .set('x-e2e-run-secret', value);
    expect(result.status).toBe(403);
    expect(JSON.stringify(result.body)).not.toContain(environment.E2E_RUN_SECRET);
  }
  const first = await request(app)
    .get('/__fixture/load-preflight')
    .set('x-e2e-run-secret', environment.E2E_RUN_SECRET);
  const second = await request(app)
    .get('/__fixture/load-preflight')
    .set('x-e2e-run-secret', environment.E2E_RUN_SECRET);
  expect(first.status).toBe(200);
  expect(first.headers['cache-control']).toBe('no-store');
  expect(first.body).toEqual({ marker: 'devsync-isolated-fixture-v1', runId: expect.any(String) });
  expect(first.body.runId).toMatch(/^[0-9a-f-]{36}$/);
  expect(second.body).toEqual(first.body);
  expect(JSON.stringify(first.body)).not.toContain(environment.E2E_RUN_SECRET);
});
