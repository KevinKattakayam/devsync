import express from 'express';
import request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { randomBytes } from 'crypto';
import { spawnSync } from 'child_process';
import { z } from 'zod';
import { createSnippet, updateSnippet } from '../controllers/snippet.controller';
import { createRequestLogging, requestContext } from '../middleware/request-context.middleware';
import { refreshEmbedding } from '../services/embedding.service';
const logChunks: string[] = [];
const sink = {
  write: (line: string) => {
    logChunks.push(line);
  },
};

import router from '../routes/snippet-safety.routes';
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
app.use(requestContext, createRequestLogging(sink));
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
app.use('/workspaces/:workspaceId/snippet-safety', router);
app.post('/legacy/:id', createSnippet);
app.patch('/legacy/snippets/:snippetId', updateSnippet);
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
    `CREATE ROLE safety_runtime LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO safety_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO safety_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO safety_runtime`,
  );
  await client.end();
  const url = new URL(container.getConnectionUri());
  url.username = 'safety_runtime';
  url.password = password;
  db = createTenantPrismaClient(new PrismaClient({ datasourceUrl: url.toString() }));
  for (const id of ['owner', 'editor', 'viewer', 'foreign'])
    await admin.user.create({
      data: { id, clerkId: `safety-${id}`, email: `${id}@example.test` },
    });
});
afterAll(async () => {
  await db?.$disconnect();
  await admin?.$disconnect();
  await container?.stop();
});
beforeEach(() => {
  process.env.FEATURE_SNIPPET_SAFETY = 'true';
});
afterAll(() => {
  delete process.env.FEATURE_SNIPPET_SAFETY;
});

const saved = z.object({
  snippet: z.object({
    id: z.string(),
    code: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    updatedAt: z.string(),
  }),
  findings: z.array(z.object({ type: z.string(), maskedPreview: z.string() }).strict()),
});
function synthetic() {
  return 'gh' + 'p_' + 'SyntheticFixture'.repeat(3);
}
async function fixture() {
  const a = `safety-a-${++serial}`,
    b = `safety-b-${serial}`;
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
  const path = `/workspaces/${a}/snippet-safety`;
  const content = {
    title: 'A reviewed snippet',
    code: `const key = "${synthetic()}";`,
    language: 'typescript',
    description: 'A synthetic safety test',
  };
  return { a, b, path, content };
}
it('defaults off and rejects unconfirmed saves', async () => {
  delete process.env.FEATURE_SNIPPET_SAFETY;
  await request(app).post('/workspaces/a/snippet-safety/preflight').send({}).expect(404);
  process.env.FEATURE_SNIPPET_SAFETY = 'true';
  const f = await fixture();
  await request(app)
    .post(`${f.path}/save`)
    .send({ content: f.content, confirmRedaction: false })
    .expect(400);
});
it('previews without storing, then saves only masked content and finding metadata before indexing', async () => {
  const f = await fixture();
  const preview = await request(app)
    .post(`${f.path}/preflight`)
    .set('x-test-actor', 'editor')
    .send(f.content)
    .expect(200);
  expect(JSON.stringify(preview.body).includes(synthetic())).toBe(false);
  expect(await admin.snippet.count({ where: { workspaceId: f.a } })).toBe(0);
  const result = saved.parse(
    (
      await request(app)
        .post(`${f.path}/save`)
        .set('x-test-actor', 'editor')
        .set('Idempotency-Key', 'safety-create-fixture')
        .send({ content: f.content, confirmRedaction: true })
        .expect(201)
    ).body,
  );
  const row = await admin.snippet.findUniqueOrThrow({ where: { id: result.snippet.id } });
  const findings = await admin.snippetSafetyFinding.findMany({ where: { snippetId: row.id } });
  const receipts = await admin.apiIdempotencyRecord.findMany();
  const activities = await admin.activity.findMany({ where: { workspaceId: f.a } });
  expect(JSON.stringify([result, row, findings, receipts, activities]).includes(synthetic())).toBe(
    false,
  );
  expect(findings.map((r) => r.maskedPreview)).toEqual(['[REDACTED:github-token]']);
  const replay = saved.parse(
    (
      await request(app)
        .post(`${f.path}/save`)
        .set('x-test-actor', 'editor')
        .set('Idempotency-Key', 'safety-create-fixture')
        .send({ content: f.content, confirmRedaction: true })
        .expect(201)
    ).body,
  );
  expect(replay.snippet.id).toBe(row.id);
  let disclosed = false;
  await withDatabase(db, () =>
    refreshEmbedding('snippet', row.id, f.a, async (text) => {
      disclosed = true;
      expect(text.includes(synthetic())).toBe(false);
      return Array<number>(1536).fill(0.01);
    }),
  );
  expect(disclosed).toBe(true);
  expect(logChunks.join('').includes(synthetic())).toBe(false);
});
it('enforces viewer read-only, foreign membership, same-tenant edit/findings and forced RLS', async () => {
  const f = await fixture();
  const result = saved.parse(
    (
      await request(app)
        .post(`${f.path}/save`)
        .send({ content: f.content, confirmRedaction: true })
        .expect(201)
    ).body,
  );
  for (const actor of ['viewer', 'foreign']) {
    await request(app)
      .post(`${f.path}/preflight`)
      .set('x-test-actor', actor)
      .send(f.content)
      .expect(403);
    await request(app)
      .post(`${f.path}/save`)
      .set('x-test-actor', actor)
      .send({ content: f.content, confirmRedaction: true })
      .expect(403);
    await request(app)
      .post(`${f.path}/save`)
      .set('x-test-actor', actor)
      .send({
        content: f.content,
        confirmRedaction: true,
        snippetId: result.snippet.id,
        expectedUpdatedAt: result.snippet.updatedAt,
      })
      .expect(403);
  }
  await request(app)
    .get(`${f.path}/findings`)
    .set('x-test-actor', 'viewer')
    .query({ snippetId: result.snippet.id })
    .expect(200);
  await request(app)
    .get(`${f.path}/findings`)
    .set('x-test-actor', 'foreign')
    .query({ snippetId: result.snippet.id })
    .expect(403);
  const other = `/workspaces/${f.b}/snippet-safety`;
  await request(app).get(`${other}/findings`).query({ snippetId: result.snippet.id }).expect(404);
  await request(app)
    .post(`${other}/save`)
    .send({
      content: f.content,
      confirmRedaction: true,
      snippetId: result.snippet.id,
      expectedUpdatedAt: result.snippet.updatedAt,
    })
    .expect(404);
  expect(await db.snippetSafetyFinding.findMany()).toEqual([]);
  expect(await db.withTenantTransaction(f.b, (tx) => tx.snippetSafetyFinding.findMany())).toEqual(
    [],
  );
  await expect(
    db.withTenantTransaction(f.b, (tx) =>
      tx.snippetSafetyFinding.create({
        data: {
          snippetId: result.snippet.id,
          workspaceId: f.b,
          type: 'github-token',
          maskedPreview: '[REDACTED:github-token]',
        },
      }),
    ),
  ).rejects.toThrow();
});
it('rescans edits, rejects stale saves and prevents legacy write bypass without storing raw values', async () => {
  const f = await fixture();
  await request(app).post(`/legacy/${f.a}`).send(f.content).expect(400);
  await request(app)
    .post(`/legacy/${f.a}`)
    .set('x-test-actor', 'viewer')
    .send(f.content)
    .expect(403);
  expect(await admin.snippet.count({ where: { workspaceId: f.a } })).toBe(0);
  const created = saved.parse(
    (
      await request(app)
        .post(`${f.path}/save`)
        .send({ content: { ...f.content, code: 'const value = 42;' }, confirmRedaction: true })
        .expect(201)
    ).body,
  );
  await request(app)
    .patch(`/legacy/snippets/${created.snippet.id}`)
    .send({ code: f.content.code })
    .expect(400);
  const edited = saved.parse(
    (
      await request(app)
        .post(`${f.path}/save`)
        .set('x-test-actor', 'editor')
        .send({
          content: f.content,
          confirmRedaction: true,
          snippetId: created.snippet.id,
          expectedUpdatedAt: created.snippet.updatedAt,
        })
        .expect(200)
    ).body,
  );
  expect(edited.snippet.code.includes(synthetic())).toBe(false);
  await request(app)
    .post(`${f.path}/save`)
    .send({
      content: f.content,
      confirmRedaction: true,
      snippetId: created.snippet.id,
      expectedUpdatedAt: created.snippet.updatedAt,
    })
    .expect(409);
  expect(
    JSON.stringify(await admin.snippet.findUnique({ where: { id: created.snippet.id } })).includes(
      synthetic(),
    ),
  ).toBe(false);
  const cleared = saved.parse(
    (
      await request(app)
        .post(`${f.path}/save`)
        .send({
          content: { title: f.content.title, code: 'const clean = 1;', language: 'typescript' },
          confirmRedaction: true,
          snippetId: created.snippet.id,
          expectedUpdatedAt: edited.snippet.updatedAt,
        })
        .expect(200)
    ).body,
  );
  expect(cleared.snippet.description).toBeNull();
});
it('masks title and description without leaking values in errors/activity and denies revoked principals', async () => {
  const f = await fixture();
  const result = saved.parse(
    (
      await request(app)
        .post(`${f.path}/save`)
        .send({
          content: { ...f.content, title: synthetic(), description: synthetic() },
          confirmRedaction: true,
        })
        .expect(201)
    ).body,
  );
  expect(JSON.stringify(result).includes(synthetic())).toBe(false);
  await admin.workspaceMember.delete({
    where: { userId_workspaceId: { userId: 'editor', workspaceId: f.a } },
  });
  await request(app)
    .post(`${f.path}/preflight`)
    .set('x-test-actor', 'editor')
    .send(f.content)
    .expect(403);
  await admin.workspace.update({ where: { id: f.a }, data: { suspendedAt: new Date() } });
  await request(app).get(`${f.path}/findings`).query({ snippetId: result.snippet.id }).expect(403);
  expect(logChunks.join('').includes(synthetic())).toBe(false);
});

it('fails closed when masking expands a field past its transport limit and rejects raw preview storage', async () => {
  const f = await fixture();
  const value = 'password="' + 'example1' + '"' + 'x'.repeat(181);
  expect(value.length).toBe(200);
  await request(app)
    .post(`${f.path}/preflight`)
    .send({ ...f.content, title: value })
    .expect(400);
  await request(app)
    .post(`${f.path}/save`)
    .send({ content: { ...f.content, title: value }, confirmRedaction: true })
    .expect(400);
  expect(await admin.snippet.count({ where: { workspaceId: f.a } })).toBe(0);
  const created = saved.parse(
    (
      await request(app)
        .post(`${f.path}/save`)
        .send({ content: f.content, confirmRedaction: true })
        .expect(201)
    ).body,
  );
  await expect(
    admin.snippetSafetyFinding.create({
      data: {
        snippetId: created.snippet.id,
        workspaceId: f.a,
        type: 'github-token',
        maskedPreview: synthetic(),
      },
    }),
  ).rejects.toThrow();
});
