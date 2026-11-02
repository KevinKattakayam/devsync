import express from 'express';
import request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { randomBytes } from 'crypto';
import { spawnSync } from 'child_process';
import {
  digestSource,
  digestPageSchema,
  digestPreferenceSchema,
  digestItemSchema,
  decodeDigestCursor,
  encodeDigestCursor,
} from '../services/async-digest';
import { createDocument } from '../controllers/document.controller';
import { createSnippet } from '../controllers/snippet.controller';
import { createTask } from '../controllers/task.controller';
import router from '../routes/async-digest.routes';
import { createTenantPrismaClient, TenantPrismaClient } from '../lib/tenant-prisma';
import { withDatabase } from '../lib/prisma';
import { errorMiddleware } from '../middleware/error.middleware';
jest.mock('../middleware/auth.middleware', () => ({
  authMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));
jest.mock('../lib/redis', () => ({ redis: {}, isRedisAvailable: async () => false }));
jest.mock('../lib/queue', () => ({
  QueueNames: { TASK_COMPLETION: 'fixture' },
  getQueue: jest.fn(),
}));
jest.mock('../socket', () => ({ emitWorkspace: jest.fn() }));
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
app.use('/workspaces/:workspaceId/digest', router);
app.post('/sources/:id/documents', createDocument);
app.post('/sources/:id/snippets', createSnippet);
app.post('/sources/columns/:columnId/tasks', createTask);
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
    `CREATE ROLE digest_runtime LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO digest_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO digest_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO digest_runtime`,
  );
  await client.end();
  const url = new URL(container.getConnectionUri());
  url.username = 'digest_runtime';
  url.password = password;
  db = createTenantPrismaClient(new PrismaClient({ datasourceUrl: url.toString() }));
  for (const id of ['owner', 'editor', 'viewer', 'foreign'])
    await admin.user.create({
      data: { id, clerkId: `digest-${id}`, email: `${id}@example.test` },
    });
});
afterAll(async () => {
  await db?.$disconnect();
  await admin?.$disconnect();
  await container?.stop();
});
beforeEach(() => {
  process.env.FEATURE_ASYNC_DIGEST = 'true';
});
afterAll(() => {
  delete process.env.FEATURE_ASYNC_DIGEST;
});

async function fixture() {
  const a = `digest-a-${++serial}`,
    b = `digest-b-${serial}`;
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
    data: { workspaceId: a, authorId: 'owner', title: 'Local evidence' },
  });
  const other = await admin.document.create({
    data: { workspaceId: b, authorId: 'owner', title: 'Private foreign evidence' },
  });
  const event = await admin.activity.create({
    data: {
      workspaceId: a,
      userId: 'owner',
      type: 'doc_created',
      message: 'recorded local creation',
      metadata: digestSource('document', doc.id, '0'),
    },
  });
  const path = `/workspaces/${a}/digest`;
  return { a, b, doc, other, event, path };
}
async function enable(path: string, actor = 'owner') {
  return digestPreferenceSchema.parse(
    (
      await request(app)
        .put(`${path}/preferences`)
        .set('x-test-actor', actor)
        .send({ enabled: true, expectedRevision: 0 })
        .expect(200)
    ).body,
  );
}
async function page(path: string, actor = 'owner', cursor?: string) {
  return digestPageSchema.parse(
    (
      await request(app)
        .get(`${path}/items`)
        .set('x-test-actor', actor)
        .query(cursor ? { cursor } : {})
        .expect(200)
    ).body,
  );
}
it('defaults off and requires personal opt in without creating a preference on read', async () => {
  delete process.env.FEATURE_ASYNC_DIGEST;
  await request(app).get('/workspaces/a/digest/preferences').expect(404);
  process.env.FEATURE_ASYNC_DIGEST = 'true';
  const f = await fixture();
  await request(app)
    .get(`${f.path}/preferences`)
    .expect(200, { enabled: false, revision: 0, acknowledgedAt: null, acknowledgedId: null });
  expect(await admin.asyncDigestPreference.count({ where: { workspaceId: f.a } })).toBe(0);
  await request(app).get(`${f.path}/items`).expect(409);
});
it('allows every reader to opt in only themselves and forces actor+tenant RLS', async () => {
  const f = await fixture();
  await enable(f.path, 'viewer');
  expect((await page(f.path, 'viewer')).items.map((i) => i.activityId)).toEqual([f.event.id]);
  await request(app)
    .get(`${f.path}/preferences`)
    .expect(200, { enabled: false, revision: 0, acknowledgedAt: null, acknowledgedId: null });
  await request(app)
    .put(`${f.path}/preferences`)
    .set('x-test-actor', 'viewer')
    .send({ enabled: true, expectedRevision: 1, userId: 'owner' })
    .expect(400);
  await request(app).get(`${f.path}/items`).set('x-test-actor', 'foreign').expect(403);
  expect(await db.asyncDigestPreference.findMany()).toEqual([]);
  expect(await db.withTenantTransaction(f.a, (tx) => tx.asyncDigestPreference.findMany())).toEqual(
    [],
  );
  const wrong = await db.withTenantTransaction(f.a, async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.digest_actor_id','owner',true)`;
    return tx.asyncDigestPreference.findMany();
  });
  expect(wrong).toEqual([]);
  await expect(
    db.withTenantTransaction(f.b, (tx) =>
      tx.asyncDigestPreference.create({ data: { workspaceId: f.a, userId: 'viewer' } }),
    ),
  ).rejects.toThrow();
});
it('uses actual recorded producer messages and immutable source IDs/revisions without a model', async () => {
  const f = await fixture();
  await request(app)
    .post(`/sources/${f.a}/documents`)
    .send({ title: 'Actual document source' })
    .expect(201);
  await request(app)
    .post(`/sources/${f.a}/snippets`)
    .send({ title: 'Actual snippet source', language: 'typescript', code: 'const value = 42;' })
    .expect(201);
  const board = await admin.board.create({
    data: { workspaceId: f.a, name: 'Sources', columns: { create: { name: 'Todo', position: 0 } } },
    include: { columns: true },
  });
  await request(app)
    .post(`/sources/columns/${board.columns[0].id}/tasks`)
    .send({ title: 'Actual task source' })
    .expect(201);
  await enable(f.path);
  const result = await page(f.path);
  expect(result.items).toHaveLength(4);
  for (const item of result.items) {
    const stored = await admin.activity.findUniqueOrThrow({ where: { id: item.activityId } });
    expect(item.message === stored.message).toBe(true);
    expect(item.recordedAt).toBe(stored.createdAt.toISOString());
    expect(item.source.revision.length > 0).toBe(true);
    const proof = digestItemSchema.parse(
      (await request(app).get(`${f.path}/events/${item.activityId}`).expect(200)).body,
    );
    expect(proof).toEqual(item);
  }
  expect(new Set(result.items.map((i) => i.source.kind))).toEqual(
    new Set(['document', 'snippet', 'task']),
  );
});
it('omits administrative, AI-authored, unlinked and cross-tenant forged events without counts/titles', async () => {
  const f = await fixture();
  for (const data of [
    {
      type: 'member_invited',
      message: 'private administrative data',
      metadata: digestSource('document', f.doc.id, '0'),
    },
    {
      type: 'task_completed',
      message: 'AI generated achievement claim',
      metadata: digestSource('document', f.doc.id, '0'),
    },
    { type: 'doc_created', message: 'Unlinked old event', metadata: {} },
    {
      type: 'doc_created',
      message: 'Private foreign evidence',
      metadata: digestSource('document', f.other.id, '0'),
    },
  ])
    await admin.activity.create({ data: { ...data, workspaceId: f.a, userId: 'owner' } });
  await enable(f.path, 'viewer');
  const result = await page(f.path, 'viewer');
  expect(result.items.map((i) => i.activityId)).toEqual([f.event.id]);
  expect(JSON.stringify(result).includes('Private foreign evidence')).toBe(false);
  expect(JSON.stringify(result).includes('private administrative data')).toBe(false);
  expect(Object.keys(result).sort()).toEqual([
    'from',
    'items',
    'nextCursor',
    'preferenceRevision',
    'until',
  ]);
  const foreign = await admin.activity.create({
    data: {
      workspaceId: f.b,
      userId: 'owner',
      type: 'doc_created',
      message: 'Foreign workspace event',
      metadata: digestSource('document', f.other.id, '0'),
    },
  });
  await request(app).get(`${f.path}/events/${foreign.id}`).expect(404);
});
it('rechecks archived/deleted sources on feed, proof and acknowledgment', async () => {
  const f = await fixture();
  const pref = await enable(f.path);
  await request(app).get(`${f.path}/events/${f.event.id}`).expect(200);
  await admin.document.update({ where: { id: f.doc.id }, data: { isArchived: true } });
  expect((await page(f.path)).items).toEqual([]);
  await request(app).get(`${f.path}/events/${f.event.id}`).expect(404);
  await request(app)
    .post(`${f.path}/acknowledge`)
    .send({ activityId: f.event.id, expectedRevision: pref.revision })
    .expect(404);
  const snippet = await admin.snippet.create({
    data: {
      workspaceId: f.a,
      authorId: 'owner',
      title: 'Deleted source',
      code: 'x',
      language: 'text',
    },
  });
  const event = await admin.activity.create({
    data: {
      workspaceId: f.a,
      userId: 'owner',
      type: 'snippet_created',
      message: 'recorded creation',
      metadata: digestSource('snippet', snippet.id, snippet.updatedAt.toISOString()),
    },
  });
  await admin.snippet.delete({ where: { id: snippet.id } });
  await request(app).get(`${f.path}/events/${event.id}`).expect(404);
});
it('paginates equal timestamps without duplication and advances only the viewing user checkpoint', async () => {
  const f = await fixture();
  await admin.activity.delete({ where: { id: f.event.id } });
  const stamp = new Date(Date.now() - 60000);
  for (let i = 0; i < 27; i++)
    await admin.activity.create({
      data: {
        id: `${f.a}-event-${String(i).padStart(2, '0')}`,
        workspaceId: f.a,
        userId: 'owner',
        type: 'doc_created',
        message: `Recorded fixture event ${i}`,
        createdAt: stamp,
        metadata: digestSource('document', f.doc.id, '0'),
      },
    });
  await enable(f.path);
  await enable(f.path, 'viewer');
  const first = await page(f.path);
  expect(first.items).toHaveLength(25);
  expect(first.nextCursor).not.toBeNull();
  const second = await page(f.path, 'owner', first.nextCursor!);
  expect(second.items).toHaveLength(2);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items, ...second.items].map((i) => i.activityId)).size).toBe(27);
  await request(app)
    .get(`${f.path}/items`)
    .set('x-test-actor', 'viewer')
    .query({ cursor: first.nextCursor })
    .expect(409);
  const last = first.items[first.items.length - 1];
  const marked = digestPreferenceSchema.parse(
    (
      await request(app)
        .post(`${f.path}/acknowledge`)
        .send({ activityId: last.activityId, expectedRevision: first.preferenceRevision })
        .expect(200)
    ).body,
  );
  expect(marked.acknowledgedId).toBe(last.activityId);
  expect((await page(f.path)).items.map((i) => i.activityId)).toEqual(
    second.items.map((i) => i.activityId),
  );
  expect((await page(f.path, 'viewer')).items).toHaveLength(25);
  await request(app).get(`${f.path}/items`).query({ cursor: first.nextCursor }).expect(409);
  const older = first.items[0];
  const retained = digestPreferenceSchema.parse(
    (
      await request(app)
        .post(`${f.path}/acknowledge`)
        .send({ activityId: older.activityId, expectedRevision: marked.revision })
        .expect(200)
    ).body,
  );
  expect(retained.acknowledgedId).toBe(last.activityId);
});
it('serializes first subscription races and rejects stale/foreign/expired cursor scopes', async () => {
  const f = await fixture();
  const races = await Promise.all(
    [true, false].map((enabled) =>
      request(app).put(`${f.path}/preferences`).send({ enabled, expectedRevision: 0 }),
    ),
  );
  expect(races.map((r) => r.status).sort()).toEqual([200, 409]);
  const current = digestPreferenceSchema.parse(
    (await request(app).get(`${f.path}/preferences`)).body,
  );
  if (!current.enabled)
    await request(app)
      .put(`${f.path}/preferences`)
      .send({ enabled: true, expectedRevision: current.revision })
      .expect(200);
  const result = await page(f.path);
  const sample = {
    workspaceId: f.a,
    userId: 'owner',
    revision: result.preferenceRevision,
    until: result.until,
    afterAt: result.items[0].recordedAt,
    afterId: result.items[0].activityId,
  };
  for (const value of [
    { ...sample, workspaceId: f.b },
    { ...sample, userId: 'viewer' },
    { ...sample, until: new Date(Date.now() - 3600000).toISOString() },
  ])
    await request(app)
      .get(`${f.path}/items`)
      .query({ cursor: encodeDigestCursor(value) })
      .expect(409);
  await request(app).get(`${f.path}/items`).query({ cursor: 'not-a-json-cursor' }).expect(400);
  expect(decodeDigestCursor(encodeDigestCursor(sample))).toEqual(sample);
});
it('bounds the delivery window, masks sensitive recorded text without storing a derivative and rechecks revocation', async () => {
  const f = await fixture();
  const synthetic = 'gh' + 'p_' + 'SyntheticFixture'.repeat(3);
  await admin.activity.update({ where: { id: f.event.id }, data: { message: synthetic } });
  await admin.activity.create({
    data: {
      workspaceId: f.a,
      userId: 'owner',
      type: 'doc_created',
      message: 'Outside window',
      createdAt: new Date(Date.now() - 8 * 86400000),
      metadata: digestSource('document', f.doc.id, '0'),
    },
  });
  await enable(f.path, 'viewer');
  const result = await page(f.path, 'viewer');
  expect(result.items).toHaveLength(1);
  expect(result.items[0].masked).toBe(true);
  expect(result.items[0].message.includes(synthetic)).toBe(false);
  await admin.workspaceMember.delete({
    where: { userId_workspaceId: { userId: 'viewer', workspaceId: f.a } },
  });
  await request(app).get(`${f.path}/items`).set('x-test-actor', 'viewer').expect(403);
  await request(app)
    .get(`${f.path}/events/${f.event.id}`)
    .set('x-test-actor', 'viewer')
    .expect(403);
  await admin.workspace.update({ where: { id: f.a }, data: { suspendedAt: new Date() } });
  await request(app).get(`${f.path}/preferences`).expect(403);
});
