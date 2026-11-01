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
import { errorMiddleware } from '../middleware/error.middleware';
import { withWorkspaceAccess, WRITE_ROLES } from '../security/workspace-policy';
import { createCollaborationServer } from '../services/collaboration-server';
import { CrdtJournal } from '../services/crdt-journal';
import { projectDocument } from '../services/crdt-schema';
import { processTaskCompletion } from '../agents/task-completion.agent';
import { completeWithFallback } from '../services/ai-gateway.service';
jest.mock('../services/ai-gateway.service', () => ({ completeWithFallback: jest.fn() }));
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
app.get('/workspaces/:id/documents', documents.getDocuments);
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
