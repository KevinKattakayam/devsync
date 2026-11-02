import express from 'express';
import request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { randomBytes } from 'crypto';
import { spawnSync } from 'child_process';
import { z } from 'zod';
import router from '../routes/decision-receipts.routes';
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
