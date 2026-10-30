import express, { ErrorRequestHandler } from 'express';
import request from 'supertest';
import { randomBytes, createHmac } from 'crypto';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { TenantPrismaClient } from '../lib/tenant-prisma';
import { prisma } from '../lib/prisma';
import router from '../routes/github-webhook.routes';
jest.mock('../server', () => ({ io: { to: () => ({ emit: jest.fn() }) } }));
jest.mock('../lib/prisma', () => ({ prisma: mockDeep<TenantPrismaClient>() }));
jest.mock('../services/secret.service', () => ({ decryptSecret: (value: string) => value }));
jest.mock('../lib/redis', () => ({ isRedisAvailable: async () => false }));
jest.mock('../lib/queue', () => ({ QueueNames: {}, getQueue: jest.fn() }));
jest.mock('../lib/idempotency', () => ({
  withIdempotencyKey: async (_key: string, handler: () => Promise<unknown>) => ({
    duplicate: false,
    value: await handler(),
  }),
}));
const db = prisma as DeepMockProxy<TenantPrismaClient>;
const app = express();
app.use(
  express.json({
    verify: (req, _res, buffer) => {
      Object.assign(req, { rawBody: buffer });
    },
  }),
);
app.use('/github', router);
const errors: ErrorRequestHandler = (_error, _req, res, _next) => {
  res.status(500).json({ error: 'Request failed' });
};
app.use(errors);
const secret = randomBytes(32).toString('hex');
beforeEach(() => {
  jest.clearAllMocks();
  db.gitHubRepository.findUnique.mockResolvedValue({
    repositoryId: 'repo-a',
    workspaceId: 'a',
    webhookSecret: secret,
    prOpenedColumnId: 'column-a',
  } as Awaited<ReturnType<typeof prisma.gitHubRepository.findUnique>>);
  db.column.findUnique.mockResolvedValue({
    id: 'column-a',
    name: 'Column',
    position: 0,
    boardId: 'board-a',
    board: { workspaceId: 'a' },
  } as Awaited<ReturnType<typeof prisma.column.findUnique>>);
  db.task.findMany.mockImplementation(
    (args) =>
      Promise.resolve(
        args?.where?.column ? [] : [{ id: 'task-b', taskKey: 'DEV-123', columnId: 'column-b' }],
      ) as ReturnType<typeof prisma.task.findMany>,
  );
  db.$transaction.mockResolvedValue([]);
  db.withTenantTransaction.mockImplementation(async (_tenant, operation) => operation(prisma));
});
it('G08 a signed repository A event cannot move a task from workspace B', async () => {
  const payload = JSON.stringify({
    repository: { id: 'repo-a' },
    action: 'opened',
    pull_request: { title: 'Fixes DEV-123', body: '' },
  });
  const response = await request(app)
    .post('/github')
    .set('content-type', 'application/json')
    .set('x-github-delivery', 'isolated-test-delivery')
    .set('x-github-event', 'pull_request')
    .set(
      'x-hub-signature-256',
      'sha256=' + createHmac('sha256', secret).update(payload).digest('hex'),
    )
    .send(payload);
  expect(response.status).toBe(200);
  expect(db.task.update).not.toHaveBeenCalled();
  expect(db.task.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ column: { board: { workspaceId: 'a' } } }),
    }),
  );
});
