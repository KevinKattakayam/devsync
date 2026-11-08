import express from 'express';
import request from 'supertest';
import { createRecoveryControls } from '../../testing/recovery-controls';
import { errorMiddleware } from '../middleware/error.middleware';

const environment = {
  NODE_ENV: 'test',
  E2E_RECOVERY: '1',
  DATABASE_URL: 'postgresql://fixture:fixture@localhost/devsync_e2e_recovery',
  E2E_RUN_SECRET: 'ab'.repeat(32),
};
const actions = () => ({
  generation: 2,
  crash: jest.fn(),
  compact: jest.fn(async () => {}),
  state: jest.fn(async () => ({ journalRows: 3, snapshotBytes: 40, revision: 5 })),
});
it('refuses recovery controls outside an explicit isolated fixture database and mode', () => {
  for (const override of [
    { NODE_ENV: 'production' },
    { DATABASE_URL: 'postgresql://fixture:fixture@localhost/devsync' },
    { E2E_RECOVERY: '0' },
    { E2E_RUN_SECRET: '' },
  ])
    expect(() => createRecoveryControls({ ...environment, ...override }, actions())).toThrow();
});
it('requires the run capability and strict fixed actions without executing rejected input', async () => {
  const calls = actions(),
    app = express();
  app.use(express.json(), createRecoveryControls(environment, calls), errorMiddleware);
  expect((await request(app).post('/crash').send({})).status).toBe(401);
  expect(
    (await request(app).get('/generation').set('x-e2e-run-secret', 'cd'.repeat(32))).status,
  ).toBe(401);
  expect(
    (
      await request(app)
        .post('/crash')
        .set('x-e2e-run-secret', environment.E2E_RUN_SECRET)
        .send({ command: 'anything' })
    ).status,
  ).toBe(400);
  expect(calls.crash).not.toHaveBeenCalled();
  expect(
    (await request(app).get('/generation').set('x-e2e-run-secret', environment.E2E_RUN_SECRET))
      .body,
  ).toEqual({ generation: 2 });
  const room = { workspaceId: 'workspace', documentId: 'document' };
  expect(
    (
      await request(app)
        .post('/compact')
        .set('x-e2e-run-secret', environment.E2E_RUN_SECRET)
        .send({ ...room, actorId: 'forged' })
    ).status,
  ).toBe(400);
  expect(calls.compact).not.toHaveBeenCalled();
  expect(
    (
      await request(app)
        .post('/compact')
        .set('x-e2e-run-secret', environment.E2E_RUN_SECRET)
        .send(room)
    ).status,
  ).toBe(204);
  expect(calls.compact).toHaveBeenCalledWith(room);
  expect(
    (
      await request(app)
        .post('/state')
        .set('x-e2e-run-secret', environment.E2E_RUN_SECRET)
        .send(room)
    ).body,
  ).toEqual({ journalRows: 3, snapshotBytes: 40, revision: 5 });
});
