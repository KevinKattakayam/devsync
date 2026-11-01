import express from 'express';
import request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Prisma, PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { randomBytes, createHash, createHmac } from 'crypto';
import Stripe from 'stripe';
import { spawnSync } from 'child_process';
import { createServer } from 'http';
import WebSocket from 'ws';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { createTenantPrismaClient, TenantPrismaClient } from '../lib/tenant-prisma';
import { withDatabase } from '../lib/prisma';
import { logger } from '../observability/logger';
import { idempotentCreate } from '../lib/create-idempotency';
import * as documents from '../controllers/document.controller';
import * as snippets from '../controllers/snippet.controller';
import * as tasks from '../controllers/task.controller';
import * as workspaces from '../controllers/workspace.controller';
import * as repositories from '../controllers/github-repository.controller';
import { aiComplete } from '../controllers/ai.controller';
import { meteredAiRequest } from '../middleware/billing.middleware';
import { createIngestionRouter } from '../routes/ingestion.routes';
import { ingestDocument } from '../services/ingestion.service';
import { workspaceSearch } from '../controllers/search.controller';
import { reconcileOfflineAiActions } from '../services/crdt-sync.service';
import { recordTokenUsage } from '../services/billing.service';
import { errorMiddleware } from '../middleware/error.middleware';
import { withWorkspaceAccess, WRITE_ROLES } from '../security/workspace-policy';
import { createCollaborationServer } from '../services/collaboration-server';
import { CrdtJournal } from '../services/crdt-journal';
import { projectDocument } from '../services/crdt-schema';
import { processTaskCompletion } from '../agents/task-completion.agent';
import { completeWithFallback } from '../services/ai-gateway.service';
import scimRouter from '../routes/scim.routes';
import githubRouter from '../routes/github-webhook.routes';
import stripeRouter from '../routes/stripe.webhook';
import superadminRouter from '../routes/superadmin.routes';
import { processPRSummary, PRSummaryJobData } from '../agents/pr-summary.agent';
import { startEmbeddingPolling } from '../services/embedding-runner';
import { getMe, updateMe } from '../controllers/auth.controller';
import { withIdentityProfileAccess } from '../security/service-policy';
import {
  queueEmbedding,
  refreshEmbedding,
  claimEmbeddingJobs,
  acknowledgeEmbeddingJob,
  processEmbeddingJobs,
} from '../services/embedding.service';
jest.mock('@clerk/express', () => ({
  ...jest.requireActual<typeof import('@clerk/express')>('@clerk/express'),
  getAuth: (req: express.Request) => ({ userId: req.header('x-verified-clerk-fixture') || null }),
}));
jest.mock('../lib/queue', () => ({
  QueueNames: { PR_SUMMARY: 'fixture-pr', TASK_COMPLETION: 'fixture-task' },
  getQueue: () => ({ getWaitingCount: async () => 0 }),
}));
jest.mock('../services/ai-gateway.service', () => ({ completeWithFallback: jest.fn() }));
jest.mock(
  'openai',
  () =>
    class FixtureOpenAI {
      embeddings = {
        create: async () => ({ data: [{ embedding: Array<number>(1536).fill(0.01) }] }),
      };
    },
);
jest.mock(
  'groq-sdk',
  () =>
    class FixtureGroq {
      chat = {
        completions: {
          async *create() {
            yield { choices: [{ delta: { content: 'Fixture AI response' } }] };
          },
        },
      };
    },
);
jest.mock('../lib/redis', () => ({
  redis: { options: { host: 'localhost', port: 6379 } },
  isRedisAvailable: async () => false,
}));
jest.setTimeout(90000);
let postgres: StartedPostgreSqlContainer;
let admin: PrismaClient;
let db: TenantPrismaClient;
let sequence = 0;
const app = express();
app.use(
  express.json({
    verify: (req, _res, raw) => {
      (req as express.Request).rawBody = raw;
    },
  }),
);
// Identity adapter is test-fixture-only; production app/server has no such header.
app.use((req, _res, next) =>
  withDatabase(db, () => {
    req.user = {
      userId: req.header('x-fixture-actor') || 'owner',
      clerkId: 'fixture',
      email: 'fixture@example.test',
    };
    req.log = logger;
    next();
  }),
);
app.use('/scim/v2', scimRouter);
app.get('/auth/me', getMe);
app.patch('/auth/me', updateMe);
app.use('/github', githubRouter);
app.use('/stripe', stripeRouter);
app.use('/superadmin', superadminRouter);
app.post('/workspaces', workspaces.createWorkspace);
app.get('/workspaces', workspaces.getWorkspaces);
app.get('/workspaces/:id', workspaces.getWorkspace);
app.patch('/workspaces/:id', workspaces.updateWorkspace);
app.delete('/workspaces/:id', workspaces.deleteWorkspace);
app.post('/workspaces/:id/invite', workspaces.inviteMember);
app.patch('/workspaces/:id/members/:memberId', workspaces.updateMemberRole);
app.delete('/workspaces/:id/members/:memberId', workspaces.removeMember);
app.get('/workspaces/:id/activities', workspaces.getActivities);
app.get('/workspaces/:id/repositories', repositories.listRepositories);
app.post('/workspaces/:id/repositories', repositories.connectRepository);
app.patch('/workspaces/:id/repositories/:repositoryId', repositories.updateRepository);
app.delete('/workspaces/:id/repositories/:repositoryId', repositories.disconnectRepository);
app.get('/workspaces/:id/documents', documents.getDocuments);
app.post('/ai/complete', meteredAiRequest, aiComplete);
app.get('/workspaces/:id/search', workspaceSearch);
app.use(createIngestionRouter((_req, _res, next) => next()));
app.get('/documents/:id', documents.getDocument);
app.post('/workspaces/:id/documents', documents.createDocument);
app.post('/api/workspaces/:id/documents', documents.createDocument);
app.post('/api/v1/workspaces/:id/documents', documents.createDocument);
app.patch('/documents/:id', documents.updateDocument);
app.put('/documents/:id/content', documents.updateDocument);
app.delete('/documents/:id', documents.deleteDocument);
app.get('/workspaces/:id/snippets', snippets.getSnippets);
app.post('/workspaces/:id/snippets', snippets.createSnippet);
app.patch('/snippets/:snippetId', snippets.updateSnippet);
app.delete('/snippets/:snippetId', snippets.deleteSnippet);
app.get('/workspaces/:id/boards', tasks.getBoards);
app.post('/workspaces/:id/boards', tasks.createBoard);
app.post('/boards/:boardId/columns', tasks.createColumn);
app.patch('/columns/:columnId', tasks.updateColumn);
app.delete('/columns/:columnId', tasks.deleteColumn);
app.post('/columns/:columnId/tasks', tasks.createTask);
app.patch('/tasks/:taskId', tasks.updateTask);
app.patch('/tasks/:taskId/move', tasks.moveTask);
app.delete('/tasks/:taskId', tasks.deleteTask);
app.use(errorMiddleware);
beforeAll(async () => {
  postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  const migration = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { env: { ...process.env, DATABASE_URL: postgres.getConnectionUri() }, encoding: 'utf8' },
  );
  if (migration.status !== 0) throw new Error(migration.stderr);
  admin = new PrismaClient({ datasourceUrl: postgres.getConnectionUri() });
  const connection = new Client({ connectionString: postgres.getConnectionUri() });
  await connection.connect();
  const password = randomBytes(24).toString('hex');
  await connection.query(
    `CREATE ROLE resource_runtime LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO resource_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO resource_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO resource_runtime`,
  );
  await connection.end();
  const url = new URL(postgres.getConnectionUri());
  url.username = 'resource_runtime';
  url.password = password;
  db = createTenantPrismaClient(new PrismaClient({ datasourceUrl: url.toString() }));
  for (const id of ['owner', 'editor', 'viewer', 'foreign', 'inactive', 'superadmin'])
    await admin.user.create({
      data: {
        id,
        clerkId: `fixture_${id}`,
        email: `${id}@example.test`,
        name: id,
        isActive: id !== 'inactive',
        systemRole: id === 'superadmin' ? 'SUPER_ADMIN' : 'USER',
      },
    });
  jest
    .mocked(completeWithFallback)
    .mockResolvedValue({ content: 'Fixture summary.', provider: 'groq', tokens: 1 } as Awaited<
      ReturnType<typeof completeWithFallback>
    >);
});
afterAll(async () => {
  await db?.$disconnect();
  await admin?.$disconnect();
  await postgres?.stop();
});
async function fixture() {
  const a = `resource-a-${++sequence}`,
    b = `resource-b-${sequence}`;
  for (const id of [a, b]) {
    await admin.workspace.create({
      data: {
        id,
        slug: id,
        name: id,
        members: {
          create:
            id === a
              ? [
                  { userId: 'owner', role: 'OWNER' },
                  { userId: 'editor', role: 'EDITOR' },
                  { userId: 'viewer', role: 'VIEWER' },
                  { userId: 'inactive', role: 'EDITOR' },
                ]
              : [{ userId: 'foreign', role: 'OWNER' }],
        },
      },
    });
    await admin.document.create({
      data: { id: `doc-${id}`, title: 'Document', workspaceId: id, authorId: 'owner' },
    });
    await admin.snippet.create({
      data: {
        id: `snippet-${id}`,
        title: 'Snippet',
        code: 'const n = 1;',
        language: 'javascript',
        authorId: 'owner',
        workspaceId: id,
      },
    });
    await admin.board.create({
      data: {
        id: `board-${id}`,
        name: 'Board',
        workspaceId: id,
        columns: {
          create: [
            {
              id: `column-${id}`,
              name: 'To Do',
              position: 0,
              tasks: { create: { id: `task-${id}`, title: 'Task', position: 0 } },
            },
            { id: `target-${id}`, name: 'Done', position: 1 },
          ],
        },
      },
    });
  }
  return { a, b };
}
const writes = [
  ['post', '/workspaces/TEAM/documents', { title: 'New' }],
  ['patch', '/documents/doc-TEAM', { title: 'Changed' }],
  ['delete', '/documents/doc-TEAM', {}],
  [
    'post',
    '/workspaces/TEAM/snippets',
    { title: 'New', language: 'typescript', code: 'let n = 1;' },
  ],
  ['patch', '/snippets/snippet-TEAM', { code: 'let changed = 1;' }],
  ['delete', '/snippets/snippet-TEAM', {}],
  ['post', '/workspaces/TEAM/boards', { name: 'New' }],
  ['post', '/boards/board-TEAM/columns', { name: 'New' }],
  ['patch', '/columns/column-TEAM', { name: 'Changed' }],
  ['delete', '/columns/column-TEAM', {}],
  ['post', '/columns/column-TEAM/tasks', { title: 'New' }],
  ['patch', '/tasks/task-TEAM', { title: 'Changed' }],
  ['patch', '/tasks/task-TEAM/move', { columnId: 'target-TEAM', position: 0 }],
  ['delete', '/tasks/task-TEAM', {}],
] as const;
async function state(workspaceId: string) {
  return Promise.all([
    admin.document.findMany({ where: { workspaceId } }),
    admin.snippet.findMany({ where: { workspaceId } }),
    admin.board.findMany({
      where: { workspaceId },
      include: { columns: { include: { tasks: true } } },
    }),
    admin.activity.findMany({ where: { workspaceId } }),
  ]);
}
function bodyFor(body: object, team: string): object {
  return JSON.parse(JSON.stringify(body).replace(/TEAM/g, team)) as object;
}
it.each(writes)(
  'D07/G01 denies foreign, viewer and inactive %s %s without writes',
  async (method, path, body) => {
    const { a, b } = await fixture();
    for (const [actor, team] of [
      ['owner', b],
      ['viewer', a],
      ['inactive', a],
    ] as const) {
      const before = await state(team);
      const response = await request(app)
        [method](path.replace(/TEAM/g, team))
        .set('x-fixture-actor', actor)
        .send({ ...bodyFor(body, team), role: 'OWNER', workspaceId: a, userId: 'owner' });
      expect(response.status).toBe(403);
      expect(await state(team)).toEqual(before);
    }
  },
);
it.each(writes)('G01 permits tenant editor %s %s under forced RLS', async (method, path, body) => {
  const { a } = await fixture();
  const response = await request(app)
    [method](path.replace(/TEAM/g, a))
    .set('x-fixture-actor', 'editor')
    .send(bodyFor(body, a));
  expect(response.status).toBe(method === 'post' ? 201 : 200);
});
it.each([
  '/workspaces/TEAM/documents',
  '/workspaces/TEAM/snippets',
  '/workspaces/TEAM/boards',
  '/documents/doc-TEAM',
])('G01 read policy protects %s while allowing viewers', async (path) => {
  const { a, b } = await fixture();
  expect((await request(app).get(path.replace(/TEAM/g, b))).status).toBe(403);
  expect(
    (await request(app).get(path.replace(/TEAM/g, a)).set('x-fixture-actor', 'viewer')).status,
  ).toBe(200);
});
it('D09 rejects foreign assignees and columns through create, patch and move', async () => {
  const { a, b } = await fixture();
  for (const [method, path, data] of [
    ['post', `/columns/column-${a}/tasks`, { title: 'Attack', assigneeId: 'foreign' }],
    ['patch', `/tasks/task-${a}`, { assigneeId: 'foreign' }],
    ['patch', `/tasks/task-${a}`, { columnId: `column-${b}` }],
    ['patch', `/tasks/task-${a}/move`, { columnId: `column-${b}`, position: 0 }],
  ] as const)
    expect((await request(app)[method](path).send(data)).status).toBe(403);
  expect((await request(app).patch(`/tasks/task-${a}`).send({ assigneeId: 'viewer' })).status).toBe(
    200,
  );
});
it('G01 locks membership through commit and rejects the removed editor afterward', async () => {
  const { a } = await fixture();
  let release!: () => void, entered!: () => void;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  const authorized = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const mutation = withWorkspaceAccess(
    'editor',
    a,
    WRITE_ROLES,
    async (tx) => {
      entered();
      await paused;
      await tx.document.update({
        where: { id: `doc-${a}` },
        data: { title: 'Committed before removal' },
      });
    },
    db,
  );
  await authorized;
  let removed = false;
  const removal = admin.workspaceMember
    .delete({ where: { userId_workspaceId: { userId: 'editor', workspaceId: a } } })
    .then(() => {
      removed = true;
    });
  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(removed).toBe(false);
  } finally {
    release();
  }
  await mutation;
  await removal;
  expect(
    (
      await request(app)
        .patch(`/documents/doc-${a}`)
        .set('x-fixture-actor', 'editor')
        .send({ title: 'Must reject' })
    ).status,
  ).toBe(403);
});
it('G06 rejects stale replacement and unsafe URLs, and stores accepted content as CRDT state', async () => {
  const { a } = await fixture();
  const url = `/documents/doc-${a}/content`;
  const content = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Canonical REST text' }] }],
  };
  expect((await request(app).put(url).send({ content })).status).toBe(409);
  const accepted = await request(app).put(url).send({ content, crdtRevision: 0 });
  expect(accepted.status).toBe(200);
  expect(accepted.body.crdtRevision).toBe(1);
  expect((await request(app).put(url).send({ content, crdtRevision: 0 })).status).toBe(409);
  const state = new Y.Doc();
  try {
    Y.applyUpdate(
      state,
      await new CrdtJournal(db).load({ workspaceId: a, documentId: `doc-${a}` }),
    );
    expect(JSON.stringify(projectDocument(state))).toContain('Canonical REST text');
  } finally {
    state.destroy();
  }
  expect(
    (
      await request(app)
        .put(url)
        .send({
          content: {
            type: 'doc',
            content: [{ type: 'image', attrs: { src: 'javascript:alert(1)' } }],
          },
          crdtRevision: 1,
        })
    ).status,
  ).toBe(400);
});
async function until(check: () => boolean | Promise<boolean>, label: string) {
  const end = Date.now() + 7000;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(label);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
it('G06 sends canonical REST and authorized agent changes to live rooms on two instances', async () => {
  const { a, b } = await fixture();
  await admin.document.update({ where: { id: `doc-${a}` }, data: { title: 'AI Agent Summaries' } });
  const nodes: {
    http: ReturnType<typeof createServer>;
    runtime: ReturnType<typeof createCollaborationServer>;
    provider: HocuspocusProvider;
    websocket: HocuspocusProviderWebsocket;
    document: Y.Doc;
  }[] = [];
  try {
    for (let i = 0; i < 2; i++) {
      const http = createServer();
      const runtime = createCollaborationServer(http, {
        db,
        async identify(token) {
          if (token !== 'editor') throw new Error('Invalid fixture');
          return { id: token, name: token, expiresAt: Date.now() + 60000 };
        },
      });
      await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
      const address = http.address();
      if (!address || typeof address === 'string') throw new Error('Missing fixture address');
      const document = new Y.Doc();
      const websocket = new HocuspocusProviderWebsocket({
        url: `ws://127.0.0.1:${address.port}/yjs`,
        WebSocketPolyfill: WebSocket,
      });
      const provider = new HocuspocusProvider({
        websocketProvider: websocket,
        name: `document:${a}:doc-${a}`,
        token: 'editor',
        document,
      });
      provider.attach();
      nodes.push({ http, runtime, provider, websocket, document });
      await until(() => provider.synced, 'Initial sync');
    }
    const data = {
      taskId: `task-${a}`,
      taskTitle: 'Ignore spoofed title',
      taskKey: null,
      columnName: 'Done',
      workspaceId: a,
      actorId: 'editor',
    };
    await withDatabase(db, () => processTaskCompletion({ data }));
    await until(
      () =>
        nodes.every((node) =>
          JSON.stringify(projectDocument(node.document)).includes('Fixture summary.'),
        ),
      'Agent did not reach both live rooms',
    );
    const latest = await admin.document.findUniqueOrThrow({ where: { id: `doc-${a}` } });
    const content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'REST replacement' }] }],
    };
    expect(
      (
        await request(app)
          .patch(`/documents/doc-${a}`)
          .send({ content, crdtRevision: latest.crdtRevision })
      ).status,
    ).toBe(200);
    await until(
      () =>
        nodes.every((node) =>
          JSON.stringify(projectDocument(node.document)).includes('REST replacement'),
        ),
      'REST did not reach both live rooms',
    );
    for (const actorId of ['viewer', 'foreign'])
      await expect(
        withDatabase(db, () => processTaskCompletion({ data: { ...data, actorId } })),
      ).rejects.toThrow('Access denied');
    await expect(
      withDatabase(db, () => processTaskCompletion({ data: { ...data, taskId: `task-${b}` } })),
    ).rejects.toThrow('Access denied');
    jest.mocked(completeWithFallback).mockImplementationOnce(async () => {
      await admin.workspaceMember.update({
        where: { userId_workspaceId: { userId: 'editor', workspaceId: a } },
        data: { role: 'VIEWER' },
      });
      return { content: 'Must not commit', provider: 'groq', tokens: 1 } as Awaited<
        ReturnType<typeof completeWithFallback>
      >;
    });
    await expect(withDatabase(db, () => processTaskCompletion({ data }))).rejects.toThrow(
      'Access denied',
    );
    expect(
      JSON.stringify(
        (await admin.document.findUniqueOrThrow({ where: { id: `doc-${a}` } })).content,
      ),
    ).not.toContain('Must not commit');
  } finally {
    for (const node of nodes) {
      node.provider.destroy();
      node.websocket.destroy();
      node.document.destroy();
      await node.runtime.stop();
      await new Promise<void>((resolve) => node.http.close(() => resolve()));
    }
  }
});

const workspaceWrites = [
  ['patch', '/workspaces/TEAM', { name: 'Changed workspace' }],
  ['delete', '/workspaces/TEAM', {}],
  ['post', '/workspaces/TEAM/invite', { email: 'foreign@example.test', role: 'VIEWER' }],
  ['patch', '/workspaces/TEAM/members/MEMBER', { role: 'VIEWER' }],
  ['delete', '/workspaces/TEAM/members/MEMBER', {}],
  [
    'post',
    '/workspaces/TEAM/repositories',
    {
      repositoryId: 'new-TEAM',
      owner: 'fixture',
      name: 'new-TEAM',
      webhookSecret: 'fixture-webhook-secret',
      prOpenedColumnId: 'column-TEAM',
    },
  ],
  ['patch', '/workspaces/TEAM/repositories/repo-TEAM', { name: 'updated-TEAM' }],
  ['delete', '/workspaces/TEAM/repositories/repo-TEAM', {}],
] as const;
async function repositoryFixture(workspaceId: string) {
  return admin.gitHubRepository.create({
    data: {
      id: `repo-${workspaceId}`,
      repositoryId: `external-${workspaceId}`,
      owner: 'fixture',
      name: workspaceId,
      webhookSecret: 'fixture-webhook-secret',
      workspaceId,
    },
  });
}
it.each(workspaceWrites)(
  'D05/D10 central workspace policy denies foreign/editor/viewer/inactive %s %s',
  async (method, path, body) => {
    const { a, b } = await fixture();
    await repositoryFixture(a);
    await repositoryFixture(b);
    for (const [actor, team] of [
      ['owner', b],
      ['editor', a],
      ['viewer', a],
      ['inactive', a],
    ] as const) {
      const member = await admin.workspaceMember.findFirstOrThrow({
        where: { workspaceId: team, userId: team === a ? 'editor' : 'foreign' },
      });
      const before = await admin.workspace.findUniqueOrThrow({
        where: { id: team },
        include: { members: true, githubRepositories: true },
      });
      const response = await request(app)
        [method](path.replace(/TEAM/g, team).replace('MEMBER', member.id))
        .set('x-fixture-actor', actor)
        .send(bodyFor(body, team));
      expect(response.status).toBe(403);
      expect(
        await admin.workspace.findUniqueOrThrow({
          where: { id: team },
          include: { members: true, githubRepositories: true },
        }),
      ).toEqual(before);
    }
  },
);
it.each(workspaceWrites)(
  'D05/D10 central workspace policy permits owner %s %s',
  async (method, path, body) => {
    const { a } = await fixture();
    await repositoryFixture(a);
    const member = await admin.workspaceMember.findUniqueOrThrow({
      where: { userId_workspaceId: { workspaceId: a, userId: 'editor' } },
    });
    process.env.ENCRYPTION_KEY = 'ab'.repeat(32); // Fixture-only encryption key, never used by the app entrypoint.
    const response = await request(app)
      [method](path.replace(/TEAM/g, a).replace('MEMBER', member.id))
      .send(bodyFor(body, a));
    expect(response.status).toBe(
      method === 'post' ? 201 : path.includes('repositories') && method === 'delete' ? 204 : 200,
    );
  },
);
it('D05 binds member and repository IDs even when the caller owns the URL workspace', async () => {
  const { a, b } = await fixture();
  const repository = await repositoryFixture(b);
  const member = await admin.workspaceMember.findFirstOrThrow({ where: { workspaceId: b } });
  for (const method of ['patch', 'delete'] as const) {
    expect(
      (await request(app)[method](`/workspaces/${a}/members/${member.id}`).send({ role: 'OWNER' }))
        .status,
    ).toBe(404);
    expect(
      (
        await request(app)
          [method](`/workspaces/${a}/repositories/${repository.id}`)
          .send({ name: 'forged' })
      ).status,
    ).toBe(404);
  }
  expect(
    (
      await request(app)
        .post(`/workspaces/${a}/repositories`)
        .send({
          repositoryId: 'forged',
          owner: 'fixture',
          name: 'forged',
          webhookSecret: 'fixture-secret-123',
          prOpenedColumnId: `column-${b}`,
        })
    ).status,
  ).toBe(403);
});
it('D10 parallel demotions preserve at least one owner and recheck policy at commit', async () => {
  const { a } = await fixture();
  await admin.workspaceMember.update({
    where: { userId_workspaceId: { workspaceId: a, userId: 'editor' } },
    data: { role: 'OWNER' },
  });
  const owners = await admin.workspaceMember.findMany({ where: { workspaceId: a, role: 'OWNER' } });
  const responses = await Promise.all(
    owners.map((member) =>
      request(app)
        .patch(`/workspaces/${a}/members/${member.id}`)
        .set('x-fixture-actor', member.userId)
        .send({ role: 'EDITOR' }),
    ),
  );
  expect(responses.map((response) => response.status).sort()).toEqual([200, 403]);
  expect(await admin.workspaceMember.count({ where: { workspaceId: a, role: 'OWNER' } })).toBe(1);
});
it('G01 workspace creation authorizes the active principal and assigns only that principal ownership', async () => {
  expect(
    (
      await request(app)
        .post('/workspaces')
        .set('x-fixture-actor', 'inactive')
        .send({ name: 'Denied' })
    ).status,
  ).toBe(403);
  const response = await request(app)
    .post('/workspaces')
    .set('x-fixture-actor', 'editor')
    .send({ name: 'Fixture workspace', userId: 'foreign', role: 'OWNER', workspaceId: 'forged' });
  expect(response.status).toBe(201);
  expect(response.body.members).toHaveLength(1);
  expect(response.body.members[0]).toMatchObject({ userId: 'editor', role: 'OWNER' });
  expect(
    await admin.activity.count({
      where: { workspaceId: response.body.id as string, type: 'workspace_created' },
    }),
  ).toBe(1);
});
it.each(['/workspaces/TEAM', '/workspaces/TEAM/activities', '/workspaces/TEAM/repositories'])(
  'G01 central workspace read policy protects %s',
  async (path) => {
    const { a, b } = await fixture();
    expect((await request(app).get(path.replace(/TEAM/g, b))).status).toBe(403);
    expect(
      (await request(app).get(path.replace(/TEAM/g, a)).set('x-fixture-actor', 'viewer')).status,
    ).toBe(path.endsWith('/repositories') ? 403 : 200);
    expect((await request(app).get(path.replace(/TEAM/g, a))).status).toBe(200);
  },
);

it('G01/E03 ingestion rejects foreign/viewer/inactive before buffering and commits canonical state for an editor', async () => {
  const { a, b } = await fixture();
  for (const [actor, workspaceId] of [
    ['owner', b],
    ['viewer', a],
    ['inactive', a],
  ] as const) {
    const result = await request(app)
      .post(`/workspaces/${workspaceId}/documents/ingest`)
      .set('x-fixture-actor', actor)
      .attach('file', Buffer.from('Invalid MIME must not be reached'), {
        filename: 'fixture.exe',
        contentType: 'application/x-forbidden',
      });
    expect(result.status).toBe(403);
    await expect(
      withDatabase(db, () =>
        ingestDocument(Buffer.from('text'), 'text/plain', 'fixture.txt', workspaceId, actor),
      ),
    ).rejects.toThrow('Access denied');
  }
  const result = await request(app)
    .post(`/workspaces/${a}/documents/ingest`)
    .set('x-fixture-actor', 'editor')
    .attach('file', Buffer.from('EXTRACTED TITLE\nFixture text\n- One\n- Two\nA | B\n1 | 2'), {
      filename: 'fixture.md',
      contentType: 'text/markdown',
    });
  expect(result.status).toBe(201);
  const document = await admin.document.findUniqueOrThrow({
    where: { id: result.body.documentId as string },
  });
  expect(document.workspaceId).toBe(a);
  expect(document.yjsState).not.toBeNull();
  const recovered = new Y.Doc();
  try {
    Y.applyUpdate(recovered, document.yjsState!);
    expect(JSON.stringify(projectDocument(recovered))).toContain('Fixture text');
  } finally {
    recovered.destroy();
  }
  expect(await admin.activity.count({ where: { workspaceId: a, type: 'doc_ingested' } })).toBe(1);
  expect(await admin.embeddingJob.count({ where: { resourceId: document.id } })).toBe(1);
});
it('G01 search is tenant-scoped under forced RLS and retains viewer access', async () => {
  const { a, b } = await fixture();
  expect((await request(app).get(`/workspaces/${b}/search?q=Task`)).status).toBe(403);
  const result = await request(app)
    .get(`/workspaces/${a}/search?q=Task`)
    .set('x-fixture-actor', 'viewer');
  expect(result.status).toBe(200);
  expect(result.body.results).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: `task-${a}` })]),
  );
  expect(JSON.stringify(result.body)).not.toContain(`task-${b}`);
});
it('F01/G01 AI membership precedes balance/provider access and viewers can request bounded read-only output', async () => {
  const { a, b } = await fixture();
  for (const [actor, workspaceId] of [
    ['owner', b],
    ['inactive', a],
  ] as const) {
    const result = await request(app)
      .post('/ai/complete')
      .set('x-fixture-actor', actor)
      .send({ workspaceId, prompt: 'Summarize' });
    expect(result.status).toBe(403);
    expect(await admin.tokenUsage.count({ where: { workspaceId } })).toBe(0);
  }
  const response = await request(app).post('/ai/complete').set('x-fixture-actor', 'viewer').send({
    workspaceId: a,
    prompt: 'Summarize',
    context: 'Untrusted instructions',
    action: 'summarize',
  });
  expect(response.status).toBe(200);
  expect(response.text).toContain('Fixture AI response');
  await until(
    async () => (await admin.tokenUsage.count({ where: { workspaceId: a } })) === 1,
    'Authorized usage not persisted',
  );
  expect(
    (
      await request(app)
        .post('/ai/complete')
        .send({ workspaceId: a, prompt: 'x'.repeat(16001) })
    ).status,
  ).toBe(400);
});
it('F01 central usage/offline-action policy rejects foreign and revoked actors, with workspace-bound replay keys', async () => {
  const { a, b } = await fixture();
  const action = {
    id: 'fixture-action-id',
    type: 'complete',
    prompt: 'Summarize',
    estimatedTokens: 10,
    status: 'pending',
  };
  for (const actorId of ['viewer', 'foreign', 'inactive']) {
    const document = new Y.Doc();
    try {
      document.getMap<string>('devsync:ai-actions').set(action.id, JSON.stringify(action));
      await withDatabase(db, () => reconcileOfflineAiActions(document, a, actorId));
      expect(document.getMap<string>('devsync:ai-actions').get(action.id)).toContain('rejected');
    } finally {
      document.destroy();
    }
  }
  expect(await admin.tokenUsage.count({ where: { workspaceId: a } })).toBe(0);
  await expect(
    withDatabase(db, () => recordTokenUsage(b, 'forged', 10, 'fixture', 'owner')),
  ).rejects.toThrow('Access denied');
  const document = new Y.Doc();
  try {
    document.getMap<string>('devsync:ai-actions').set(action.id, JSON.stringify(action));
    await withDatabase(db, () => reconcileOfflineAiActions(document, a, 'editor'));
    expect(document.getMap<string>('devsync:ai-actions').get(action.id)).toContain('authorized');
    document.getMap<string>('devsync:ai-actions').set(action.id, JSON.stringify(action));
    await withDatabase(db, () => reconcileOfflineAiActions(document, a, 'editor'));
    expect(await admin.tokenUsage.count({ where: { workspaceId: a } })).toBe(1);
    const usage = await admin.tokenUsage.findFirstOrThrow({ where: { workspaceId: a } });
    expect(usage.requestId).toBe(`offline-ai:${a}:editor:${action.id}`);
    await expect(
      withDatabase(db, () => recordTokenUsage(a, usage.requestId, 11, usage.source, 'editor')),
    ).rejects.toThrow('Access denied');
  } finally {
    document.destroy();
  }
});

async function scimToken(workspaceId: string) {
  const token = randomBytes(32).toString('hex');
  const record = await admin.scimProvisioningToken.create({
    data: { workspaceId, tokenHash: createHash('sha256').update(token).digest('hex') },
  });
  return { token, id: record.id };
}
it('C04/D07 SCIM changes only its tenant membership and cannot rebind global identity or grant OWNER', async () => {
  const { a, b } = await fixture(),
    credential = await scimToken(a);
  await admin.workspaceMember.create({
    data: { userId: 'editor', workspaceId: b, role: 'EDITOR' },
  });
  const globalBefore = await admin.user.findUniqueOrThrow({ where: { id: 'editor' } });
  const post = await request(app)
    .post('/scim/v2/Users')
    .set('Authorization', `Bearer ${credential.token}`)
    .send({
      externalId: 'linked-editor',
      userName: globalBefore.email,
      roles: [{ value: 'VIEWER' }],
    });
  expect(post.status).toBe(201);
  expect(
    (
      await admin.workspaceMember.findUniqueOrThrow({
        where: { userId_workspaceId: { userId: 'editor', workspaceId: a } },
      })
    ).role,
  ).toBe('VIEWER');
  expect(
    (
      await admin.workspaceMember.findUniqueOrThrow({
        where: { userId_workspaceId: { userId: 'editor', workspaceId: b } },
      })
    ).role,
  ).toBe('EDITOR');
  for (const data of [
    { userName: 'foreign@example.test' },
    { name: { formatted: 'Forged global profile' } },
  ])
    expect(
      (
        await request(app)
          .patch('/scim/v2/Users/linked-editor')
          .set('Authorization', `Bearer ${credential.token}`)
          .send(data)
      ).status,
    ).toBe(409);
  expect(
    (
      await request(app)
        .post('/scim/v2/Users')
        .set('Authorization', `Bearer ${credential.token}`)
        .send({ externalId: 'linked-editor', userName: 'foreign@example.test' })
    ).status,
  ).toBe(409);
  expect(
    (
      await request(app)
        .patch('/scim/v2/Users/linked-editor')
        .set('Authorization', `Bearer ${credential.token}`)
        .send({ roles: [{ value: 'OWNER' }] })
    ).status,
  ).toBe(400);
  const deactivated = await request(app)
    .patch('/scim/v2/Users/linked-editor')
    .set('Authorization', `Bearer ${credential.token}`)
    .send({ active: false });
  expect(deactivated.status).toBe(200);
  expect(deactivated.body.active).toBe(false);
  expect(
    await admin.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: 'editor', workspaceId: a } },
    }),
  ).toBeNull();
  expect(
    await admin.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: 'editor', workspaceId: b } },
    }),
  ).not.toBeNull();
  expect(await admin.user.findUniqueOrThrow({ where: { id: 'editor' } })).toEqual(globalBefore);
});
it.each(['post', 'patch', 'delete'] as const)(
  'D07 SCIM %s cannot affect a foreign identity, owner or revoked token scope',
  async (method) => {
    const { a, b } = await fixture(),
      credential = await scimToken(a);
    const identity = await admin.scimExternalIdentity.create({
      data: { workspaceId: b, userId: 'foreign', externalId: 'foreign-external' },
    });
    const foreignBefore = await admin.user.findUniqueOrThrow({ where: { id: 'foreign' } });
    const url = method === 'post' ? '/scim/v2/Users' : '/scim/v2/Users/foreign-external';
    const data = {
      externalId: 'foreign-external',
      userName: 'foreign@example.test',
      active: false,
    };
    const foreign = await request(app)
      [method](url)
      .set('Authorization', `Bearer ${credential.token}`)
      .send(data);
    // POST may add a distinct local link; no authority over the other tenant's link/profile.
    expect(foreign.status).toBe(method === 'post' ? 201 : method === 'delete' ? 204 : 400);
    expect(await admin.scimExternalIdentity.findUnique({ where: { id: identity.id } })).toEqual(
      identity,
    );
    expect(await admin.user.findUniqueOrThrow({ where: { id: 'foreign' } })).toEqual(foreignBefore);
    await admin.scimExternalIdentity.create({
      data: { workspaceId: a, userId: 'owner', externalId: 'owner-external' },
    });
    expect(
      (
        await request(app)
          [method](method === 'post' ? '/scim/v2/Users' : '/scim/v2/Users/owner-external')
          .set('Authorization', `Bearer ${credential.token}`)
          .send({ externalId: 'owner-external', userName: 'owner@example.test', active: false })
      ).status,
    ).toBe(403);
    await admin.scimProvisioningToken.update({
      where: { id: credential.id },
      data: { revokedAt: new Date() },
    });
    expect(
      (
        await request(app)
          [method](url)
          .set('Authorization', `Bearer ${credential.token}`)
          .send(data)
      ).status,
    ).toBe(401);
    expect(
      (await request(app)[method](url).set('Authorization', 'Bearer invalid').send(data)).status,
    ).toBe(401);
  },
);
async function githubEvent(
  repositoryId: string,
  secret: string,
  data: object,
  delivery = randomBytes(16).toString('hex'),
  event = 'pull_request',
) {
  const payload = JSON.stringify({ repository: { id: repositoryId }, ...data });
  return request(app)
    .post('/github')
    .set('Content-Type', 'application/json')
    .set('x-github-delivery', delivery)
    .set('x-github-event', event)
    .set(
      'x-hub-signature-256',
      `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`,
    )
    .send(payload);
}
it('G08/D07 signed GitHub scope is repository-bound, transactionally retryable and duplicate-safe', async () => {
  const { a, b } = await fixture(),
    repository = await repositoryFixture(a);
  await admin.gitHubRepository.update({
    where: { id: repository.id },
    data: { prOpenedColumnId: `target-${a}` },
  });
  const keyA = `SEC-${sequence}`,
    keyB = `SEC-${10000 + sequence}`;
  await admin.task.update({ where: { id: `task-${a}` }, data: { taskKey: keyA } });
  await admin.task.update({ where: { id: `task-${b}` }, data: { taskKey: keyB } });
  const payload = {
    action: 'opened',
    workspaceId: b,
    pull_request: { title: `Fixes ${keyA}; Fixes ${keyB}`, body: '' },
  };
  expect((await githubEvent(repository.repositoryId, 'incorrect-secret', payload)).status).toBe(
    401,
  );
  expect(await admin.gitHubWebhookDelivery.count()).toBe(0);
  const delivery = randomBytes(16).toString('hex');
  await admin.gitHubRepository.update({
    where: { id: repository.id },
    data: { prOpenedColumnId: `target-${b}` },
  });
  expect(
    (await githubEvent(repository.repositoryId, repository.webhookSecret, payload, delivery))
      .status,
  ).toBe(409);
  expect(await admin.gitHubWebhookDelivery.count({ where: { deliveryId: delivery } })).toBe(0);
  await admin.gitHubRepository.update({
    where: { id: repository.id },
    data: { prOpenedColumnId: `target-${a}` },
  });
  const replies = await Promise.all([
    githubEvent(repository.repositoryId, repository.webhookSecret, payload, delivery),
    githubEvent(repository.repositoryId, repository.webhookSecret, payload, delivery),
  ]);
  expect(replies.map((reply) => reply.status).sort()).toEqual([200, 202]);
  expect((await admin.task.findUniqueOrThrow({ where: { id: `task-${a}` } })).columnId).toBe(
    `target-${a}`,
  );
  expect((await admin.task.findUniqueOrThrow({ where: { id: `task-${b}` } })).columnId).toBe(
    `column-${b}`,
  );
  await admin.workspace.update({ where: { id: a }, data: { suspendedAt: new Date() } });
  expect(
    (await githubEvent(repository.repositoryId, repository.webhookSecret, payload)).status,
  ).toBe(403);
});
it.each(['push', 'issues'])(
  'D07 GitHub %s activities require the bound unsuspended repository authority',
  async (event) => {
    const { a, b } = await fixture(),
      repository = await repositoryFixture(a);
    const payload =
      event === 'push'
        ? { ref: 'refs/heads/main', commits: [{}], pusher: { name: 'fixture' } }
        : { action: 'opened', issue: { title: 'Fixture', user: { login: 'fixture' } } };
    expect(
      (
        await githubEvent(
          repository.repositoryId,
          repository.webhookSecret,
          payload,
          undefined,
          event,
        )
      ).status,
    ).toBe(200);
    expect(
      await admin.activity.count({ where: { workspaceId: a, type: { startsWith: 'github_' } } }),
    ).toBe(1);
    expect(await admin.activity.count({ where: { workspaceId: b } })).toBe(0);
  },
);
it('D07 repository jobs reject foreign/deleted/suspended scope before provider work and recheck after it', async () => {
  const { a, b } = await fixture(),
    repository = await repositoryFixture(a),
    other = await repositoryFixture(b);
  const data: PRSummaryJobData = {
    action: 'opened',
    prTitle: 'Fixture',
    prBody: 'Fixture body',
    prNumber: 1,
    prUrl: 'https://github.com/fixture',
    repositoryOwner: 'forged-owner',
    repositoryName: 'forged-name',
    repositoryId: repository.id,
    workspaceId: a,
    taskKeys: [],
    author: 'fixture',
  };
  const before = jest.mocked(completeWithFallback).mock.calls.length;
  await expect(
    withDatabase(db, () => processPRSummary({ data: { ...data, repositoryId: other.id } })),
  ).rejects.toThrow('Access denied');
  expect(jest.mocked(completeWithFallback).mock.calls.length).toBe(before);
  await withDatabase(db, () => processPRSummary({ data }));
  expect(await admin.activity.count({ where: { workspaceId: a, type: 'pr_opened' } })).toBe(1);
  jest.mocked(completeWithFallback).mockImplementationOnce(async () => {
    await admin.gitHubRepository.delete({ where: { id: repository.id } });
    return {
      content: 'Must not store deleted repository output',
      provider: 'groq',
      tokens: 1,
    } as Awaited<ReturnType<typeof completeWithFallback>>;
  });
  await expect(withDatabase(db, () => processPRSummary({ data }))).rejects.toThrow('Access denied');
  expect(await admin.activity.count({ where: { workspaceId: a, type: 'pr_opened' } })).toBe(1);
  await admin.workspace.update({ where: { id: b }, data: { suspendedAt: new Date() } });
  await expect(
    withDatabase(db, () =>
      processPRSummary({ data: { ...data, workspaceId: b, repositoryId: other.id } }),
    ),
  ).rejects.toThrow('Access denied');
});
async function withEnvironment<T>(values: Record<string, string>, operation: () => Promise<T>) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    return await operation();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
async function stripeEvent(type: string, data: object, valid = true) {
  const secret = 'whsec_fixture_only_not_a_deployment_key';
  const payload = JSON.stringify({
    id: `evt_${randomBytes(16).toString('hex')}`,
    object: 'event',
    type,
    data: { object: data },
  });
  const signature = new Stripe('sk_test_fixture_only').webhooks.generateTestHeaderString({
    payload,
    secret: valid ? secret : 'wrong-secret',
  });
  return withEnvironment(
    { STRIPE_SECRET_KEY: 'sk_test_fixture_only', STRIPE_WEBHOOK_SECRET: secret },
    () =>
      request(app)
        .post('/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(payload),
  );
}
it('D07 signed billing events bind customers and subscriptions and cannot clear admin suspension', async () => {
  const { a, b } = await fixture();
  await admin.workspace.update({
    where: { id: a },
    data: { stripeCustomerId: `cus_${a}`, stripeSubscriptionId: `sub_${a}` },
  });
  await admin.workspace.update({
    where: { id: b },
    data: { stripeCustomerId: `cus_${b}`, stripeSubscriptionId: `sub_${b}` },
  });
  expect(
    (
      await stripeEvent('checkout.session.completed', {
        customer: `cus_${b}`,
        metadata: { workspaceId: a },
      })
    ).status,
  ).toBe(403);
  expect(
    (await stripeEvent('invoice.payment_succeeded', { id: 'invoice', customer: `cus_${a}` }, false))
      .status,
  ).toBe(400);
  expect(
    (
      await stripeEvent('invoice.payment_succeeded', {
        id: 'invoice',
        customer: `cus_${b}`,
        metadata: { workspaceId: a },
      })
    ).status,
  ).toBe(200);
  expect((await admin.workspace.findUniqueOrThrow({ where: { id: b } })).billingStatus).toBe(
    'active',
  );
  expect((await admin.workspace.findUniqueOrThrow({ where: { id: a } })).billingStatus).toBe(
    'inactive',
  );
  expect(
    (await stripeEvent('customer.subscription.deleted', { id: `sub_${b}`, customer: `cus_${a}` }))
      .status,
  ).toBe(403);
  expect(
    (await stripeEvent('customer.subscription.deleted', { id: `sub_${b}`, customer: `cus_${b}` }))
      .status,
  ).toBe(200);
  expect((await admin.workspace.findUniqueOrThrow({ where: { id: b } })).billingStatus).toBe(
    'canceled',
  );
  const suspendedAt = new Date();
  await admin.workspace.update({
    where: { id: a },
    data: { suspendedAt, billingStatus: 'suspended' },
  });
  expect(
    (await stripeEvent('invoice.payment_succeeded', { id: 'invoice-paid', customer: `cus_${a}` }))
      .status,
  ).toBe(200);
  expect((await admin.workspace.findUniqueOrThrow({ where: { id: a } })).suspendedAt).toEqual(
    suspendedAt,
  );
  expect((await admin.workspace.findUniqueOrThrow({ where: { id: a } })).billingStatus).toBe(
    'suspended',
  );
});
it('D07 checkout associates only its signed workspace and customer', async () => {
  const { a, b } = await fixture();
  expect(
    (
      await stripeEvent('checkout.session.completed', {
        customer: `cus_${a}`,
        subscription: `sub_${a}`,
        metadata: { workspaceId: a },
      })
    ).status,
  ).toBe(200);
  expect((await admin.workspace.findUniqueOrThrow({ where: { id: a } })).stripeCustomerId).toBe(
    `cus_${a}`,
  );
  expect(
    (await admin.workspace.findUniqueOrThrow({ where: { id: b } })).stripeCustomerId,
  ).toBeNull();
});
it('D07 superadmin requires active verified global role or a strong configured service credential', async () => {
  const { a, b } = await fixture();
  for (const clerkId of ['fixture_owner', 'fixture_editor', 'fixture_viewer', 'fixture_inactive']) {
    expect(
      (
        await request(app)
          .post(`/superadmin/workspaces/${a}/kill-switch`)
          .set('x-verified-clerk-fixture', clerkId)
          .send({ reason: 'Unauthorized attempt' })
      ).status,
    ).toBe(403);
    expect(
      (await request(app).get('/superadmin/metrics').set('x-verified-clerk-fixture', clerkId))
        .status,
    ).toBe(403);
  }
  expect(
    (
      await request(app)
        .post(`/superadmin/workspaces/${a}/kill-switch`)
        .set('x-verified-clerk-fixture', 'fixture_superadmin')
        .send({ reason: 'Fixture suspension' })
    ).status,
  ).toBe(200);
  expect(
    (
      await request(app)
        .get('/superadmin/metrics')
        .set('x-verified-clerk-fixture', 'fixture_superadmin')
    ).status,
  ).toBe(200);
  await withEnvironment({ SUPERADMIN_SERVICE_TOKEN: 'short' }, async () =>
    expect(
      (
        await request(app)
          .post(`/superadmin/workspaces/${b}/kill-switch`)
          .set('x-superadmin-service-token', 'short')
          .send({ reason: 'Short key rejected' })
      ).status,
    ).toBe(403),
  );
  await withEnvironment(
    { SUPERADMIN_SERVICE_TOKEN: 'fixture-service-key-32-characters-minimum' },
    async () =>
      expect(
        (
          await request(app)
            .post(`/superadmin/workspaces/${b}/kill-switch`)
            .set('x-superadmin-service-token', 'fixture-service-key-32-characters-minimum')
            .send({ reason: 'Fixture suspension' })
        ).status,
      ).toBe(200),
  );
});

it('D01/C01 central self-profile and identity policies reject inactive principals without privilege assignment', async () => {
  expect((await request(app).get('/auth/me').set('x-fixture-actor', 'inactive')).status).toBe(403);
  expect(
    (
      await request(app)
        .patch('/auth/me')
        .set('x-fixture-actor', 'inactive')
        .send({ name: 'Denied profile' })
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .patch('/auth/me')
        .set('x-fixture-actor', 'editor')
        .send({ name: 'Profile', systemRole: 'SUPER_ADMIN' })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(app)
        .patch('/auth/me')
        .set('x-fixture-actor', 'editor')
        .send({ name: 'Fixture profile' })
    ).status,
  ).toBe(200);
  expect((await admin.user.findUniqueOrThrow({ where: { id: 'editor' } })).systemRole).toBe('USER');
  await expect(
    withDatabase(db, () =>
      withIdentityProfileAccess('fixture_inactive', (tx) =>
        tx.user.update({ where: { id: 'inactive' }, data: { name: 'Must reject' } }),
      ),
    ),
  ).rejects.toThrow('Access denied');
});
async function enqueueResource(
  kind: 'document' | 'snippet' | 'task',
  resourceId: string,
  workspaceId: string,
) {
  return withDatabase(db, () =>
    withWorkspaceAccess('editor', workspaceId, WRITE_ROLES, (tx) =>
      queueEmbedding(kind, resourceId, tx, workspaceId, 'editor'),
    ),
  );
}
it.each(['document', 'snippet', 'task'] as const)(
  'G01 embedding %s producer and consumer bind tenant/resource authority',
  async (kind) => {
    const { a, b } = await fixture(),
      id = `${kind === 'document' ? 'doc' : kind}-${a}`,
      foreignId = `${kind === 'document' ? 'doc' : kind}-${b}`;
    await enqueueResource(kind, id, a);
    let calls = 0;
    const provider = async (text: string) => {
      calls++;
      expect(text.length).toBeGreaterThan(0);
      return Array<number>(1536).fill(0.01);
    };
    await expect(withDatabase(db, () => refreshEmbedding(kind, id, b, provider))).rejects.toThrow(
      'Access denied',
    );
    await expect(
      withDatabase(db, () => refreshEmbedding(kind, foreignId, a, provider)),
    ).rejects.toThrow('Access denied');
    expect(calls).toBe(0);
    await expect(
      withDatabase(db, () =>
        db.withTenantTransaction(a, (tx) => queueEmbedding(kind, foreignId, tx, a, 'editor')),
      ),
    ).rejects.toThrow('Access denied');
    await expect(
      withDatabase(db, () =>
        db.withTenantTransaction(a, (tx) => queueEmbedding(kind, id, tx, a, 'viewer')),
      ),
    ).rejects.toThrow('Access denied');
    expect(await withDatabase(db, () => refreshEmbedding(kind, id, a, provider))).toBe(true);
    expect(calls).toBe(1);
    expect(await withDatabase(db, () => refreshEmbedding(kind, id, a, provider))).toBe(true);
    expect(calls).toBe(1);
    await admin.workspace.update({ where: { id: a }, data: { suspendedAt: new Date() } });
    await expect(withDatabase(db, () => refreshEmbedding(kind, id, a, provider))).rejects.toThrow(
      'Access denied',
    );
  },
);
it('G01/G04 embedding rejects stale provider results and preserves newly queued work', async () => {
  const { a } = await fixture(),
    id = `doc-${a}`;
  await enqueueResource('document', id, a);
  const result = withDatabase(db, () =>
    refreshEmbedding('document', id, a, async () => {
      expect(
        (
          await request(app)
            .patch(`/documents/${id}`)
            .send({ title: 'Changed during provider call' })
        ).status,
      ).toBe(200);
      return Array<number>(1536).fill(0.02);
    }),
  );
  await expect(result).rejects.toThrow('Content changed during embedding');
  expect((await admin.document.findUniqueOrThrow({ where: { id } })).embeddingHash).toBeNull();
  expect(
    (
      await admin.embeddingJob.findUniqueOrThrow({
        where: { resourceType_resourceId: { resourceType: 'document', resourceId: id } },
      })
    ).revision,
  ).toBe(1);
});
it('G04 parallel embedding claims have unique leases, expired leases recover and stale acknowledgements cannot delete new work', async () => {
  // Retire only this fixture's prior metadata; documents and earlier assertions are retained.
  await admin.embeddingJob.updateMany({ data: { status: 'dead' } });
  const { a, b } = await fixture(),
    id = `doc-${a}`;
  await enqueueResource('document', id, a);
  const batches = await withDatabase(db, () =>
    Promise.all([claimEmbeddingJobs(), claimEmbeddingJobs()]),
  );
  const claims = batches.flat();
  expect(claims).toHaveLength(1);
  const first = claims[0];
  expect(
    (await withDatabase(db, () => acknowledgeEmbeddingJob({ ...first, workspaceId: b }))).count,
  ).toBe(0);
  await admin.embeddingJob.update({
    where: { id: first.id },
    data: { leaseUntil: new Date(Date.now() - 1000) },
  });
  const [renewed] = await withDatabase(db, () => claimEmbeddingJobs());
  expect(renewed.id).toBe(first.id);
  expect(renewed.leaseToken).not.toBe(first.leaseToken);
  expect((await withDatabase(db, () => acknowledgeEmbeddingJob(first))).count).toBe(0);
  await enqueueResource('document', id, a);
  expect((await withDatabase(db, () => acknowledgeEmbeddingJob(renewed))).count).toBe(0);
  const stored = await admin.embeddingJob.findUniqueOrThrow({ where: { id: first.id } });
  expect(stored.status).toBe('pending');
  expect(stored.revision).toBe(1);
  await withDatabase(db, () => processEmbeddingJobs(async () => Array<number>(1536).fill(0.03)));
  expect(await admin.embeddingJob.findUnique({ where: { id: first.id } })).toBeNull();
});
it('G04 failed embedding deliveries remain retryable instead of deleting pending work', async () => {
  await admin.embeddingJob.updateMany({ data: { status: 'dead' } });
  const { a } = await fixture(),
    id = `doc-${a}`;
  await enqueueResource('document', id, a);
  await withDatabase(db, () => processEmbeddingJobs(async () => null));
  const stored = await admin.embeddingJob.findUniqueOrThrow({
    where: { resourceType_resourceId: { resourceType: 'document', resourceId: id } },
  });
  expect(stored.status).toBe('pending');
  expect(stored.attempts).toBe(1);
  expect(stored.leaseToken).toBeNull();
});

it('G04/G10 the shared poller stops admission and waits for the real in-flight database batch', async () => {
  await admin.embeddingJob.updateMany({ data: { status: 'dead' } });
  const { a } = await fixture(),
    id = `doc-${a}`;
  await enqueueResource('document', id, a);
  let entered!: () => void,
    release!: () => void,
    stopped = false,
    calls = 0;
  const active = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  const poller = withDatabase(db, () =>
    startEmbeddingPolling(10, () =>
      processEmbeddingJobs(async () => {
        calls++;
        entered();
        await paused;
        return Array<number>(1536).fill(0.04);
      }),
    ),
  );
  await active;
  const stop = poller.stop().then(() => {
    stopped = true;
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(stopped).toBe(false);
    expect(calls).toBe(1);
  } finally {
    release();
  }
  await stop;
  expect(
    await admin.embeddingJob.findUnique({
      where: { resourceType_resourceId: { resourceType: 'document', resourceId: id } },
    }),
  ).toBeNull();
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(calls).toBe(1);
});

it('D01/G07 concurrent self-profile mutations serialize without lock upgrade deadlocks', async () => {
  const replies = await Promise.all([
    request(app)
      .patch('/auth/me')
      .set('x-fixture-actor', 'editor')
      .send({ name: 'Concurrent profile' }),
    request(app)
      .patch('/auth/me')
      .set('x-fixture-actor', 'editor')
      .send({ avatar: 'https://example.test/fixture-avatar.png' }),
  ]);
  expect(replies.map((reply) => reply.status)).toEqual([200, 200]);
  expect(await admin.user.findUniqueOrThrow({ where: { id: 'editor' } })).toMatchObject({
    name: 'Concurrent profile',
    avatar: 'https://example.test/fixture-avatar.png',
    systemRole: 'USER',
  });
});

const keyedCreates = [
  ['/workspaces/TEAM/documents', { title: 'Idempotent document' }, 'document'],
  [
    '/workspaces/TEAM/snippets',
    { title: 'Idempotent snippet', code: 'const value = 1;', language: 'typescript' },
    'snippet',
  ],
  ['/workspaces/TEAM/boards', { name: 'Idempotent board' }, 'board'],
  ['/boards/board-TEAM/columns', { name: 'Idempotent column' }, 'column'],
  ['/columns/column-TEAM/tasks', { title: 'Idempotent task' }, 'task'],
  ['/workspaces/TEAM/invite', { email: 'foreign@example.test', role: 'VIEWER' }, 'member'],
  [
    '/workspaces/TEAM/repositories',
    {
      repositoryId: 'idempotent-TEAM',
      owner: 'fixture',
      name: 'idempotent-TEAM',
      webhookSecret: 'fixture-webhook-secret',
    },
    'repository',
  ],
] as const;
async function resourceCount(kind: string, workspaceId: string) {
  if (kind === 'document') return admin.document.count({ where: { workspaceId } });
  if (kind === 'snippet') return admin.snippet.count({ where: { workspaceId } });
  if (kind === 'board') return admin.board.count({ where: { workspaceId } });
  if (kind === 'column') return admin.column.count({ where: { board: { workspaceId } } });
  if (kind === 'task') return admin.task.count({ where: { column: { board: { workspaceId } } } });
  if (kind === 'member') return admin.workspaceMember.count({ where: { workspaceId } });
  return admin.gitHubRepository.count({ where: { workspaceId } });
}
it.each(keyedCreates)(
  'G09 parallel duplicate creates are atomic for %s',
  async (path, data, kind) => {
    const { a } = await fixture(),
      key = randomBytes(16).toString('hex'),
      url = path.replace(/TEAM/g, a),
      payload = bodyFor(data, a);
    const before = await resourceCount(kind, a),
      receipts = await admin.apiIdempotencyRecord.count(),
      activities = await admin.activity.count({ where: { workspaceId: a } });
    await withEnvironment({ ENCRYPTION_KEY: 'ab'.repeat(32) }, async () => {
      const replies = await Promise.all(
        Array.from({ length: 6 }, () =>
          request(app).post(url).set('Idempotency-Key', key).send(payload),
        ),
      );
      expect(replies.map((reply) => reply.status)).toEqual(Array<number>(6).fill(201));
      for (const reply of replies) expect(reply.body).toEqual(replies[0].body);
      expect(await resourceCount(kind, a)).toBe(before + 1);
      expect(await admin.apiIdempotencyRecord.count()).toBe(receipts + 1);
      expect(await admin.activity.count({ where: { workspaceId: a } })).toBe(
        activities + (['document', 'snippet', 'task', 'member'].includes(kind) ? 1 : 0),
      );
      const changed =
        'title' in data
          ? { ...payload, title: `${data.title} changed` }
          : 'name' in data
            ? { ...payload, name: `${data.name} changed` }
            : { ...payload, role: 'EDITOR' };
      expect((await request(app).post(url).set('Idempotency-Key', key).send(changed)).status).toBe(
        409,
      );
      expect(await resourceCount(kind, a)).toBe(before + 1);
      if (kind === 'repository') {
        const receipt = await admin.apiIdempotencyRecord.findFirstOrThrow({
          where: { authorityId: 'owner' },
          orderBy: { createdAt: 'desc' },
        });
        expect(JSON.stringify(receipt.response)).not.toContain('webhookSecret');
        expect(JSON.stringify(receipt.response)).not.toContain('enc:v1:');
      }
    });
  },
);
it('G09 workspace creation has one atomic receipt under parallel requests without an existing tenant lock', async () => {
  const key = randomBytes(16).toString('hex'),
    name = `Atomic workspace ${++sequence}`,
    before = await admin.workspace.count();
  const replies = await Promise.all(
    Array.from({ length: 8 }, () =>
      request(app).post('/workspaces').set('Idempotency-Key', key).send({ name }),
    ),
  );
  expect(replies.map((reply) => reply.status)).toEqual(Array<number>(8).fill(201));
  for (const reply of replies) expect(reply.body).toEqual(replies[0].body);
  expect(await admin.workspace.count()).toBe(before + 1);
  expect(
    await admin.activity.count({
      where: { workspaceId: replies[0].body.id as string, type: 'workspace_created' },
    }),
  ).toBe(1);
});
it('G09 legacy/v1 aliases share a receipt, malformed keys reject, and receipt copies remain RLS-protected', async () => {
  const { a } = await fixture(),
    key = randomBytes(16).toString('hex');
  const first = await request(app)
    .post(`/api/workspaces/${a}/documents`)
    .set('Idempotency-Key', key)
    .send({ title: 'Alias receipt' });
  const replay = await request(app)
    .post(`/api/v1/workspaces/${a}/documents`)
    .set('Idempotency-Key', key)
    .send({ title: 'Alias receipt' });
  expect(first.status).toBe(201);
  expect(replay.status).toBe(201);
  expect(replay.body).toEqual(first.body);
  expect(await db.apiIdempotencyRecord.count()).toBe(0);
  expect(await db.withTenantTransaction(a, (tx) => tx.apiIdempotencyRecord.count())).toBe(0);
  expect(
    (
      await request(app)
        .post(`/workspaces/${a}/documents`)
        .set('Idempotency-Key', 'x'.repeat(129))
        .send({ title: 'Invalid' })
    ).status,
  ).toBe(400);
});
it('D07/G09 replay cannot bypass changed role, principal or workspace scope', async () => {
  const { a, b } = await fixture(),
    key = randomBytes(16).toString('hex');
  const first = await request(app)
    .post(`/workspaces/${a}/documents`)
    .set('x-fixture-actor', 'editor')
    .set('Idempotency-Key', key)
    .send({ title: 'Private receipt' });
  expect(first.status).toBe(201);
  await admin.workspaceMember.update({
    where: { userId_workspaceId: { workspaceId: a, userId: 'editor' } },
    data: { role: 'VIEWER' },
  });
  expect(
    (
      await request(app)
        .post(`/workspaces/${a}/documents`)
        .set('x-fixture-actor', 'editor')
        .set('Idempotency-Key', key)
        .send({ title: 'Private receipt' })
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post(`/workspaces/${b}/documents`)
        .set('Idempotency-Key', key)
        .send({ title: 'Private receipt' })
    ).status,
  ).toBe(403);
  const owner = await request(app)
    .post(`/workspaces/${a}/documents`)
    .set('Idempotency-Key', key)
    .send({ title: 'Private receipt' });
  expect(owner.status).toBe(201);
  expect(owner.body.id).not.toBe(first.body.id);
});
it('G09 a receipt-write failure rolls back resource, activity and outbox; the same key can retry', async () => {
  const { a } = await fixture(),
    key = randomBytes(16).toString('hex'),
    before = await state(a),
    jobs = await admin.embeddingJob.count({ where: { workspaceId: a } }),
    receipts = await admin.apiIdempotencyRecord.count();
  await admin.$executeRaw(
    Prisma.sql`CREATE FUNCTION phase1c_reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture receipt failure'; END $$`,
  );
  await admin.$executeRaw(
    Prisma.sql`CREATE TRIGGER phase1c_reject_receipt BEFORE UPDATE ON "ApiIdempotencyRecord" FOR EACH ROW EXECUTE FUNCTION phase1c_reject_receipt()`,
  );
  try {
    const response = await request(app)
      .post(`/workspaces/${a}/documents`)
      .set('Idempotency-Key', key)
      .send({ title: 'Rollback receipt' });
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Internal server error');
    expect(await state(a)).toEqual(before);
    expect(await admin.embeddingJob.count({ where: { workspaceId: a } })).toBe(jobs);
    expect(await admin.apiIdempotencyRecord.count()).toBe(receipts);
  } finally {
    await admin.$executeRaw(
      Prisma.sql`DROP TRIGGER phase1c_reject_receipt ON "ApiIdempotencyRecord"`,
    );
    await admin.$executeRaw(Prisma.sql`DROP FUNCTION phase1c_reject_receipt()`);
  }
  expect(
    (
      await request(app)
        .post(`/workspaces/${a}/documents`)
        .set('Idempotency-Key', key)
        .send({ title: 'Rollback receipt' })
    ).status,
  ).toBe(201);
});
it('G09 ingestion and SCIM create receipts survive concurrent duplicates and reject changed payloads', async () => {
  const { a } = await fixture(),
    key = randomBytes(16).toString('hex'),
    before = await admin.document.count({ where: { workspaceId: a } });
  const upload = (text: string) =>
    request(app)
      .post(`/workspaces/${a}/documents/ingest`)
      .set('Idempotency-Key', key)
      .attach('file', Buffer.from(text), { filename: 'idempotent.txt', contentType: 'text/plain' });
  const replies = await Promise.all([
    upload('Idempotent text'),
    upload('Idempotent text'),
    upload('Idempotent text'),
  ]);
  expect(replies.map((reply) => reply.status)).toEqual([201, 201, 201]);
  expect(replies[1].body).toEqual(replies[0].body);
  expect(await admin.document.count({ where: { workspaceId: a } })).toBe(before + 1);
  expect((await upload('Changed text')).status).toBe(409);
  const credential = await scimToken(a),
    scimKey = randomBytes(16).toString('hex'),
    body = {
      externalId: 'idempotent-scim',
      userName: 'editor@example.test',
      roles: [{ value: 'VIEWER' }],
    };
  const requests = await Promise.all(
    Array.from({ length: 4 }, () =>
      request(app)
        .post('/scim/v2/Users')
        .set('Authorization', `Bearer ${credential.token}`)
        .set('Idempotency-Key', scimKey)
        .send(body),
    ),
  );
  expect(requests.map((reply) => reply.status)).toEqual([201, 201, 201, 201]);
  for (const reply of requests) expect(reply.body).toEqual(requests[0].body);
  expect(
    (
      await request(app)
        .post('/scim/v2/Users')
        .set('Authorization', `Bearer ${credential.token}`)
        .set('Idempotency-Key', scimKey)
        .send({ ...body, active: false })
    ).status,
  ).toBe(409);
  await admin.scimProvisioningToken.update({
    where: { id: credential.id },
    data: { revokedAt: new Date() },
  });
  expect(
    (
      await request(app)
        .post('/scim/v2/Users')
        .set('Authorization', `Bearer ${credential.token}`)
        .set('Idempotency-Key', scimKey)
        .send(body)
    ).status,
  ).toBe(401);
});

it('G09 expired receipts can be reused within the documented window semantics', async () => {
  const { a } = await fixture(),
    key = randomBytes(16).toString('hex'),
    url = `/workspaces/${a}/documents`;
  const first = await request(app)
    .post(url)
    .set('Idempotency-Key', key)
    .send({ title: 'Before expiry' });
  expect(first.status).toBe(201);
  const receipt = await admin.apiIdempotencyRecord.findFirstOrThrow({
    where: { authorityId: 'owner' },
    orderBy: { createdAt: 'desc' },
  });
  await admin.apiIdempotencyRecord.update({
    where: { id: receipt.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const next = await request(app)
    .post(url)
    .set('Idempotency-Key', key)
    .send({ title: 'After expiry' });
  expect(next.status).toBe(201);
  expect(next.body.id).not.toBe(first.body.id);
});
it('G09 JSON null is a completed receipt, and a thrown create leaves no receipt behind', async () => {
  const { a } = await fixture(),
    key = randomBytes(16).toString('hex');
  let calls = 0;
  const run = () =>
    withDatabase(db, () =>
      withWorkspaceAccess('owner', a, WRITE_ROLES, (tx) =>
        idempotentCreate(tx, 'owner', ['fixture.null', a], key, {}, async () => {
          calls++;
          return null;
        }),
      ),
    );
  expect(await run()).toBeNull();
  expect(await run()).toBeNull();
  expect(calls).toBe(1);
  const before = await admin.apiIdempotencyRecord.count();
  await expect(
    withDatabase(db, () =>
      withWorkspaceAccess('owner', a, WRITE_ROLES, (tx) =>
        idempotentCreate(tx, 'owner', ['fixture.failure', a], key, {}, async () => {
          throw new Error('Fixture failure');
        }),
      ),
    ),
  ).rejects.toThrow('Fixture failure');
  expect(await admin.apiIdempotencyRecord.count()).toBe(before);
});
