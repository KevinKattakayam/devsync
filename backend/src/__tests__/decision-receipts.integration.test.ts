import express from 'express';
import request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { randomBytes } from 'crypto';
import { spawnSync } from 'child_process';
import { z } from 'zod';
import router from '../routes/decision-receipts.routes';
import { deleteWorkspace } from '../controllers/workspace.controller';
import { createTenantPrismaClient, TenantPrismaClient } from '../lib/tenant-prisma';
import { withDatabase } from '../lib/prisma';
import { errorMiddleware } from '../middleware/error.middleware';
jest.mock('../middleware/auth.middleware', () => ({
  authMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));
jest.setTimeout(90000);
let container: StartedPostgreSqlContainer, admin: PrismaClient, db: TenantPrismaClient;
let serial = 0;
const app = express();
app.use(express.json());
app.use((req, _res, next) =>
  withDatabase(db, () => {
    req.user = {
      userId: req.header('x-test-actor') || 'owner',
      clerkId: 'isolated-test',
      email: 'fixture@example.test',
    };
    next();
  }),
);
app.use('/workspaces/:workspaceId/decisions', router);
app.delete('/workspaces/:id', deleteWorkspace);
app.use(errorMiddleware);
beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  const migration = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { env: { ...process.env, DATABASE_URL: container.getConnectionUri() }, encoding: 'utf8' },
  );
  if (migration.status !== 0) throw new Error(migration.stderr);
  admin = new PrismaClient({ datasourceUrl: container.getConnectionUri() });
  const client = new Client({ connectionString: container.getConnectionUri() });
  await client.connect();
  const password = randomBytes(24).toString('hex');
  await client.query(
    `CREATE ROLE receipt_runtime LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO receipt_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO receipt_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO receipt_runtime`,
  );
  await client.end();
  const url = new URL(container.getConnectionUri());
  url.username = 'receipt_runtime';
  url.password = password;
  db = createTenantPrismaClient(new PrismaClient({ datasourceUrl: url.toString() }));
  for (const id of ['owner', 'editor', 'viewer', 'foreign'])
    await admin.user.create({
      data: { id, clerkId: `receipt-${id}`, email: `${id}@example.test` },
    });
});
afterAll(async () => {
  await db?.$disconnect();
  await admin?.$disconnect();
  await container?.stop();
});
beforeEach(() => {
  process.env.FEATURE_DECISION_RECEIPTS = 'true';
});
afterAll(() => {
  delete process.env.FEATURE_DECISION_RECEIPTS;
});
const sourceSchema = z.object({
  id: z.string(),
  kind: z.enum(['document', 'task']),
  text: z.string(),
  revision: z.string(),
});
const savedSchema = z.object({
  id: z.string(),
  revision: z.number(),
  status: z.string(),
  acceptedBy: z.string().nullable(),
  supersededById: z.string().nullable(),
});
async function fixture() {
  const a = `receipt-a-${++serial}`,
    b = `receipt-b-${serial}`;
  for (const id of [a, b])
    await admin.workspace.create({
      data: {
        id,
        slug: id,
        name: id,
        members: {
          create: [
            { userId: 'owner', role: 'OWNER' },
            ...(id === a
              ? [
                  { userId: 'editor', role: 'EDITOR' as const },
                  { userId: 'viewer', role: 'VIEWER' as const },
                ]
              : [{ userId: 'foreign', role: 'OWNER' as const }]),
          ],
        },
      },
    });
  const doc = await admin.document.create({
    data: {
      workspaceId: a,
      title: 'Local source',
      authorId: 'owner',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A local tradeoff.' }] }],
      },
    },
  });
  const foreign = await admin.document.create({
    data: { workspaceId: b, title: 'Private foreign source', authorId: 'owner' },
  });
  const path = `/workspaces/${a}/decisions`;
  const source = sourceSchema.parse(
    (await request(app).get(`${path}/source`).query({ kind: 'document', id: doc.id }).expect(200))
      .body,
  );
  const input = {
    title: 'Use local transactions',
    rationale: 'Keep authority and writes atomic.',
    sourceKind: source.kind,
    sourceId: source.id,
    sourceRevision: source.revision,
    excerpt: 'A local tradeoff.',
  };
  const create = async (title = input.title, actor = 'editor') =>
    savedSchema.parse(
      (
        await request(app)
          .post(path)
          .set('x-test-actor', actor)
          .send({ ...input, title })
          .expect(201)
      ).body,
    );
  return { a, b, path, doc, foreign, input, create };
}
it('is disabled by default, even for authenticated owners', async () => {
  delete process.env.FEATURE_DECISION_RECEIPTS;
  await request(app).get('/workspaces/a/decisions').expect(404);
  await request(app).post('/workspaces/a/decisions').send({}).expect(404);
  await request(app).get('/workspaces/a/decisions/receipt/timeline').expect(404);
  await request(app).post('/workspaces/a/decisions/receipt/timeline').send({}).expect(404);
});
it('supports editor draft CRUD, exact quotes and optimistic revision conflicts', async () => {
  const f = await fixture(),
    receipt = await f.create();
  await request(app)
    .patch(`${f.path}/${receipt.id}`)
    .set('x-test-actor', 'editor')
    .send({ ...f.input, rationale: 'Revised rationale', revision: 0 })
    .expect(200);
  await request(app)
    .patch(`${f.path}/${receipt.id}`)
    .send({ ...f.input, revision: 0 })
    .expect(409);
  await request(app)
    .delete(`${f.path}/${receipt.id}`)
    .set('x-test-actor', 'editor')
    .send({ revision: 1 })
    .expect(204);
  await request(app).get(f.path).expect(200, []);
  await request(app)
    .post(f.path)
    .send({ ...f.input, excerpt: 'Invented source claim' })
    .expect(400);
});
it('allows viewer reads but rejects every viewer mutation and editor acceptance', async () => {
  const f = await fixture(),
    receipt = await f.create();
  const read = await request(app).get(f.path).set('x-test-actor', 'viewer').expect(200);
  expect(read.body).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: receipt.id, excerpt: f.input.excerpt })]),
  );
  await request(app).post(f.path).set('x-test-actor', 'viewer').send(f.input).expect(403);
  await request(app)
    .patch(`${f.path}/${receipt.id}`)
    .set('x-test-actor', 'viewer')
    .send({ ...f.input, revision: 0 })
    .expect(403);
  await request(app)
    .delete(`${f.path}/${receipt.id}`)
    .set('x-test-actor', 'viewer')
    .send({ revision: 0 })
    .expect(403);
  for (const actor of ['viewer', 'editor']) {
    await request(app)
      .post(`${f.path}/${receipt.id}/accept`)
      .set('x-test-actor', actor)
      .send({ revision: 0 })
      .expect(403);
    await request(app)
      .post(`${f.path}/${receipt.id}/supersede`)
      .set('x-test-actor', actor)
      .send({ revision: 0, replacementId: receipt.id })
      .expect(403);
  }
});
it('freezes accepted receipts and permits only an accepted same-workspace replacement', async () => {
  const f = await fixture(),
    first = await f.create(),
    second = await f.create('Replacement');
  await request(app).post(`${f.path}/${first.id}/accept`).send({ revision: 0 }).expect(200);
  await request(app)
    .patch(`${f.path}/${first.id}`)
    .send({ ...f.input, revision: 1 })
    .expect(409);
  await request(app).delete(`${f.path}/${first.id}`).send({ revision: 1 }).expect(409);
  await request(app)
    .post(`${f.path}/${first.id}/supersede`)
    .send({ revision: 1, replacementId: second.id })
    .expect(409);
  await request(app).post(`${f.path}/${second.id}/accept`).send({ revision: 0 }).expect(200);
  const result = await request(app)
    .post(`${f.path}/${first.id}/supersede`)
    .send({ revision: 1, replacementId: second.id })
    .expect(200);
  expect(savedSchema.parse(result.body)).toMatchObject({
    status: 'SUPERSEDED',
    acceptedBy: 'owner',
    supersededById: second.id,
  });
  await request(app)
    .post(`${f.path}/${second.id}/supersede`)
    .send({ revision: 1, replacementId: first.id })
    .expect(409);
});
it('never leaks foreign sources or receipts, even when an actor belongs to both workspaces', async () => {
  const f = await fixture(),
    receipt = await f.create();
  await request(app).get(f.path).set('x-test-actor', 'foreign').expect(403);
  await request(app)
    .get(`${f.path}/source`)
    .query({ kind: 'document', id: f.foreign.id })
    .expect(404);
  await request(app)
    .post(f.path)
    .send({ ...f.input, sourceId: f.foreign.id })
    .expect(404);
  await request(app)
    .get(`${f.path}/sources`)
    .expect(200)
    .then((r) => expect(JSON.stringify(r.body)).not.toContain(f.foreign.id));
  const wrongPath = `/workspaces/${f.b}/decisions/${receipt.id}`;
  await request(app)
    .patch(wrongPath)
    .send({ ...f.input, revision: 0 })
    .expect(404);
  await request(app).delete(wrongPath).send({ revision: 0 }).expect(404);
  await request(app).post(`${wrongPath}/accept`).send({ revision: 0 }).expect(404);
  await request(app)
    .post(`${wrongPath}/supersede`)
    .send({ revision: 0, replacementId: receipt.id })
    .expect(404);
  await request(app)
    .post(`${f.path}/${receipt.id}/supersede`)
    .send({ revision: 0, replacementId: 'foreign-id' })
    .expect(404);
  expect(await db.decisionReceipt.findMany()).toEqual([]);
  expect(await db.withTenantTransaction(f.b, (tx) => tx.decisionReceipt.findMany())).toEqual([]);
  await expect(
    db.withTenantTransaction(f.b, (tx) =>
      tx.decisionReceipt.create({ data: { ...f.input, workspaceId: f.a, createdBy: 'owner' } }),
    ),
  ).rejects.toThrow();
});
it('detects changed sources, hides archived excerpts and rechecks idempotent create authority', async () => {
  const f = await fixture();
  const created = await request(app)
    .post(f.path)
    .set('Idempotency-Key', 'receipt-create-key-0001')
    .send(f.input)
    .expect(201);
  const receipt = savedSchema.parse(created.body);
  await request(app)
    .post(f.path)
    .set('Idempotency-Key', 'receipt-create-key-0001')
    .send(f.input)
    .expect(201)
    .then((r) => expect(savedSchema.parse(r.body).id).toBe(receipt.id));
  await admin.document.update({
    where: { id: f.doc.id },
    data: { crdtRevision: { increment: 1 } },
  });
  await request(app)
    .get(f.path)
    .expect(200)
    .then((r) => expect(r.body).toEqual([expect.objectContaining({ sourceChanged: true })]));
  await request(app).post(`${f.path}/${receipt.id}/accept`).send({ revision: 0 }).expect(409);
  await request(app).post(f.path).send(f.input).expect(409);
  await admin.document.update({ where: { id: f.doc.id }, data: { isArchived: true } });
  await request(app).get(f.path).expect(200, []);
  await request(app)
    .post(f.path)
    .set('Idempotency-Key', 'receipt-create-key-0001')
    .send(f.input)
    .expect(404);
  await request(app).get(`${f.path}/source`).query({ kind: 'document', id: f.doc.id }).expect(404);
});
it('serializes concurrent acceptance and rechecks removed/inactive/suspended principals', async () => {
  const f = await fixture(),
    receipt = await f.create();
  const results = await Promise.all(
    [0, 1].map(() => request(app).post(`${f.path}/${receipt.id}/accept`).send({ revision: 0 })),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  await admin.workspaceMember.delete({
    where: { userId_workspaceId: { userId: 'viewer', workspaceId: f.a } },
  });
  await request(app).get(f.path).set('x-test-actor', 'viewer').expect(403);
  await admin.user.update({ where: { id: 'editor' }, data: { isActive: false } });
  try {
    await request(app).get(f.path).set('x-test-actor', 'editor').expect(403);
  } finally {
    await admin.user.update({ where: { id: 'editor' }, data: { isActive: true } });
  }
  await admin.workspace.update({ where: { id: f.a }, data: { suspendedAt: new Date() } });
  await request(app).get(f.path).expect(403);
});
it('supports bound task sources and omits receipts after task deletion', async () => {
  const f = await fixture();
  const board = await admin.board.create({
    data: {
      workspaceId: f.a,
      name: 'Source tasks',
      columns: { create: { name: 'Todo', position: 0 } },
    },
    include: { columns: true },
  });
  const task = await admin.task.create({
    data: {
      title: 'Task decision',
      description: 'Use a receipt.',
      columnId: board.columns[0].id,
      position: 0,
    },
  });
  const source = sourceSchema.parse(
    (await request(app).get(`${f.path}/source`).query({ kind: 'task', id: task.id }).expect(200))
      .body,
  );
  await request(app)
    .post(f.path)
    .send({
      ...f.input,
      sourceKind: 'task',
      sourceId: task.id,
      sourceRevision: source.revision,
      excerpt: 'Use a receipt.',
    })
    .expect(201);
  await request(app)
    .get(`/workspaces/${f.b}/decisions/source`)
    .query({ kind: 'task', id: task.id })
    .expect(404);
  await admin.task.delete({ where: { id: task.id } });
  await request(app).get(f.path).expect(200, []);
});
it('rejects an actual accepted replacement in another workspace, including for an owner of both', async () => {
  const f = await fixture(),
    original = await f.create();
  await request(app).post(`${f.path}/${original.id}/accept`).send({ revision: 0 }).expect(200);
  const otherPath = `/workspaces/${f.b}/decisions`;
  const source = sourceSchema.parse(
    (
      await request(app)
        .get(`${otherPath}/source`)
        .query({ kind: 'document', id: f.foreign.id })
        .expect(200)
    ).body,
  );
  const other = savedSchema.parse(
    (
      await request(app)
        .post(otherPath)
        .send({
          ...f.input,
          sourceId: source.id,
          sourceRevision: source.revision,
          excerpt: 'Private foreign source',
        })
        .expect(201)
    ).body,
  );
  await request(app).post(`${otherPath}/${other.id}/accept`).send({ revision: 0 }).expect(200);
  await request(app)
    .post(`${f.path}/${original.id}/supersede`)
    .send({ revision: 1, replacementId: other.id })
    .expect(404);
  await request(app)
    .get(f.path)
    .expect(200)
    .then((r) => {
      expect(JSON.stringify(r.body)).not.toContain(other.id);
      expect(JSON.stringify(r.body)).not.toContain('Private foreign source');
    });
});
it('requires current receipt source and writer authority for execution evidence', async () => {
  const f = await fixture();
  const receipt = await f.create();
  const timeline = `${f.path}/${receipt.id}/timeline`;
  const assertion = {
    kind: 'human_assertion',
    evidence: 'Reviewed delivery plan',
    occurredAt: '2026-11-08T10:00:00Z',
  };
  await request(app).post(timeline).send(assertion).expect(409);
  await request(app).get(`${f.path}/missing/timeline`).expect(404);
  await request(app).post(`${f.path}/${receipt.id}/accept`).send({ revision: 0 }).expect(200);
  await request(app)
    .post(timeline)
    .send({ ...assertion, occurredAt: 'invalid' })
    .expect(400);
  await request(app)
    .post(timeline)
    .send({ ...assertion, kind: 'outcome_confirmed' })
    .expect(201);
  await request(app).post(timeline).set('x-test-actor', 'viewer').send(assertion).expect(403);
  await request(app).post(timeline).set('x-test-actor', 'editor').send(assertion).expect(201);
  await request(app)
    .post(timeline)
    .set('x-test-actor', 'editor')
    .send({ ...assertion, evidence: '' })
    .expect(400);
  await request(app).get(timeline).set('x-test-actor', 'viewer').expect(200);
  await admin.document.update({ where: { id: f.doc.id }, data: { isArchived: true } });
  await request(app).get(timeline).expect(404);
  await request(app).post(timeline).send(assertion).expect(404);
});
it('restricts linked PR evidence to owners and hides it after disconnect', async () => {
  const f = await fixture(),
    receipt = await f.create();
  await request(app).post(`${f.path}/${receipt.id}/accept`).send({ revision: 0 }).expect(200);
  const repo = await admin.gitHubRepository.create({
    data: {
      workspaceId: f.a,
      repositoryId: `fixture-${f.a}`,
      owner: 'fixture',
      name: 'repo',
      webhookSecret: 'fixture-only-placeholder',
    },
  });
  await admin.gitHubExecutionState.create({
    data: {
      repositoryId: repo.id,
      workspaceId: f.a,
      kind: 'pull_request',
      subject: '7',
      state: 'merged',
      pullNumber: 7,
      headSha: 'a'.repeat(40),
      providerAt: new Date(),
      rank: 3,
    },
  });
  await admin.gitHubExecutionState.createMany({
    data: [
      {
        repositoryId: repo.id,
        workspaceId: f.a,
        kind: 'check_run',
        subject: '99',
        state: 'completed',
        conclusion: 'success',
        headSha: 'a'.repeat(40),
        providerAt: new Date('2026-11-08T10:01:00Z'),
        rank: 3,
      },
      {
        repositoryId: repo.id,
        workspaceId: f.a,
        kind: 'review',
        subject: '100',
        state: 'approved',
        pullNumber: 7,
        headSha: 'a'.repeat(40),
        providerAt: new Date('2026-11-08T10:02:00Z'),
        rank: 1,
      },
    ],
  });
  await admin.gitHubExecutionState.createMany({
    data: Array.from({ length: 101 }, (_, i) => ({
      repositoryId: repo.id,
      workspaceId: f.a,
      kind: 'check_run',
      subject: `older-${i}`,
      state: 'completed',
      conclusion: 'success',
      headSha: 'a'.repeat(40),
      providerAt: new Date('2026-01-01T00:00:00Z'),
      rank: 3,
    })),
  });
  const path = `${f.path}/${receipt.id}/timeline`;
  const body = {
    kind: 'linked_pull_request',
    repositoryId: repo.id,
    pullNumber: 7,
    evidence: 'PR evidence',
    occurredAt: '2026-11-08T10:00:00Z',
  };
  const foreignRepo = await admin.gitHubRepository.create({
    data: {
      workspaceId: f.b,
      repositoryId: `foreign-${f.b}`,
      owner: 'fixture',
      name: 'other',
      webhookSecret: 'fixture-only-placeholder',
    },
  });
  await request(app)
    .post(path)
    .send({ ...body, repositoryId: foreignRepo.id })
    .expect(404);
  await request(app).post(path).set('x-test-actor', 'editor').send(body).expect(403);
  await request(app).post(path).send(body).expect(201);
  expect(
    JSON.stringify((await request(app).get(path).set('x-test-actor', 'editor').expect(200)).body),
  ).not.toContain('PR evidence');
  const viewer = await request(app).get(path).set('x-test-actor', 'viewer').expect(200);
  expect(JSON.stringify(viewer.body)).not.toContain('PR evidence');
  const owner = await request(app).get(path).expect(200);
  expect(owner.body).toEqual(
    expect.arrayContaining([expect.objectContaining({ pullState: 'merged' })]),
  );
  expect(owner.body[0].githubEvidence).toHaveLength(100);
  expect(owner.body[0].githubEvidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'check_run',
        conclusion: 'success',
        providerAt: '2026-11-08T10:01:00.000Z',
      }),
      expect.objectContaining({
        kind: 'review',
        state: 'approved',
        providerAt: '2026-11-08T10:02:00.000Z',
      }),
    ]),
  );
  expect(JSON.stringify(owner.body)).not.toContain('deployment_verified');
  await request(app)
    .post(path)
    .send({ ...body, kind: 'deployment_verified' })
    .expect(400);
  await admin.gitHubRepository.update({
    where: { id: repo.id },
    data: { providerDisconnectedAt: new Date() },
  });
  expect((await request(app).get(path).expect(200)).body).toEqual([]);
  await request(app).post(path).send(body).expect(404);
  await admin.gitHubRepository.delete({ where: { id: repo.id } });
  expect((await request(app).get(path).expect(200)).body).toEqual([]);
});
it('links only same-workspace tasks and keeps accepted receipt and event immutable', async () => {
  const f = await fixture(),
    receipt = await f.create();
  await request(app).post(`${f.path}/${receipt.id}/accept`).send({ revision: 0 }).expect(200);
  async function task(workspaceId: string) {
    const board = await admin.board.create({
      data: {
        workspaceId,
        name: 'Execution tasks',
        columns: { create: { name: 'Todo', position: 0 } },
      },
      include: { columns: true },
    });
    return admin.task.create({
      data: { title: 'Delivery task', columnId: board.columns[0].id, position: 0 },
    });
  }
  const local = await task(f.a),
    foreign = await task(f.b),
    path = `${f.path}/${receipt.id}/timeline`;
  const body = {
    kind: 'linked_task',
    taskId: local.id,
    evidence: 'Tracked work',
    occurredAt: '2026-11-08T10:00:00Z',
  };
  await request(app)
    .post(path)
    .send({ ...body, taskId: foreign.id })
    .expect(404);
  const created = await request(app)
    .post(path)
    .set('x-test-actor', 'editor')
    .send(body)
    .expect(201);
  await request(app).get(`/workspaces/${f.b}/decisions/${receipt.id}/timeline`).expect(404);
  const foreignRows = await db.withTenantTransaction(
    f.b,
    (tx) => tx.$queryRaw`SELECT id FROM "DecisionExecutionEvent" WHERE id=${created.body.id}`,
  );
  expect(foreignRows).toEqual([]);
  await admin.task.update({ where: { id: local.id }, data: { title: 'Updated delivery' } });
  expect((await request(app).get(path).set('x-test-actor', 'viewer').expect(200)).body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ taskTitle: 'Updated delivery', createdBy: 'editor' }),
    ]),
  );
  expect(
    await db.withTenantTransaction(
      f.a,
      (tx) =>
        tx.$executeRaw`UPDATE "DecisionExecutionEvent" SET evidence='rewritten' WHERE id=${created.body.id}`,
    ),
  ).toBe(0);
  expect(
    await db.withTenantTransaction(
      f.a,
      (tx) => tx.$executeRaw`DELETE FROM "DecisionExecutionEvent" WHERE id=${created.body.id}`,
    ),
  ).toBe(0);
  await request(app)
    .patch(`${f.path}/${receipt.id}`)
    .send({ ...f.input, revision: 1 })
    .expect(409);
  await request(app).delete(`${f.path}/${receipt.id}`).send({ revision: 1 }).expect(409);
  await admin.task.delete({ where: { id: local.id } });
  expect((await request(app).get(path).expect(200)).body).toEqual([]);
});
it('preserves existing workspace deletion with timeline evidence', async () => {
  const f = await fixture(),
    receipt = await f.create();
  await request(app).post(`${f.path}/${receipt.id}/accept`).send({ revision: 0 }).expect(200);
  await request(app)
    .post(`${f.path}/${receipt.id}/timeline`)
    .send({
      kind: 'human_assertion',
      evidence: 'Workspace evidence',
      occurredAt: '2026-11-08T10:00:00Z',
    })
    .expect(201);
  await request(app).delete(`/workspaces/${f.a}`).set('x-test-actor', 'viewer').expect(403);
  await request(app).delete(`/workspaces/${f.a}`).expect(200);
  const rows = await admin.$queryRaw<
    { count: bigint }[]
  >`SELECT count(*)::bigint AS count FROM "DecisionExecutionEvent" WHERE "workspaceId"=${f.a}`;
  expect(rows[0].count).toBe(0n);
});
