import express from 'express';
import request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { randomBytes } from 'crypto';
import { spawnSync } from 'child_process';
import { createServer } from 'http';
import WebSocket from 'ws';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { createTenantPrismaClient, TenantPrismaClient } from '../lib/tenant-prisma';
import { withDatabase } from '../lib/prisma';
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
jest.mock('../services/ai-gateway.service', () => ({ completeWithFallback: jest.fn() }));
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
app.use(express.json());
// Identity adapter is test-fixture-only; production app/server has no such header.
app.use((req, _res, next) =>
  withDatabase(db, () => {
    req.user = {
      userId: req.header('x-fixture-actor') || 'owner',
      clerkId: 'fixture',
      email: 'fixture@example.test',
    };
    next();
  }),
);
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
  for (const id of ['owner', 'editor', 'viewer', 'foreign', 'inactive'])
    await admin.user.create({
      data: {
        id,
        clerkId: `fixture_${id}`,
        email: `${id}@example.test`,
        name: id,
        isActive: id !== 'inactive',
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
    ).toBe(200);
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
