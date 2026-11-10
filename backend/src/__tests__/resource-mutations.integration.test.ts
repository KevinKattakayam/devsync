import { searchKnowledge } from '../services/knowledge-search';
import {
  automationJob,
  automationJobId,
  processAutomationJob,
} from '../services/automation-worker';
import { GenericContainer } from 'testcontainers';
import { Queue, Worker } from 'bullmq';
import { createAutomationRouter } from '../routes/automation.routes';
import {
  submitAutomationEvent,
  approveAutomationExecution,
  listAutomationExecutions,
  executeAutomationExecution,
  claimAutomationExecution,
  failAutomationClaim,
} from '../services/automation-execution';
import {
  createAutomationRule,
  setAutomationEnabled,
  listAutomationRules,
} from '../services/automation-store';
import { groundedPreview } from '../services/grounded-ai';
import aiV3Router from '../routes/ai-v3.routes';
import { evaluateGroundedCases } from '../../testing/ai-eval/grounded';
import { createKnowledgeSearchRouter } from '../routes/knowledge-search.routes';
import { createGitHubExecutionRouter } from '../routes/github-execution.routes';
import { githubInstallationRouter } from '../routes/github-installation.routes';
import { providerSessions } from '../security/provider-sessions';
import express from 'express';
import {
  createAccountLifecycleRouter,
  createWorkspaceLifecycleRouter,
} from '../routes/lifecycle.routes';
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
import {
  createFixtureAuthentication,
  validateFixtureConfiguration,
} from '../../testing/fixture-auth';
import { withAuthentication } from '../security/authentication';
import { authMiddleware } from '../middleware/auth.middleware';
import * as documents from '../controllers/document.controller';
import * as snippets from '../controllers/snippet.controller';
import * as tasks from '../controllers/task.controller';
import * as workspaces from '../controllers/workspace.controller';
import * as repositories from '../controllers/github-repository.controller';
import { aiComplete } from '../controllers/ai.controller';
import { meteredAiRequest } from '../middleware/billing.middleware';
import { createIngestionRouter } from '../routes/ingestion.routes';
import workspaceRouter from '../routes/workspace.routes';
import { parseTaskCsv, serializeTaskCsv } from '../services/task-csv';
import * as embeddingService from '../services/embedding.service';
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
  semanticWorkspaceContext,
  queueEmbedding,
  refreshEmbedding,
  claimEmbeddingJobs,
  acknowledgeEmbeddingJob,
  processEmbeddingJobs,
} from '../services/embedding.service';
jest.mock('@clerk/express', () => ({
  ...jest.requireActual<typeof import('@clerk/express')>('@clerk/express'),
  getAuth: (req: express.Request) => ({
    userId: req.header('x-verified-clerk-fixture') || null,
    sessionId: 'sess_fixture_superadmin',
  }),
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
jest.mock('groq-sdk', () => {
  process.env.GROQ_API_KEY = 'fixture-not-a-provider-credential';
  return class FixtureGroq {
    chat = {
      completions: {
        async *create() {
          yield { choices: [{ delta: { content: 'Fixture AI response' } }] };
        },
      },
    };
  };
});
jest.mock('../lib/redis', () => ({
  redis: { options: { host: 'localhost', port: 6379 } },
  isRedisAvailable: async () => false,
}));
jest.setTimeout(90000);
let postgres: StartedPostgreSqlContainer;
let admin: PrismaClient;
let db: TenantPrismaClient;
let sequence = 0;
let runtimeDatabaseUrl: string;
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
app.use(
  '/api/v2/account',
  createAccountLifecycleRouter((_req, _res, next) => next()),
);
app.use(
  '/api/v2/workspaces/:workspaceId/lifecycle',
  createWorkspaceLifecycleRouter((_req, _res, next) => next()),
);
app.use(
  '/workspaces/:workspaceId/repos/:repositoryId/execution',
  createGitHubExecutionRouter((_req, _res, next) => next()),
);
app.use(
  '/workspaces/:workspaceId/knowledge',
  createKnowledgeSearchRouter((_req, _res, next) => next()),
);
app.use('/scim/v2', scimRouter);
app.use(
  '/automation/:workspaceId',
  createAutomationRouter((_req, _res, next) => next()),
);
app.use('/ai-v3', aiV3Router);
app.get('/auth/me', getMe);
app.patch('/auth/me', updateMe);
app.use('/github', githubRouter);
app.use('/github-installation', githubInstallationRouter);
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
app.get('/documents/:id/export-markdown', documents.exportMarkdown);
app.post('/workspaces/:id/documents', documents.createDocument);
app.post('/workspaces/:id/documents/import-markdown', documents.importMarkdown);
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
app.get('/workspaces/:id/tasks/export-csv', tasks.exportTasksCsv);
app.post('/workspaces/:id/tasks/import-csv', tasks.importTasksCsv);
app.post('/workspaces/:id/boards', tasks.createBoard);
app.post('/boards/:boardId/columns', tasks.createColumn);
app.patch('/columns/:columnId', tasks.updateColumn);
app.delete('/columns/:columnId', tasks.deleteColumn);
app.post('/columns/:columnId/tasks', tasks.createTask);
app.patch('/tasks/:taskId', tasks.updateTask);
app.patch('/tasks/:taskId/move', tasks.moveTask);
app.delete('/tasks/:taskId', tasks.deleteTask);
app.use(errorMiddleware);
// The provider status is an explicit active-session fixture; DB/role assertions stay unchanged.
const providerStatusFixture = jest
  .spyOn(providerSessions, 'assertActive')
  .mockImplementation(async (sessionId, userId) => {
    if (sessionId !== 'sess_fixture_superadmin' || !userId)
      throw new Error('Invalid provider fixture');
  });
afterAll(() => providerStatusFixture.mockRestore());
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
  runtimeDatabaseUrl = url.toString();
  db = createTenantPrismaClient(new PrismaClient({ datasourceUrl: runtimeDatabaseUrl }));
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

it('I02 isolated fixture login authenticates only seeded identities and revokes its session on logout', async () => {
  const secret = randomBytes(32).toString('hex');
  await admin.user.create({
    data: {
      id: 'fixture-browser-owner',
      clerkId: 'user_fixture_owner',
      email: 'sample-owner@devsync.invalid',
      name: 'Sample owner',
    },
  });
  const fixture = createFixtureAuthentication(db, secret),
    harness = express();
  harness.use(express.json());
  harness.use('/__test', fixture.router);
  harness.use((_req, _res, next) =>
    withDatabase(db, () => withAuthentication(fixture.strategy, next)),
  );
  harness.get('/me', authMiddleware, getMe);
  harness.use(errorMiddleware);
  const browser = request.agent(harness);
  expect(
    (await browser.post('/__test/login').send({ email: 'sample-owner@devsync.invalid' })).status,
  ).toBe(401);
  expect(
    (
      await browser
        .post('/__test/login')
        .set('x-e2e-run-secret', secret)
        .send({ email: 'owner@example.test' })
    ).status,
  ).toBe(401);
  const login = await browser
    .post('/__test/login')
    .set('x-e2e-run-secret', secret)
    .send({ email: 'sample-owner@devsync.invalid' });
  expect(login.status).toBe(200);
  expect(String(login.headers['set-cookie'])).toContain('HttpOnly');
  expect(String(login.headers['set-cookie'])).toContain('SameSite=Strict');
  expect((await browser.get('/me')).body.id).toBe('fixture-browser-owner');
  const token = (await browser.get('/__test/token')).body.token as string;
  expect((await fixture.identifyRealtime(token)).id).toBe('fixture-browser-owner');
  expect((await request(harness).get('/me').set('Authorization', `Bearer ${token}`)).status).toBe(
    200,
  );
  expect((await browser.post('/__test/logout')).status).toBe(204);
  expect((await browser.get('/me')).status).toBe(401);
  await expect(fixture.identifyRealtime(token)).rejects.toThrow('Expired fixture session');
});
it('I02 fixture configuration cannot start in production or target an ordinary database', async () => {
  const secret = randomBytes(32).toString('hex');
  expect(() =>
    validateFixtureConfiguration({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://localhost/devsync_e2e_fixture',
      E2E_RUN_SECRET: secret,
    }),
  ).toThrow('NODE_ENV=test');
  expect(() =>
    validateFixtureConfiguration({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost/devsync',
      E2E_RUN_SECRET: secret,
    }),
  ).toThrow('isolated');
  expect(() =>
    validateFixtureConfiguration({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost/devsync_e2e_fixture',
      E2E_RUN_SECRET: 'weak',
    }),
  ).toThrow('random');
  expect(
    validateFixtureConfiguration({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost/devsync_e2e_fixture',
      E2E_RUN_SECRET: secret,
    }),
  ).toEqual({ secret });
});

it('fails closed for binary extraction without an isolated worker and creates no document', async () => {
  const { a } = await fixture();
  const previous = process.env.INGESTION_EXTRACTOR_URL;
  delete process.env.INGESTION_EXTRACTOR_URL;
  try {
    const count = await admin.document.count({ where: { workspaceId: a } });
    const result = await request(app)
      .post(`/workspaces/${a}/documents/ingest`)
      .set('x-fixture-actor', 'editor')
      .attach('file', Buffer.from('%PDF-untrusted'), {
        filename: 'untrusted.pdf',
        contentType: 'application/pdf',
      });
    expect(result.status).toBe(503);
    expect(await admin.document.count({ where: { workspaceId: a } })).toBe(count);
  } finally {
    if (previous === undefined) delete process.env.INGESTION_EXTRACTOR_URL;
    else process.env.INGESTION_EXTRACTOR_URL = previous;
  }
});

it.each([false, true])(
  'rechecks writer authority after isolated extraction completes (revoked=%s)',
  async (revoked) => {
    const { a } = await fixture();
    const before = await admin.document.count({ where: { workspaceId: a } });
    let received = 0;
    const extractor = createServer((req, res) => {
      req.resume();
      received++;
      void (async () => {
        if (revoked)
          await admin.workspaceMember.delete({
            where: { userId_workspaceId: { userId: 'editor', workspaceId: a } },
          });
        // Deliberate service-boundary fixture, not an actual PDF/provider result.
        res
          .writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ text: 'Synthetic extraction boundary fixture' }));
      })().catch(() => res.writeHead(500).end());
    });
    await new Promise<void>((done) => extractor.listen(0, '127.0.0.1', done));
    const address = extractor.address();
    if (!address || typeof address === 'string') throw new Error('No extractor listener');
    const previous = process.env.INGESTION_EXTRACTOR_URL;
    process.env.INGESTION_EXTRACTOR_URL = `http://127.0.0.1:${address.port}/extract`;
    try {
      const result = await request(app)
        .post(`/workspaces/${a}/documents/ingest`)
        .set('x-fixture-actor', 'editor')
        .attach('file', Buffer.from('%PDF-synthetic-boundary-fixture'), {
          filename: 'synthetic.pdf',
          contentType: 'application/pdf',
        });
      expect(received).toBe(1);
      expect(result.status).toBe(revoked ? 403 : 201);
      expect(await admin.document.count({ where: { workspaceId: a } })).toBe(
        before + (revoked ? 0 : 1),
      );
      if (!revoked) {
        const document = await admin.document.findUniqueOrThrow({
          where: { id: result.body.documentId as string },
        });
        expect(document.yjsState).not.toBeNull();
        expect(
          await admin.embeddingJob.count({ where: { resourceId: document.id, workspaceId: a } }),
        ).toBe(1);
      }
    } finally {
      if (previous === undefined) delete process.env.INGESTION_EXTRACTOR_URL;
      else process.env.INGESTION_EXTRACTOR_URL = previous;
      extractor.closeAllConnections();
      await new Promise<void>((done) => extractor.close(() => done()));
    }
  },
);

it('lifecycle: scopes plans and export requests to current owners without exporting content', async () => {
  const { a, b } = await fixture();
  const base = `/api/v2/workspaces/${a}/lifecycle`;
  expect((await request(app).get(base).set('x-fixture-actor', 'viewer')).status).toBe(403);
  expect((await request(app).get(`/api/v2/workspaces/${b}/lifecycle`)).status).toBe(403);
  const plan = await request(app).get(base);
  expect(plan.status).toBe(200);
  expect(plan.body.workspaceName).toBe(a);
  const denied = await request(app)
    .post(`${base}/export-requests`)
    .set('x-fixture-actor', 'viewer')
    .send({ confirmName: a });
  expect(denied.status).toBe(403);
  const first = await request(app).post(`${base}/export-requests`).send({ confirmName: a });
  expect(first.status).toBe(201);
  expect(first.body.status).toBe('REVIEW_REQUIRED');
  expect(first.body).not.toHaveProperty('content');
  const again = await request(app).post(`${base}/export-requests`).send({ confirmName: a });
  expect(again.body.id).toBe(first.body.id);
  expect(
    (await request(app).post(`${base}/export-requests`).send({ confirmName: a, userId: 'foreign' }))
      .status,
  ).toBe(400);
});
it('lifecycle: ownership transfer is atomic, same-tenant and requires explicit confirmation', async () => {
  const { a, b } = await fixture();
  const target = await admin.workspaceMember.findUniqueOrThrow({
    where: { userId_workspaceId: { userId: 'editor', workspaceId: a } },
  });
  const foreign = await admin.workspaceMember.findFirstOrThrow({ where: { workspaceId: b } });
  const path = `/api/v2/workspaces/${a}/lifecycle/transfer`;
  expect(
    (await request(app).post(path).send({ confirmName: a, newOwnerMemberId: foreign.id })).status,
  ).toBe(404);
  expect(
    (await request(app).post(path).send({ confirmName: 'wrong', newOwnerMemberId: target.id }))
      .status,
  ).toBe(409);
  expect(
    (
      await request(app)
        .post(path)
        .set('x-fixture-actor', 'viewer')
        .send({ confirmName: a, newOwnerMemberId: target.id })
    ).status,
  ).toBe(403);
  expect(
    (await request(app).post(path).send({ confirmName: a, newOwnerMemberId: target.id })).status,
  ).toBe(200);
  expect((await admin.workspaceMember.findUniqueOrThrow({ where: { id: target.id } })).role).toBe(
    'OWNER',
  );
  expect(
    (
      await admin.workspaceMember.findUniqueOrThrow({
        where: { userId_workspaceId: { userId: 'owner', workspaceId: a } },
      })
    ).role,
  ).toBe('EDITOR');
  expect((await request(app).get(`/api/v2/workspaces/${a}/lifecycle`)).status).toBe(403);
});
it('lifecycle: account deletion planning never deletes an identity and flags sole ownership', async () => {
  const { a } = await fixture();
  const plan = await request(app).get('/api/v2/account/deletion-plan');
  expect(plan.status).toBe(200);
  expect(plan.body.deletionAvailable).toBe(false);
  expect(plan.body.ownedWorkspaces.find((w: { id: string }) => w.id === a).requiresTransfer).toBe(
    true,
  );
  expect(
    (await request(app).get('/api/v2/account/deletion-plan').set('x-fixture-actor', 'inactive'))
      .status,
  ).toBe(403);
  expect(await admin.user.findUnique({ where: { id: 'owner' } })).not.toBeNull();
});

it('lifecycle: export metadata has forced tenant RLS and mismatched confirmation fails closed', async () => {
  const { a, b } = await fixture();
  const path = `/api/v2/workspaces/${a}/lifecycle/export-requests`;
  expect((await request(app).post(path).send({ confirmName: 'wrong name' })).status).toBe(409);
  const created = await request(app).post(path).send({ confirmName: a });
  expect(created.status).toBe(201);
  expect(
    await db.withTenantTransaction(b, (tx) =>
      tx.workspaceExportRequest.findMany({ where: { id: created.body.id as string } }),
    ),
  ).toEqual([]);
  await expect(
    db.withTenantTransaction(b, (tx) =>
      tx.workspaceExportRequest.create({ data: { workspaceId: a, requestedBy: 'owner' } }),
    ),
  ).rejects.toThrow(/row-level security/);
});
it('lifecycle: refuses self and inactive ownership targets without demoting the actor', async () => {
  const { a } = await fixture();
  const path = `/api/v2/workspaces/${a}/lifecycle/transfer`;
  const own = await admin.workspaceMember.findUniqueOrThrow({
    where: { userId_workspaceId: { userId: 'owner', workspaceId: a } },
  });
  const inactive = await admin.workspaceMember.findUniqueOrThrow({
    where: { userId_workspaceId: { workspaceId: a, userId: 'inactive' } },
  });
  expect(
    (await request(app).post(path).send({ confirmName: a, newOwnerMemberId: own.id })).status,
  ).toBe(400);
  expect(
    (await request(app).post(path).send({ confirmName: a, newOwnerMemberId: inactive.id })).status,
  ).toBe(403);
  expect((await admin.workspaceMember.findUniqueOrThrow({ where: { id: own.id } })).role).toBe(
    'OWNER',
  );
});
it('lifecycle: deletion planning recognizes another active owner without disclosing their identity', async () => {
  const { a } = await fixture();
  await admin.workspaceMember.update({
    where: { userId_workspaceId: { workspaceId: a, userId: 'editor' } },
    data: { role: 'OWNER' },
  });
  const result = await request(app).get('/api/v2/account/deletion-plan');
  expect(result.body.ownedWorkspaces.find((w: { id: string }) => w.id === a)).toMatchObject({
    activeOwners: 2,
    requiresTransfer: false,
  });
  expect(JSON.stringify(result.body)).not.toContain('editor@example.test');
});
it('lifecycle: provider session routes bind the current principal and reject injected actor fields', async () => {
  const list = jest
    .spyOn(providerSessions, 'list')
    .mockResolvedValue({ items: [], hasMore: false });
  const revoke = jest.spyOn(providerSessions, 'revoke').mockResolvedValue(undefined);
  try {
    expect((await request(app).get('/api/v2/account/sessions')).status).toBe(200);
    expect(list).toHaveBeenCalledWith('fixture', undefined);
    expect(
      (
        await request(app)
          .post('/api/v2/account/sessions/sess_fixture/revoke')
          .send({ userId: 'foreign' })
      ).status,
    ).toBe(400);
    expect(revoke).not.toHaveBeenCalled();
    expect(
      (await request(app).post('/api/v2/account/sessions/sess_fixture/revoke').send({})).status,
    ).toBe(204);
    expect(revoke).toHaveBeenCalledWith('sess_fixture', 'fixture');
  } finally {
    list.mockRestore();
    revoke.mockRestore();
  }
});

it('GitHub rejects an older PR open event after merge without reversing the task', async () => {
  const { a } = await fixture(),
    repository = await repositoryFixture(a);
  await admin.gitHubRepository.update({
    where: { id: repository.id },
    data: { prOpenedColumnId: `column-${a}`, prMergedColumnId: `target-${a}` },
  });
  const key = `ORDER-${sequence}`;
  await admin.task.update({ where: { id: `task-${a}` }, data: { taskKey: key } });
  const merged = {
    action: 'closed',
    pull_request: {
      number: 71,
      merged: true,
      title: `Fixes ${key}`,
      updated_at: '2026-11-08T12:00:00Z',
    },
  };
  expect(
    (await githubEvent(repository.repositoryId, repository.webhookSecret, merged)).status,
  ).toBe(200);
  const stale = await githubEvent(repository.repositoryId, repository.webhookSecret, {
    action: 'opened',
    pull_request: { number: 71, title: `Fixes ${key}`, updated_at: '2026-11-08T11:00:00Z' },
  });
  expect(stale.status).toBe(202);
  expect((await admin.task.findUniqueOrThrow({ where: { id: `task-${a}` } })).columnId).toBe(
    `target-${a}`,
  );
});

it('GitHub check evidence is ordered, tenant isolated and owner-only without deployment inference', async () => {
  const { a, b } = await fixture(),
    repository = await repositoryFixture(a),
    sha = 'a'.repeat(40);
  const payload = {
    action: 'completed',
    check_run: {
      id: 91,
      status: 'completed',
      conclusion: 'success',
      head_sha: sha,
      started_at: '2026-11-08T10:00:00Z',
      completed_at: '2026-11-08T10:05:00Z',
    },
  };
  expect(
    (await githubEvent(repository.repositoryId, 'incorrect', payload, undefined, 'check_run'))
      .status,
  ).toBe(401);
  expect(
    (
      await githubEvent(
        repository.repositoryId,
        repository.webhookSecret,
        payload,
        undefined,
        'check_run',
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await githubEvent(
        repository.repositoryId,
        repository.webhookSecret,
        {
          action: 'created',
          check_run: {
            id: 91,
            status: 'in_progress',
            head_sha: sha,
            started_at: '2026-11-08T10:00:00Z',
          },
        },
        undefined,
        'check_run',
      )
    ).status,
  ).toBe(202);
  const url = `/workspaces/${a}/repos/${repository.id}/execution`;
  const result = await request(app).get(url);
  expect(result.status).toBe(200);
  expect(result.body.items[0]).toMatchObject({
    kind: 'check_run',
    state: 'completed',
    conclusion: 'success',
    providerAt: '2026-11-08T10:05:00.000Z',
  });
  expect(result.body.deployment).toBe('unknown');
  expect(result.body.liveAccess).toBe('not_verified');
  expect((await request(app).get(url).set('x-fixture-actor', 'viewer')).status).toBe(403);
  expect((await request(app).get(`/workspaces/${b}/repos/${repository.id}/execution`)).status).toBe(
    403,
  );
  expect((await db.$queryRaw<unknown[]>`SELECT * FROM "GitHubExecutionState"`).length).toBe(0);
  await admin.gitHubRepository.delete({ where: { id: repository.id } });
  expect((await request(app).get(url)).status).toBe(404);
});

it('signed App withdrawal is idempotent, installation-bound and denies future repository work', async () => {
  const { a, b } = await fixture(),
    first = await repositoryFixture(a),
    other = await repositoryFixture(b);
  await admin.gitHubRepository.update({ where: { id: first.id }, data: { installationId: '456' } });
  await admin.gitHubRepository.update({ where: { id: other.id }, data: { installationId: '999' } });
  const oldId = process.env.GITHUB_APP_ID,
    oldSecret = process.env.GITHUB_APP_WEBHOOK_SECRET,
    secret = randomBytes(32).toString('hex');
  process.env.GITHUB_APP_ID = '123';
  process.env.GITHUB_APP_WEBHOOK_SECRET = secret;
  const body = JSON.stringify({ action: 'deleted', installation: { id: 456, app_id: 123 } });
  const deliver = (signature: string) =>
    request(app)
      .post('/github-installation')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'installation')
      .set('x-hub-signature-256', signature)
      .send(body);
  try {
    expect((await deliver('invalid')).status).toBe(401);
    expect(
      (await admin.gitHubRepository.findUniqueOrThrow({ where: { id: first.id } }))
        .providerDisconnectedAt,
    ).toBeNull();
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect((await deliver(signature)).status).toBe(200);
    const disconnected = (
      await admin.gitHubRepository.findUniqueOrThrow({ where: { id: first.id } })
    ).providerDisconnectedAt;
    expect(disconnected).not.toBeNull();
    expect((await deliver(signature)).status).toBe(200);
    expect(
      (await admin.gitHubRepository.findUniqueOrThrow({ where: { id: first.id } }))
        .providerDisconnectedAt,
    ).toEqual(disconnected);
    expect(
      (await admin.gitHubRepository.findUniqueOrThrow({ where: { id: other.id } }))
        .providerDisconnectedAt,
    ).toBeNull();
    expect(
      (
        await githubEvent(first.repositoryId, first.webhookSecret, {
          action: 'opened',
          pull_request: { title: 'Fixes TEST-123' },
        })
      ).status,
    ).toBe(403);
    const trail = await request(app).get(`/workspaces/${a}/repos/${first.id}/execution`);
    expect(trail.body).toMatchObject({
      items: [],
      liveAccess: 'disconnected',
      deployment: 'unknown',
    });
  } finally {
    if (oldId === undefined) delete process.env.GITHUB_APP_ID;
    else process.env.GITHUB_APP_ID = oldId;
    if (oldSecret === undefined) delete process.env.GITHUB_APP_WEBHOOK_SECRET;
    else process.env.GITHUB_APP_WEBHOOK_SECRET = oldSecret;
  }
});

it('GitHub rejects identical signed payload replay under a different delivery ID', async () => {
  const { a } = await fixture(),
    repository = await repositoryFixture(a);
  const payload = { ref: 'refs/heads/main', commits: [], pusher: { name: 'fixture' } };
  expect(
    (
      await githubEvent(
        repository.repositoryId,
        repository.webhookSecret,
        payload,
        'proof-first',
        'push',
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await githubEvent(
        repository.repositoryId,
        repository.webhookSecret,
        payload,
        'proof-second',
        'push',
      )
    ).status,
  ).toBe(202);
  expect(await admin.activity.count({ where: { workspaceId: a, type: 'github_push' } })).toBe(1);
});

it('GitHub review dismissal and PR renaming retain stable provider identities', async () => {
  const { a } = await fixture(),
    repository = await repositoryFixture(a),
    sha = 'a'.repeat(40);
  const pr = {
    number: 84,
    state: 'open',
    head: { sha },
    updated_at: '2026-11-08T10:00:00Z',
    title: 'Before rename',
  };
  expect(
    (
      await githubEvent(repository.repositoryId, repository.webhookSecret, {
        action: 'opened',
        pull_request: pr,
      })
    ).status,
  ).toBe(202);
  expect(
    (
      await githubEvent(repository.repositoryId, repository.webhookSecret, {
        action: 'edited',
        pull_request: { ...pr, title: 'After rename', updated_at: '2026-11-08T10:01:00Z' },
      })
    ).status,
  ).toBe(202);
  const review = {
    id: 98,
    state: 'approved',
    commit_id: sha,
    submitted_at: '2026-11-08T10:02:00Z',
  };
  expect(
    (
      await githubEvent(
        repository.repositoryId,
        repository.webhookSecret,
        { action: 'submitted', pull_request: pr, review },
        undefined,
        'pull_request_review',
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await githubEvent(
        repository.repositoryId,
        repository.webhookSecret,
        { action: 'dismissed', pull_request: pr, review: { ...review, state: 'dismissed' } },
        undefined,
        'pull_request_review',
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await githubEvent(
        repository.repositoryId,
        repository.webhookSecret,
        { action: 'submitted', pull_request: pr, review },
        undefined,
        'pull_request_review',
      )
    ).status,
  ).toBe(202);
  const trail = await request(app).get(`/workspaces/${a}/repos/${repository.id}/execution`);
  expect(trail.body.items.filter((r: { kind: string }) => r.kind === 'pull_request')).toHaveLength(
    1,
  );
  expect(trail.body.items.find((r: { kind: string }) => r.kind === 'review')).toMatchObject({
    state: 'dismissed',
    pullNumber: 84,
    headSha: sha,
  });
  expect(JSON.stringify(trail.body)).not.toContain('Before rename');
});

it('search returns projected TipTap body edits without an embedding provider', async () => {
  const { a } = await fixture();
  const id = `doc-${a}`;
  const journal = new CrdtJournal(db);
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, await journal.load({ workspaceId: a, documentId: id }));
    const paragraph = new Y.XmlElement('paragraph');
    const text = new Y.XmlText();
    text.insert(0, 'freshbodyquartz');
    paragraph.insert(0, [text]);
    doc.getXmlFragment('default').insert(0, [paragraph]);
    await journal.append({ workspaceId: a, documentId: id }, Y.encodeStateAsUpdate(doc), 'editor');
    const result = await request(app)
      .get(`/workspaces/${a}/search?q=freshbodyquartz`)
      .set('x-fixture-actor', 'viewer');
    expect(result.status).toBe(200);
    expect(result.body.results).toEqual(expect.arrayContaining([expect.objectContaining({ id })]));
  } finally {
    doc.destroy();
  }
});

it('knowledge search scopes source types, dates, assignees and fresh CRDT projections for every reader', async () => {
  const { a, b } = await fixture();
  await admin.task.update({
    where: { id: `task-${a}` },
    data: { assigneeId: 'editor', description: 'quartz searchable task' },
  });
  await admin.document.update({
    where: { id: `doc-${a}` },
    data: {
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'quartz knowledge body' }] },
        ],
      },
    },
  });
  for (const actor of ['owner', 'editor', 'viewer']) {
    const r = await request(app)
      .get(`/workspaces/${a}/knowledge?q=quartz`)
      .set('x-fixture-actor', actor);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `doc-${a}`,
          freshness: 'current_projection',
          method: 'lexical',
        }),
        expect.objectContaining({ id: `task-${a}` }),
      ]),
    );
    expect(JSON.stringify(r.body)).not.toContain(b);
  }
  const filtered = await request(app).get(`/workspaces/${a}/knowledge?q=quartz&assigneeId=editor`);
  expect(filtered.body.results.map((v: { id: string }) => v.id)).toEqual([`task-${a}`]);
  expect(
    (await request(app).get(`/workspaces/${a}/knowledge?q=quartz&type=snippet`)).body.results,
  ).toEqual([]);
  expect(
    (await request(app).get(`/workspaces/${a}/knowledge?q=quartz&after=2099-01-01T00:00:00Z`)).body
      .results,
  ).toEqual([]);
  expect(
    (await request(app).get(`/workspaces/${a}/knowledge?q=quartz&before=2000-01-01T00:00:00Z`)).body
      .results,
  ).toEqual([]);
  expect(
    (
      await request(app).get(
        `/workspaces/${a}/knowledge?q=quartz&before=2000-01-01T00:00:00Z&after=2099-01-01T00:00:00Z`,
      )
    ).status,
  ).toBe(400);
  expect((await request(app).get(`/workspaces/${b}/knowledge?q=quartz`)).status).toBe(403);
  expect(
    (await request(app).get(`/workspaces/${a}/knowledge/source?type=document&id=doc-${b}`)).status,
  ).toBe(404);
  expect(
    (await request(app).get(`/workspaces/${a}/knowledge/source?type=document&id=doc-${a}`)).status,
  ).toBe(200);
  await admin.document.update({ where: { id: `doc-${a}` }, data: { isArchived: true } });
  expect(
    (await request(app).get(`/workspaces/${a}/knowledge/source?type=document&id=doc-${a}`)).status,
  ).toBe(404);
  expect(
    (await request(app).get(`/workspaces/${a}/knowledge?q=quartz&type=document`)).body.results,
  ).toEqual([]);
  await admin.workspaceMember.delete({
    where: { userId_workspaceId: { userId: 'viewer', workspaceId: a } },
  });
  expect(
    (
      await request(app)
        .get(`/workspaces/${a}/knowledge/source?type=task&id=task-${a}`)
        .set('x-fixture-actor', 'viewer')
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .get(`/workspaces/${a}/knowledge?q=quartz`)
        .set('x-fixture-actor', 'inactive')
    ).status,
  ).toBe(403);
});
it('knowledge receipt derivatives and GitHub metadata retain source and owner authority', async () => {
  const { a, b } = await fixture();
  const oldFlag = process.env.FEATURE_DECISION_RECEIPTS;
  try {
    process.env.FEATURE_DECISION_RECEIPTS = 'true';
    const receipt = await admin.decisionReceipt.create({
      data: {
        workspaceId: a,
        sourceKind: 'document',
        sourceId: `doc-${a}`,
        sourceRevision: 'a'.repeat(64),
        excerpt: 'quartz proof',
        title: 'quartz decision',
        rationale: 'bounded evidence',
        createdBy: 'owner',
      },
    });
    const foreign = await admin.decisionReceipt.create({
      data: {
        workspaceId: a,
        sourceKind: 'document',
        sourceId: `doc-${b}`,
        sourceRevision: 'a'.repeat(64),
        excerpt: 'quartz foreign',
        title: 'hiddenquartz',
        rationale: 'never disclose',
        createdBy: 'owner',
      },
    });
    const repo = await admin.gitHubRepository.create({
      data: {
        workspaceId: a,
        repositoryId: `repo-${a}`,
        installationId: '456',
        owner: 'fixture',
        name: 'quartz',
        webhookSecret: 'fixture-not-a-secret',
      },
    });
    await admin.gitHubExecutionState.create({
      data: {
        repositoryId: repo.id,
        workspaceId: a,
        kind: 'pull_request',
        subject: '7',
        state: 'open',
        headSha: 'a'.repeat(40),
        providerAt: new Date(),
        rank: 1,
        pullNumber: 7,
      },
    });
    const owner = await request(app).get(`/workspaces/${a}/knowledge?q=quartz`);
    expect(owner.body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: receipt.id }),
        expect.objectContaining({
          id: `${repo.id}:7`,
          href: 'https://github.com/fixture/quartz/pull/7',
        }),
      ]),
    );
    expect(JSON.stringify(owner.body)).not.toContain(foreign.id);
    const viewer = await request(app)
      .get(`/workspaces/${a}/knowledge?q=quartz`)
      .set('x-fixture-actor', 'viewer');
    expect(viewer.body.results.some((v: { type: string }) => v.type === 'pull_request')).toBe(
      false,
    );
    expect(
      (
        await request(app)
          .get(`/workspaces/${a}/knowledge/source?type=pull_request&id=${repo.id}:7`)
          .set('x-fixture-actor', 'editor')
      ).status,
    ).toBe(404);
    await admin.gitHubRepository.update({
      where: { id: repo.id },
      data: { providerDisconnectedAt: new Date() },
    });
    expect(
      (
        await request(app).get(
          `/workspaces/${a}/knowledge/source?type=pull_request&id=${repo.id}:7`,
        )
      ).status,
    ).toBe(404);
    await admin.document.update({ where: { id: `doc-${a}` }, data: { isArchived: true } });
    expect(
      (await request(app).get(`/workspaces/${a}/knowledge/source?type=decision&id=${receipt.id}`))
        .status,
    ).toBe(404);
    process.env.FEATURE_DECISION_RECEIPTS = 'false';
    expect(
      (await request(app).get(`/workspaces/${a}/knowledge?q=quartz&type=decision`)).body.results,
    ).toEqual([]);
  } finally {
    if (oldFlag === undefined) delete process.env.FEATURE_DECISION_RECEIPTS;
    else process.env.FEATURE_DECISION_RECEIPTS = oldFlag;
  }
});
it('semantic retrieval excludes invalidated vectors and embedding uses only TipTap text', async () => {
  const { a } = await fixture();
  const id = `doc-${a}`;
  await admin.document.update({
    where: { id },
    data: {
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { privateAttribute: 'notbodymarker' },
            content: [{ type: 'text', text: 'semanticquartz' }],
          },
        ],
      },
    },
  });
  await withDatabase(db, () =>
    db.withTenantTransaction(a, (tx) => queueEmbedding('document', id, tx, a, 'editor')),
  );
  const provider = jest.fn(async (text: string) => {
    expect(text).toContain('semanticquartz');
    expect(text).not.toContain('notbodymarker');
    return Array<number>(1536).fill(0.01);
  });
  await withDatabase(db, () => refreshEmbedding('document', id, a, provider));
  const queryProvider = async () => Array<number>(1536).fill(0.01);
  expect(
    (
      await withDatabase(db, () =>
        semanticWorkspaceContext(a, 'semanticquartz', 20, 'viewer', queryProvider),
      )
    ).some((v) => v.type === 'document'),
  ).toBe(true);
  await admin.document.update({ where: { id }, data: { embeddingHash: null } });
  expect(
    (
      await withDatabase(db, () =>
        semanticWorkspaceContext(a, 'semanticquartz', 20, 'viewer', queryProvider),
      )
    ).some((v) => v.type === 'document'),
  ).toBe(false);
});
it('embedding preserves legacy string document bodies while excluding TipTap attributes', async () => {
  const { a } = await fixture();
  const id = `doc-${a}`;
  await admin.document.update({ where: { id }, data: { content: 'legacyquartzbody' } });
  await withDatabase(db, () =>
    db.withTenantTransaction(a, (tx) => queueEmbedding('document', id, tx, a, 'editor')),
  );
  await withDatabase(db, () =>
    refreshEmbedding('document', id, a, async (text) => {
      expect(text).toContain('legacyquartzbody');
      return Array<number>(1536).fill(0.01);
    }),
  );
});

it('knowledge timestamps and inclusive filters use UTC under a non-UTC database session', async () => {
  const { a } = await fixture();
  const instant = '2026-11-08T10:00:00.000Z';
  await admin.document.update({
    where: { id: `doc-${a}` },
    data: { title: 'regionalquartz', updatedAt: new Date(instant) },
  });
  await admin.$executeRawUnsafe("ALTER ROLE resource_runtime SET timezone TO 'Asia/Kolkata'");
  const regional = createTenantPrismaClient(
    new PrismaClient({ datasourceUrl: runtimeDatabaseUrl }),
  );
  try {
    const result = await withDatabase(regional, () =>
      searchKnowledge('viewer', a, {
        q: 'regionalquartz',
        limit: 20,
        after: instant,
        before: instant,
      }),
    );
    expect(result.results).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: `doc-${a}`, updatedAt: instant })]),
    );
  } finally {
    await regional.$disconnect();
    await admin.$executeRawUnsafe("ALTER ROLE resource_runtime SET timezone TO 'UTC'");
  }
});

it('grounded previews reject foreign authority, viewer drafts, fabricated citations and source withdrawal', async () => {
  const { a, b } = await fixture();
  const generate = jest.mocked(completeWithFallback);
  generate.mockClear();
  const input = { workspaceId: a, prompt: 'Document', purpose: 'qa' };
  await expect(withDatabase(db, () => groundedPreview('foreign', input))).rejects.toThrow();
  await expect(
    withDatabase(db, () => groundedPreview('viewer', { ...input, purpose: 'meeting_tasks' })),
  ).rejects.toThrow();
  expect(generate).not.toHaveBeenCalled();
  generate.mockResolvedValue({
    provider: 'groq',
    content: JSON.stringify({
      claims: [{ text: 'Fixture claim', references: [999] }],
      proposals: [],
    }),
  });
  await expect(withDatabase(db, () => groundedPreview('viewer', input))).rejects.toThrow(
    'invalid structure or citations',
  );
  generate.mockImplementation(async () => {
    await admin.document.update({ where: { id: `doc-${a}` }, data: { isArchived: true } });
    return {
      provider: 'groq',
      content: JSON.stringify({
        claims: [{ text: 'Fixture claim', references: [1] }],
        proposals: [],
      }),
    };
  });
  await expect(withDatabase(db, () => groundedPreview('viewer', input))).rejects.toThrow(
    'Source unavailable',
  );
  generate.mockClear();
  expect(await withDatabase(db, () => groundedPreview('viewer', input))).toMatchObject({
    status: 'insufficient_evidence',
    sources: [],
  });
  expect(generate).not.toHaveBeenCalled();
  expect((await admin.document.findUniqueOrThrow({ where: { id: `doc-${b}` } })).isArchived).toBe(
    false,
  );
});

it('grounded previews cite current local sources without writing tasks or accepting receipts', async () => {
  const { a } = await fixture();
  jest.mocked(completeWithFallback).mockResolvedValue({
    provider: 'groq',
    content: JSON.stringify({
      claims: [{ text: 'Fixture summary', references: [1] }],
      proposals: [
        {
          kind: 'task',
          title: 'Review document',
          description: 'Human review required',
          references: [1],
        },
      ],
    }),
  });
  const before = await admin.task.count();
  const result = await withDatabase(db, () =>
    groundedPreview('editor', { workspaceId: a, prompt: 'Document', purpose: 'meeting_tasks' }),
  );
  expect(result).toMatchObject({
    status: 'preview',
    cost: 'unavailable',
    sources: [{ id: `doc-${a}` }],
    proposals: [{ kind: 'task' }],
  });
  expect(await admin.task.count()).toBe(before);
  jest.mocked(completeWithFallback).mockResolvedValue({
    provider: 'groq',
    content: JSON.stringify({
      claims: [{ text: 'Synthetic fixture summary', references: [1] }],
      proposals: [],
    }),
  });
  const evaluation = await withDatabase(db, () =>
    evaluateGroundedCases([
      {
        id: 'synthetic-structural-only',
        actorId: 'editor',
        workspaceId: a,
        prompt: 'Document',
        reviewedBy: 'unit-test-fixture-not-model-evaluation',
        reviewedAt: '2026-11-09T00:00:00Z',
        expectedSourceIds: [`doc-${a}`],
        expectedStatements: ['Synthetic fixture summary'],
      },
    ]),
  );
  expect(evaluation).toMatchObject({
    reports: [
      {
        status: 'preview',
        expectedCitationsPresent: true,
        expectedStatementsPresent: true,
        costUsd: null,
        humanSemanticReviewRequired: true,
      },
    ],
    factualTruthVerified: false,
  });
  jest.mocked(completeWithFallback).mockRejectedValue(new Error('private provider detail'));
  await expect(
    withDatabase(db, () =>
      groundedPreview('editor', { workspaceId: a, prompt: 'Document', purpose: 'qa' }),
    ),
  ).rejects.toThrow('AI provider unavailable');
});

it('grounded API flag denies disabled access and enabled empty retrieval never calls a model', async () => {
  const { a } = await fixture();
  const old = process.env.FEATURE_GROUNDED_AI;
  const generate = jest.mocked(completeWithFallback);
  generate.mockClear();
  try {
    process.env.FEATURE_GROUNDED_AI = 'false';
    expect(
      (
        await request(app)
          .post('/ai-v3/grounded')
          .set('x-verified-clerk-fixture', 'fixture_owner')
          .send({ workspaceId: a, prompt: 'Document', purpose: 'qa' })
      ).status,
    ).toBe(404);
    process.env.FEATURE_GROUNDED_AI = 'true';
    expect(
      (
        await request(app)
          .post('/ai-v3/grounded')
          .set('x-verified-clerk-fixture', 'fixture_owner')
          .send({})
      ).status,
    ).toBe(400);
    const result = await request(app)
      .post('/ai-v3/grounded')
      .set('x-verified-clerk-fixture', 'fixture_owner')
      .send({ workspaceId: a, prompt: 'unfindablegroundingfixture', purpose: 'qa' });
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body).toMatchObject({
      status: 'insufficient_evidence',
      sources: [],
      proposals: [],
    });
    expect(generate).not.toHaveBeenCalled();
  } finally {
    if (old === undefined) delete process.env.FEATURE_GROUNDED_AI;
    else process.env.FEATURE_GROUNDED_AI = old;
  }
});

it('automation rules default disabled and only current owners may enable them in their own workspace', async () => {
  const { a, b } = await fixture();
  const input = {
    title: 'Review notification',
    trigger: 'task_review',
    action: 'notify',
    debounceSeconds: 30,
    condition: 'always',
  };
  const create = (actor: string, workspaceId: string) =>
    withDatabase(db, () => createAutomationRule(actor, workspaceId, input));
  await expect(create('viewer', a)).rejects.toThrow();
  await expect(create('editor', a)).rejects.toThrow();
  await expect(create('owner', b)).rejects.toThrow();
  const rule = await create('owner', a);
  expect(rule.enabled).toBe(false);
  await admin.workspaceMember.create({ data: { workspaceId: b, userId: 'owner', role: 'OWNER' } });
  await expect(
    withDatabase(db, () => setAutomationEnabled('editor', a, rule.id, true)),
  ).rejects.toThrow();
  await expect(
    withDatabase(db, () => setAutomationEnabled('owner', b, rule.id, true)),
  ).rejects.toThrow('Rule unavailable');
  expect(
    await db.withTenantTransaction(
      b,
      (tx) => tx.$queryRaw`SELECT id FROM "AutomationRule" WHERE id=${rule.id}`,
    ),
  ).toEqual([]);
  const enabled = await withDatabase(db, () => setAutomationEnabled('owner', a, rule.id, true));
  expect(enabled.enabled).toBe(true);
  expect(
    (await withDatabase(db, () => setAutomationEnabled('owner', a, rule.id, true))).version,
  ).toBe(enabled.version);
  expect(await withDatabase(db, () => listAutomationRules('viewer', a))).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: rule.id, enabled: true })]),
  );
  await admin.workspaceMember.delete({
    where: { userId_workspaceId: { userId: 'viewer', workspaceId: a } },
  });
  await expect(withDatabase(db, () => listAutomationRules('viewer', a))).rejects.toThrow();
});

it('automation rule API is flagged, validates input and enforces owner and viewer roles', async () => {
  const { a } = await fixture();
  const before = process.env.FEATURE_AUTOMATION;
  const input = {
    title: 'Review notice',
    trigger: 'task_review',
    action: 'notify',
    condition: 'always',
    debounceSeconds: 30,
  };
  try {
    process.env.FEATURE_AUTOMATION = 'false';
    expect((await request(app).get(`/automation/${a}`)).status).toBe(404);
    process.env.FEATURE_AUTOMATION = 'true';
    expect(
      (await request(app).post(`/automation/${a}`).set('x-fixture-actor', 'viewer').send(input))
        .status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/automation/${a}`)
          .send({ ...input, action: 'update_linked_status' })
      ).status,
    ).toBe(400);
    const created = await request(app).post(`/automation/${a}`).send(input);
    expect(created.status).toBe(201);
    expect(created.body.enabled).toBe(false);
    expect(
      (
        await request(app)
          .patch(`/automation/${a}/${created.body.id}/enabled`)
          .set('x-fixture-actor', 'editor')
          .send({ enabled: true })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(`/automation/${a}/${created.body.id}/enabled`)
          .send({ enabled: true })
      ).status,
    ).toBe(200);
    const list = await request(app).get(`/automation/${a}`).set('x-fixture-actor', 'viewer');
    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toBe('no-store');
    expect(list.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.body.id, enabled: true })]),
    );
  } finally {
    if (before === undefined) delete process.env.FEATURE_AUTOMATION;
    else process.env.FEATURE_AUTOMATION = before;
  }
});

it('automation rule creation binds idempotency to current owner authority and payload', async () => {
  const { a } = await fixture();
  const previous = process.env.FEATURE_AUTOMATION;
  const data = {
    title: 'Retry-safe rule',
    trigger: 'task_review',
    action: 'notify',
    condition: 'always',
    debounceSeconds: 30,
  };
  try {
    process.env.FEATURE_AUTOMATION = 'true';
    const create = (payload: object) =>
      request(app)
        .post(`/automation/${a}`)
        .set('Idempotency-Key', 'rule-fixture-key')
        .send(payload);
    const [first, second] = await Promise.all([create(data), create(data)]);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body.id).toBe(second.body.id);
    expect((await create({ ...data, title: 'Different' })).status).toBe(409);
    await admin.workspaceMember.delete({
      where: { userId_workspaceId: { userId: 'owner', workspaceId: a } },
    });
    expect((await create(data)).status).toBe(403);
  } finally {
    if (previous === undefined) delete process.env.FEATURE_AUTOMATION;
    else process.env.FEATURE_AUTOMATION = previous;
  }
});

it('automation requires current owner approval, deduplicates events, debounces and rechecks tenant source', async () => {
  const { a, b } = await fixture();
  await admin.workspaceMember.create({ data: { workspaceId: b, userId: 'owner', role: 'OWNER' } });
  const rule = await withDatabase(db, () =>
    createAutomationRule('owner', a, {
      title: 'Review notice',
      trigger: 'task_review',
      action: 'notify',
      condition: 'always',
      debounceSeconds: 60,
    }),
  );
  const input = { trigger: 'task_review', taskId: `task-${a}` };
  const submit = (actor: string, payload: object, key: string) =>
    withDatabase(db, () => submitAutomationEvent(actor, a, payload, key));
  expect((await submit('editor', input, 'off')).executions).toHaveLength(0);
  await withDatabase(db, () => setAutomationEnabled('owner', a, rule.id, true));
  await expect(submit('viewer', input, 'viewer')).rejects.toThrow();
  await expect(submit('owner', { ...input, taskId: `task-${b}` }, 'foreign')).rejects.toThrow();
  const [first, retry] = await Promise.all([
    submit('editor', input, 'same-event'),
    submit('editor', input, 'same-event'),
  ]);
  expect(first.eventId).toBe(retry.eventId);
  expect(first.executions).toHaveLength(1);
  expect(retry.executions[0].id).toBe(first.executions[0].id);
  await expect(
    submit('editor', { trigger: 'blocker', taskId: `task-${a}` }, 'same-event'),
  ).rejects.toThrow();
  expect((await submit('editor', input, 'debounced')).executions).toHaveLength(0);
  const executionId = first.executions[0].id;
  await expect(
    withDatabase(db, () => approveAutomationExecution('owner', b, executionId)),
  ).rejects.toThrow('Execution unavailable');
  await expect(submit('editor', { ...input, depth: 1 }, 'forged-chain')).rejects.toThrow();
  await expect(
    withDatabase(db, () => executeAutomationExecution(a, executionId, 'unapproved')),
  ).rejects.toThrow();
  await expect(
    withDatabase(db, () => approveAutomationExecution('editor', a, executionId)),
  ).rejects.toThrow();
  expect(
    (await withDatabase(db, () => approveAutomationExecution('owner', a, executionId))).status,
  ).toBe('approved');
  const before = await admin.activity.count({
    where: { workspaceId: a, type: 'automation_notification' },
  });
  const claims = await Promise.all([
    withDatabase(db, () => claimAutomationExecution(a, executionId)),
    withDatabase(db, () => claimAutomationExecution(a, executionId)),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  const token = claims.find(Boolean)!.token;
  const [one, two] = await Promise.all([
    withDatabase(db, () => executeAutomationExecution(a, executionId, token)),
    withDatabase(db, () => executeAutomationExecution(a, executionId, token)),
  ]);
  expect(one.status).toBe('completed');
  expect(two.status).toBe('completed');
  expect(
    await admin.activity.count({ where: { workspaceId: a, type: 'automation_notification' } }),
  ).toBe(before + 1);
  const timeline = await withDatabase(db, () => listAutomationExecutions('owner', a));
  expect(timeline).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: executionId,
        status: 'completed',
        errorCode: null,
      }),
    ]),
  );
  expect(JSON.stringify(timeline)).not.toContain('private-fixture-error');
  await expect(withDatabase(db, () => listAutomationExecutions('viewer', a))).rejects.toThrow();
  const visible = await request(app)
    .get(`/workspaces/${a}/activities`)
    .set('x-fixture-actor', 'viewer');
  expect(
    visible.body.some((item: { type: string }) => item.type === 'automation_notification'),
  ).toBe(true);
  await admin.task.delete({ where: { id: `task-${a}` } });
  const afterDeletion = await request(app)
    .get(`/workspaces/${a}/activities`)
    .set('x-fixture-actor', 'viewer');
  expect(
    afterDeletion.body.some((item: { type: string }) => item.type === 'automation_notification'),
  ).toBe(false);
});

it('automation preview is read-only and event approval is separately authorized', async () => {
  const { a, b } = await fixture();
  const previous = process.env.FEATURE_AUTOMATION;
  try {
    process.env.FEATURE_AUTOMATION = 'true';
    const rule = await withDatabase(db, () =>
      createAutomationRule('owner', a, {
        title: 'Preview rule',
        trigger: 'task_review',
        action: 'notify',
        condition: 'always',
        debounceSeconds: 30,
      }),
    );
    const preview = { ruleId: rule.id, trigger: 'task_review', taskId: `task-${a}` };
    const path = `/automation/${a}`;
    expect((await request(app).post(`${path}/preview`).send(preview)).body).toMatchObject({
      eligible: false,
      reason: 'disabled',
      requiresApproval: true,
    });
    await withDatabase(db, () => setAutomationEnabled('owner', a, rule.id, true));
    expect(
      (
        await request(app)
          .post(`${path}/preview`)
          .send({ ...preview, ruleId: 'missing-rule' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`${path}/preview`)
          .send({ ...preview, trigger: 'blocker' })
      ).body,
    ).toMatchObject({ eligible: false, reason: 'wrong_trigger' });
    const priorityRule = await withDatabase(db, () =>
      createAutomationRule('owner', a, {
        title: 'Urgent review',
        trigger: 'task_review',
        action: 'notify',
        condition: 'high_priority',
        debounceSeconds: 30,
      }),
    );
    await withDatabase(db, () => setAutomationEnabled('owner', a, priorityRule.id, true));
    await admin.task.update({ where: { id: `task-${a}` }, data: { priority: 'LOW' } });
    expect(
      (
        await request(app)
          .post(`${path}/preview`)
          .send({ ...preview, ruleId: priorityRule.id })
      ).body,
    ).toMatchObject({ eligible: false, reason: 'condition_failed' });
    expect(
      (await request(app).post(`${path}/preview`).set('x-fixture-actor', 'viewer').send(preview))
        .status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`${path}/preview`)
          .send({ ...preview, taskId: `task-${b}` })
      ).status,
    ).toBe(404);
    expect((await request(app).post(`${path}/preview`).send(preview)).body).toMatchObject({
      eligible: true,
      reason: 'eligible',
      requiresApproval: true,
    });
    expect((await request(app).get(`${path}/executions`)).body).toEqual([]);
    const event = await request(app)
      .post(`${path}/events`)
      .set('Idempotency-Key', 'event-preview-fixture')
      .send({ trigger: 'task_review', taskId: `task-${a}` });
    expect(event.status).toBe(201);
    const id = event.body.executions[0].id as string;
    expect((await request(app).post(`${path}/preview`).send(preview)).body).toMatchObject({
      eligible: false,
      reason: 'debounced',
    });
    expect(
      (
        await request(app)
          .post(`${path}/executions/${id}/approve`)
          .set('x-fixture-actor', 'editor')
          .send({})
      ).status,
    ).toBe(403);
    expect((await request(app).post(`${path}/executions/${id}/approve`).send({})).body.status).toBe(
      'approved',
    );
    expect(
      (await request(app).get(`${path}/executions`).set('x-fixture-actor', 'viewer')).status,
    ).toBe(403);
    expect((await request(app).get(`${path}/executions`)).body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id,
          status: 'approved',
          current: true,
          origin: 'human_assertion',
        }),
      ]),
    );
  } finally {
    if (previous === undefined) delete process.env.FEATURE_AUTOMATION;
    else process.env.FEATURE_AUTOMATION = previous;
  }
});

it('automation leases serialize attempts and fail closed after three redacted failures', async () => {
  const { a } = await fixture();
  const rule = await withDatabase(db, () =>
    createAutomationRule('owner', a, {
      title: 'Bounded retries',
      trigger: 'task_review',
      action: 'notify',
      condition: 'always',
      debounceSeconds: 1,
    }),
  );
  await withDatabase(db, () => setAutomationEnabled('owner', a, rule.id, true));
  const event = await withDatabase(db, () =>
    submitAutomationEvent(
      'editor',
      a,
      { trigger: 'task_review', taskId: `task-${a}` },
      'lease-fixture',
    ),
  );
  const id = event.executions[0].id;
  await withDatabase(db, () => approveAutomationExecution('owner', a, id));
  for (let attempt = 1; attempt <= 3; attempt++) {
    const claim = await withDatabase(db, () => claimAutomationExecution(a, id));
    expect(claim?.attempt).toBe(attempt);
    expect(await withDatabase(db, () => claimAutomationExecution(a, id))).toBeNull();
    const result = await withDatabase(db, () => failAutomationClaim(a, id, claim!.token));
    expect(result.status).toBe(attempt === 3 ? 'failed' : 'approved');
  }
  const timeline = await withDatabase(db, () => listAutomationExecutions('owner', a));
  expect(timeline).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id, status: 'failed', errorCode: 'worker_failed' }),
    ]),
  );
  expect(
    await admin.activity.count({ where: { workspaceId: a, type: 'automation_notification' } }),
  ).toBe(0);
});

it('automation cancels approved work when its initiating member loses write access', async () => {
  const { a } = await fixture();
  const rule = await withDatabase(db, () =>
    createAutomationRule('owner', a, {
      title: 'Revocation',
      trigger: 'task_review',
      action: 'notify',
      condition: 'always',
      debounceSeconds: 1,
    }),
  );
  await withDatabase(db, () => setAutomationEnabled('owner', a, rule.id, true));
  const event = await withDatabase(db, () =>
    submitAutomationEvent(
      'editor',
      a,
      { trigger: 'task_review', taskId: `task-${a}` },
      'revocation-fixture',
    ),
  );
  const id = event.executions[0].id;
  await withDatabase(db, () => approveAutomationExecution('owner', a, id));
  await admin.workspaceMember.delete({
    where: { userId_workspaceId: { userId: 'editor', workspaceId: a } },
  });
  const claim = await withDatabase(db, () => claimAutomationExecution(a, id));
  expect(
    (await withDatabase(db, () => executeAutomationExecution(a, id, claim!.token))).status,
  ).toBe('cancelled');
  expect(
    await admin.activity.count({ where: { workspaceId: a, type: 'automation_notification' } }),
  ).toBe(0);
  expect(
    await db.withTenantTransaction(
      a,
      (tx) => tx.$executeRaw`UPDATE "AutomationAudit" SET kind='failed' WHERE "executionId"=${id}`,
    ),
  ).toBe(0);
  expect(
    await db.withTenantTransaction(
      a,
      (tx) => tx.$executeRaw`DELETE FROM "AutomationAudit" WHERE "executionId"=${id}`,
    ),
  ).toBe(0);
});

it('duplicate opaque BullMQ jobs produce exactly one approved local activity', async () => {
  const { a } = await fixture();
  const redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();
  const connection = {
    host: redisContainer.getHost(),
    port: redisContainer.getMappedPort(6379),
    maxRetriesPerRequest: null,
  };
  const name = `automation-fixture-${randomBytes(8).toString('hex')}`;
  const queue = new Queue(name, { connection });
  let worker: Worker | undefined;
  const previousFlag = process.env.FEATURE_AUTOMATION,
    previousKey = process.env.ENCRYPTION_KEY;
  try {
    process.env.FEATURE_AUTOMATION = 'true';
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
    const rule = await withDatabase(db, () =>
      createAutomationRule('owner', a, {
        title: 'Queue once',
        trigger: 'task_review',
        action: 'notify',
        condition: 'always',
        debounceSeconds: 1,
      }),
    );
    await withDatabase(db, () => setAutomationEnabled('owner', a, rule.id, true));
    const event = await withDatabase(db, () =>
      submitAutomationEvent(
        'editor',
        a,
        { trigger: 'task_review', taskId: `task-${a}` },
        'queue-once',
      ),
    );
    const executionId = event.executions[0].id;
    await withDatabase(db, () => approveAutomationExecution('owner', a, executionId));
    const data = automationJob(a, executionId),
      jobId = automationJobId(executionId);
    expect(JSON.stringify(data)).not.toContain(a);
    await Promise.all([
      queue.add('execute', data, { jobId }),
      queue.add('execute', data, { jobId }),
    ]);
    worker = new Worker(
      name,
      async (job) => withDatabase(db, () => processAutomationJob(job.data)),
      { connection, concurrency: 2 },
    );
    const deadline = Date.now() + 15000;
    while (
      Date.now() < deadline &&
      (await admin.automationExecution.findUniqueOrThrow({ where: { id: executionId } })).status !==
        'completed'
    )
      await new Promise((resolve) => setTimeout(resolve, 30));
    expect(
      (await admin.automationExecution.findUniqueOrThrow({ where: { id: executionId } })).status,
    ).toBe('completed');
    await withDatabase(db, () => processAutomationJob(data));
    expect(
      await admin.activity.count({ where: { workspaceId: a, type: 'automation_notification' } }),
    ).toBe(1);
    expect(
      await admin.automationAudit.count({
        where: { workspaceId: a, executionId, kind: 'completed' },
      }),
    ).toBe(1);
  } finally {
    await worker?.close();
    await queue.close();
    await redisContainer.stop();
    if (previousFlag === undefined) delete process.env.FEATURE_AUTOMATION;
    else process.env.FEATURE_AUTOMATION = previousFlag;
    if (previousKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = previousKey;
  }
});

it('signed PR redelivery creates one owner-only approval and only a locally recorded report', async () => {
  const { a } = await fixture(),
    repository = await repositoryFixture(a);
  const previous = process.env.FEATURE_AUTOMATION;
  try {
    process.env.FEATURE_AUTOMATION = 'true';
    const rule = await withDatabase(db, () =>
      createAutomationRule('owner', a, {
        title: 'PR report',
        trigger: 'pr_merged',
        action: 'prepare_report',
        condition: 'always',
        debounceSeconds: 30,
      }),
    );
    await withDatabase(db, () => setAutomationEnabled('owner', a, rule.id, true));
    const payload = {
      action: 'closed',
      pull_request: {
        number: 83,
        merged: true,
        updated_at: '2026-11-09T10:00:00Z',
        head: { sha: 'a'.repeat(40) },
      },
    };
    expect(
      (await githubEvent(repository.repositoryId, 'incorrect-fixture-secret', payload)).status,
    ).toBe(401);
    expect(await withDatabase(db, () => listAutomationExecutions('owner', a))).toHaveLength(0);
    expect(
      (await githubEvent(repository.repositoryId, repository.webhookSecret, payload)).status,
    ).toBe(202);
    expect(
      (await githubEvent(repository.repositoryId, repository.webhookSecret, payload)).status,
    ).toBe(202);
    const pending = await withDatabase(db, () => listAutomationExecutions('owner', a));
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ status: 'pending_approval', origin: 'signed_webhook' });
    expect(pending[0]).toMatchObject({
      source: {
        kind: 'github',
        repository: `fixture/${a}`,
        subject: '83',
        liveAccess: 'not_verified',
      },
      action: 'prepare_report',
    });
    await expect(withDatabase(db, () => listAutomationExecutions('viewer', a))).rejects.toThrow();
    const id = pending[0].id;
    await withDatabase(db, () => approveAutomationExecution('owner', a, id));
    const claim = await withDatabase(db, () => claimAutomationExecution(a, id));
    expect(
      (await withDatabase(db, () => executeAutomationExecution(a, id, claim!.token))).status,
    ).toBe('completed');
    expect(await withDatabase(db, () => claimAutomationExecution(a, id))).toBeNull();
    expect(
      (await withDatabase(db, () => executeAutomationExecution(a, id, claim!.token))).status,
    ).toBe('completed');
    expect((await withDatabase(db, () => listAutomationExecutions('owner', a)))[0]).toMatchObject({
      report: { kind: 'signed_webhook_record', pullNumber: 83, liveAccess: 'not_verified' },
    });
    expect(
      await admin.automationAudit.count({
        where: { workspaceId: a, executionId: id, kind: 'completed' },
      }),
    ).toBe(1);
    await admin.gitHubRepository.update({
      where: { id: repository.id },
      data: { providerDisconnectedAt: new Date() },
    });
    expect(await withDatabase(db, () => listAutomationExecutions('owner', a))).toEqual([]);
  } finally {
    if (previous === undefined) delete process.env.FEATURE_AUTOMATION;
    else process.env.FEATURE_AUTOMATION = previous;
  }
});

it('a signed CI fixture cannot update linked status or establish verified CI', async () => {
  const { a } = await fixture(),
    repository = await repositoryFixture(a);
  const previous = process.env.FEATURE_AUTOMATION;
  try {
    process.env.FEATURE_AUTOMATION = 'true';
    const rule = await withDatabase(db, () =>
      createAutomationRule('owner', a, {
        title: 'CI update',
        trigger: 'ci_passed',
        action: 'update_linked_status',
        condition: 'always',
        debounceSeconds: 30,
      }),
    );
    await withDatabase(db, () => setAutomationEnabled('owner', a, rule.id, true));
    const taskBefore = await admin.task.findUniqueOrThrow({ where: { id: `task-${a}` } });
    const payload = {
      action: 'completed',
      check_run: {
        id: 331,
        status: 'completed',
        conclusion: 'success',
        head_sha: 'b'.repeat(40),
        completed_at: '2026-11-09T10:05:00Z',
      },
    };
    expect(
      (
        await githubEvent(
          repository.repositoryId,
          repository.webhookSecret,
          payload,
          undefined,
          'check_run',
        )
      ).status,
    ).toBe(200);
    const pending = await withDatabase(db, () => listAutomationExecutions('owner', a));
    expect(pending).toHaveLength(1);
    const id = pending[0].id;
    await withDatabase(db, () => approveAutomationExecution('owner', a, id));
    const claim = await withDatabase(db, () => claimAutomationExecution(a, id));
    expect(
      await withDatabase(db, () => executeAutomationExecution(a, id, claim!.token)),
    ).toMatchObject({ status: 'unavailable', errorCode: 'ci_verification_unavailable' });
    expect(await admin.task.findUniqueOrThrow({ where: { id: `task-${a}` } })).toEqual(taskBefore);
    expect(
      JSON.stringify(await withDatabase(db, () => listAutomationExecutions('owner', a))),
    ).not.toContain('deployment_verified');
  } finally {
    if (previous === undefined) delete process.env.FEATURE_AUTOMATION;
    else process.env.FEATURE_AUTOMATION = previous;
  }
});

it('GitHub automation rule configuration is visible only to owners', async () => {
  const { a } = await fixture();
  const rule = await withDatabase(db, () =>
    createAutomationRule('owner', a, {
      title: 'Private repository workflow',
      trigger: 'pr_merged',
      action: 'prepare_report',
      condition: 'always',
      debounceSeconds: 30,
    }),
  );
  await expect(
    admin.$executeRaw`UPDATE "AutomationRule" SET action='notify' WHERE id=${rule.id}`,
  ).rejects.toThrow();
  expect(await withDatabase(db, () => listAutomationRules('owner', a))).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: rule.id })]),
  );
  expect(await withDatabase(db, () => listAutomationRules('editor', a))).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: rule.id })]),
  );
  expect(await withDatabase(db, () => listAutomationRules('viewer', a))).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: rule.id })]),
  );
  const previous = process.env.FEATURE_AUTOMATION;
  try {
    process.env.FEATURE_AUTOMATION = 'true';
    const preview = await request(app)
      .post(`/automation/${a}/preview`)
      .set('x-fixture-actor', 'editor')
      .send({ ruleId: rule.id, trigger: 'task_review', taskId: `task-${a}` });
    expect(preview.status).toBe(404);
  } finally {
    if (previous === undefined) delete process.env.FEATURE_AUTOMATION;
    else process.env.FEATURE_AUTOMATION = previous;
  }
});

it('rule quota does not prevent a previously authorized idempotent retry', async () => {
  const { a } = await fixture();
  const input = {
    title: 'Original',
    trigger: 'task_review',
    action: 'notify',
    condition: 'always',
    debounceSeconds: 30,
  };
  const original = await withDatabase(db, () =>
    createAutomationRule('owner', a, input, 'limit-replay'),
  );
  await admin.$executeRaw`INSERT INTO "AutomationRule" (id,"workspaceId","createdBy",title,trigger,action,condition,"debounceSeconds") SELECT ${'limit-' + a + '-'} || n,${a},'owner','Fixture','task_review','notify','always',30 FROM generate_series(1,99) n`;
  expect(
    (await withDatabase(db, () => createAutomationRule('owner', a, input, 'limit-replay'))).id,
  ).toBe(original.id);
  await expect(
    withDatabase(db, () => createAutomationRule('owner', a, input, 'new-key')),
  ).rejects.toThrow('Rule limit reached');
});

it('automation rule updates reject stale versions without invalidating idempotent retries', async () => {
  const { a } = await fixture();
  const previous = process.env.FEATURE_AUTOMATION;
  try {
    process.env.FEATURE_AUTOMATION = 'true';
    const rule = await withDatabase(db, () =>
      createAutomationRule('owner', a, {
        title: 'Version',
        trigger: 'task_review',
        action: 'notify',
        condition: 'always',
        debounceSeconds: 30,
      }),
    );
    const path = `/automation/${a}/${rule.id}/enabled`;
    const enable = await request(app)
      .patch(path)
      .send({ enabled: true, expectedVersion: rule.version });
    expect(enable.status).toBe(200);
    const replay = await request(app)
      .patch(path)
      .send({ enabled: true, expectedVersion: rule.version });
    expect(replay.status).toBe(200);
    expect(replay.body.version).toBe(enable.body.version);
    expect(
      (await request(app).patch(path).send({ enabled: false, expectedVersion: rule.version }))
        .status,
    ).toBe(409);
    expect((await request(app).get(`/automation/${a}`)).body[0].enabled).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.FEATURE_AUTOMATION;
    else process.env.FEATURE_AUTOMATION = previous;
  }
});

it('disabling a rule after approval cancels the action before it writes', async () => {
  const { a } = await fixture();
  const rule = await withDatabase(db, () =>
    createAutomationRule('owner', a, {
      title: 'Disable before execution',
      trigger: 'task_review',
      action: 'notify',
      condition: 'always',
      debounceSeconds: 1,
    }),
  );
  await withDatabase(db, () => setAutomationEnabled('owner', a, rule.id, true));
  const event = await withDatabase(db, () =>
    submitAutomationEvent(
      'editor',
      a,
      { trigger: 'task_review', taskId: `task-${a}` },
      'disabled-fixture',
    ),
  );
  const id = event.executions[0].id;
  await withDatabase(db, () => approveAutomationExecution('owner', a, id));
  await withDatabase(db, () => setAutomationEnabled('owner', a, rule.id, false));
  const lease = await withDatabase(db, () => claimAutomationExecution(a, id));
  expect(
    await withDatabase(db, () => executeAutomationExecution(a, id, lease!.token)),
  ).toMatchObject({ status: 'cancelled', errorCode: 'rule_disabled' });
  expect(
    await admin.activity.count({ where: { workspaceId: a, type: 'automation_notification' } }),
  ).toBe(0);
});

it('deleted task sources hide automation derivatives and cannot be approved', async () => {
  const { a } = await fixture();
  const rule = await withDatabase(db, () =>
    createAutomationRule('owner', a, {
      title: 'Deleted source',
      trigger: 'task_review',
      action: 'notify',
      condition: 'always',
      debounceSeconds: 1,
    }),
  );
  await withDatabase(db, () => setAutomationEnabled('owner', a, rule.id, true));
  const event = await withDatabase(db, () =>
    submitAutomationEvent(
      'editor',
      a,
      { trigger: 'task_review', taskId: `task-${a}` },
      'source-delete-fixture',
    ),
  );
  await admin.task.delete({ where: { id: `task-${a}` } });
  expect(await withDatabase(db, () => listAutomationExecutions('owner', a))).toEqual([]);
  await expect(
    withDatabase(db, () => approveAutomationExecution('owner', a, event.executions[0].id)),
  ).rejects.toThrow('Source unavailable');
});

it('expired automation leases cannot complete or clear a newer claim', async () => {
  const { a } = await fixture();
  const rule = await withDatabase(db, () =>
    createAutomationRule('owner', a, {
      title: 'Lease recovery',
      trigger: 'task_review',
      action: 'notify',
      condition: 'always',
      debounceSeconds: 1,
    }),
  );
  await withDatabase(db, () => setAutomationEnabled('owner', a, rule.id, true));
  const event = await withDatabase(db, () =>
    submitAutomationEvent(
      'editor',
      a,
      { trigger: 'task_review', taskId: `task-${a}` },
      'lease-recovery-fixture',
    ),
  );
  const id = event.executions[0].id;
  await withDatabase(db, () => approveAutomationExecution('owner', a, id));
  const first = await withDatabase(db, () => claimAutomationExecution(a, id));
  await admin.automationLease.update({
    where: { executionId: id },
    data: { leaseUntil: new Date(Date.now() - 1000) },
  });
  const next = await withDatabase(db, () => claimAutomationExecution(a, id));
  expect(next?.attempt).toBe(2);
  await expect(
    withDatabase(db, () => executeAutomationExecution(a, id, first!.token)),
  ).rejects.toThrow('Execution lease unavailable');
  await expect(withDatabase(db, () => failAutomationClaim(a, id, first!.token))).rejects.toThrow(
    'Execution lease unavailable',
  );
  expect(
    (await withDatabase(db, () => executeAutomationExecution(a, id, next!.token))).status,
  ).toBe('completed');
  expect(
    await admin.activity.count({ where: { workspaceId: a, type: 'automation_notification' } }),
  ).toBe(1);
});

it('owner previews recorded GitHub evidence without forging an automation event', async () => {
  const { a } = await fixture(),
    repo = await repositoryFixture(a);
  const previous = process.env.FEATURE_AUTOMATION;
  try {
    process.env.FEATURE_AUTOMATION = 'true';
    const rule = await withDatabase(db, () =>
      createAutomationRule('owner', a, {
        title: 'PR preview',
        trigger: 'pr_merged',
        action: 'prepare_report',
        condition: 'always',
        debounceSeconds: 30,
      }),
    );
    const payload = {
      action: 'closed',
      pull_request: { number: 17, merged: true, updated_at: '2026-11-09T11:00:00Z' },
    };
    expect((await githubEvent(repo.repositoryId, repo.webhookSecret, payload)).status).toBe(202);
    await withDatabase(db, () => setAutomationEnabled('owner', a, rule.id, true));
    const path = `/automation/${a}/preview`;
    const input = { ruleId: rule.id, trigger: 'pr_merged', repositoryId: repo.id, subject: '17' };
    expect(
      (await request(app).post(path).set('x-fixture-actor', 'editor').send(input)).status,
    ).toBe(404);
    expect((await request(app).post(path).send(input)).body).toMatchObject({
      eligible: true,
      requiresApproval: true,
      reason: 'eligible',
    });
    expect(await withDatabase(db, () => listAutomationExecutions('owner', a))).toEqual([]);
    await admin.gitHubRepository.update({
      where: { id: repo.id },
      data: { providerDisconnectedAt: new Date() },
    });
    expect((await request(app).post(path).send(input)).status).toBe(404);
  } finally {
    if (previous === undefined) delete process.env.FEATURE_AUTOMATION;
    else process.env.FEATURE_AUTOMATION = previous;
  }
});

test('Markdown import persists authorized content and rejects unsafe or foreign requests', async () => {
  const { a, b } = await fixture();
  const url = `/workspaces/${a}/documents/import-markdown`;
  const payload = { title: 'Imported', markdown: '# Title\n\nSafe content.' };
  const created = await request(app).post(url).set('x-fixture-actor', 'editor').send(payload);
  expect(created.status).toBe(201);
  const persisted = await admin.document.findUniqueOrThrow({ where: { id: created.body.id } });
  expect(persisted.workspaceId).toBe(a);
  expect(persisted.yjsState).toBeTruthy();
  const state = new Y.Doc();
  Y.applyUpdate(state, persisted.yjsState!);
  expect(JSON.stringify(projectDocument(state))).toContain('Safe content.');
  state.destroy();
  expect((await request(app).post(url).set('x-fixture-actor', 'viewer').send(payload)).status).toBe(
    403,
  );
  expect(
    (await request(app).post(url).set('x-fixture-actor', 'foreign').send(payload)).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post(`/workspaces/${b}/documents/import-markdown`)
        .set('x-fixture-actor', 'owner')
        .send(payload)
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post(url)
        .set('x-fixture-actor', 'editor')
        .send({ markdown: '<script>alert(1)</script>' })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(app)
        .post(url)
        .set('x-fixture-actor', 'editor')
        .send({ markdown: '**unsupported**' })
    ).status,
  ).toBe(400);
});

test('Markdown import route requires authentication', async () => {
  const unauthenticated = express();
  unauthenticated.use(express.json());
  unauthenticated.use('/workspaces', workspaceRouter);
  unauthenticated.use(errorMiddleware);
  const response = await request(unauthenticated)
    .post('/workspaces/nonexistent/documents/import-markdown')
    .send({ markdown: 'Hello' });
  expect(response.status).toBe(401);
});

test('Markdown export reads committed journal, enforces access, and round trips', async () => {
  const { a } = await fixture();
  const original = '# Title\n\nOriginal';
  const created = await request(app)
    .post(`/workspaces/${a}/documents/import-markdown`)
    .set('x-fixture-actor', 'editor')
    .send({ markdown: original });
  expect(created.status).toBe(201);
  const id: string = created.body.id;
  const room = { workspaceId: a, documentId: id };
  const journal = new CrdtJournal(db);
  const replica = new Y.Doc();
  Y.applyUpdate(replica, await journal.load(room));
  const vector = Y.encodeStateVector(replica);
  const paragraph = replica.getXmlFragment('default').get(1) as Y.XmlElement;
  const textNode = paragraph.get(0) as Y.XmlText;
  textNode.insert(textNode.length, ' updated');
  await journal.append(room, Y.encodeStateAsUpdate(replica, vector), 'editor');
  replica.destroy();
  await admin.document.update({
    where: { id },
    data: { content: { type: 'doc', content: [{ type: 'paragraph' }] } },
  });
  const url = `/documents/${id}/export-markdown`;
  const exported = await request(app).get(url).set('x-fixture-actor', 'viewer');
  expect(exported.status).toBe(200);
  expect(exported.headers['content-type']).toMatch(/^text\/markdown/);
  expect(exported.text).toBe('# Title\n\nOriginal updated');
  const imported = await request(app)
    .post(`/workspaces/${a}/documents/import-markdown`)
    .set('x-fixture-actor', 'editor')
    .send({ markdown: exported.text });
  expect(imported.status).toBe(201);
  expect(
    (
      await request(app)
        .get(`/documents/${imported.body.id}/export-markdown`)
        .set('x-fixture-actor', 'editor')
    ).text,
  ).toBe(exported.text);
  expect((await request(app).get(url).set('x-fixture-actor', 'foreign')).status).toBe(403);
  await admin.workspaceMember.delete({
    where: { userId_workspaceId: { userId: 'viewer', workspaceId: a } },
  });
  expect((await request(app).get(url).set('x-fixture-actor', 'viewer')).status).toBe(403);
  await admin.document.update({ where: { id }, data: { isArchived: true } });
  expect((await request(app).get(url).set('x-fixture-actor', 'editor')).status).toBe(403);
});

test('Markdown export explicitly rejects unsupported document formatting', async () => {
  const { a } = await fixture();
  const id = `doc-${a}`;
  const rich = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }] },
    ],
  };
  const update = await request(app)
    .put(`/documents/${id}/content`)
    .set('x-fixture-actor', 'editor')
    .send({ content: rich, crdtRevision: 0 });
  expect(update.status).toBe(200);
  expect(
    (await request(app).get(`/documents/${id}/export-markdown`).set('x-fixture-actor', 'editor'))
      .status,
  ).toBe(400);
});

test('task CSV export enforces membership and workspace isolation with safe formula cells', async () => {
  const { a, b } = await fixture();
  await admin.task.update({
    where: { id: `task-${a}` },
    data: { title: '=SUM(1,2)', description: 'local only' },
  });
  await admin.task.update({ where: { id: `task-${b}` }, data: { title: 'foreign private' } });
  const url = `/workspaces/${a}/tasks/export-csv`;
  for (const actor of ['owner', 'editor', 'viewer']) {
    const result = await request(app).get(url).set('x-fixture-actor', actor);
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toMatch(/^text\/csv/);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['content-disposition']).toContain('attachment');
    expect(result.text).toContain("'=SUM(1,2)");
    expect(result.text).toContain('local only');
    expect(result.text).not.toContain('foreign private');
    expect(parseTaskCsv(Buffer.from(result.text))).toMatchObject([
      { title: '=SUM(1,2)', description: 'local only' },
    ]);
  }
  expect((await request(app).get(url).set('x-fixture-actor', 'foreign')).status).toBe(403);
  await admin.workspaceMember.delete({
    where: { userId_workspaceId: { userId: 'viewer', workspaceId: a } },
  });
  expect((await request(app).get(url).set('x-fixture-actor', 'viewer')).status).toBe(403);
  await admin.task.delete({ where: { id: `task-${a}` } });
  expect((await request(app).get(url).set('x-fixture-actor', 'editor')).text).not.toContain(
    'local only',
  );
  await admin.workspace.update({ where: { id: a }, data: { suspendedAt: new Date() } });
  expect((await request(app).get(url).set('x-fixture-actor', 'owner')).status).toBe(403);
});

test('task CSV export route requires authentication', async () => {
  const unauthenticated = express();
  unauthenticated.use('/workspaces', workspaceRouter);
  unauthenticated.use(errorMiddleware);
  expect((await request(unauthenticated).get('/workspaces/unknown/tasks/export-csv')).status).toBe(
    401,
  );
});

test('task CSV import validates and commits atomically with idempotency and tenant roles', async () => {
  const { a, b } = await fixture();
  const url = `/workspaces/${a}/tasks/import-csv`;
  const row = {
    columnId: `column-${a}`,
    title: 'Imported task',
    description: 'details',
    priority: 'HIGH' as const,
    assigneeId: 'editor',
    dueDate: '',
  };
  const csv = serializeTaskCsv([row]);
  const send = (actor: string, key: string, data: string) =>
    request(app)
      .post(url)
      .set('x-fixture-actor', actor)
      .set('Idempotency-Key', key)
      .send({ csv: data });
  expect((await send('viewer', 'v', csv)).status).toBe(403);
  expect((await send('foreign', 'f', csv)).status).toBe(403);
  expect((await send('editor', 'bad', 'invalid')).status).toBe(400);
  const invalid = serializeTaskCsv([row, { ...row, columnId: `column-${b}` }]);
  expect((await send('editor', 'invalid', invalid)).status).toBe(403);
  expect(
    await admin.task.count({ where: { title: 'Imported task', columnId: row.columnId } }),
  ).toBe(0);
  expect(
    (
      await send(
        'editor',
        'bad-assignee',
        serializeTaskCsv([row, { ...row, assigneeId: 'foreign' }]),
      )
    ).status,
  ).toBe(403);
  const failure = jest
    .spyOn(embeddingService, 'queueEmbedding')
    .mockRejectedValueOnce(new Error('injected transaction failure'));
  try {
    expect((await send('editor', 'rollback', csv)).status).toBe(500);
  } finally {
    failure.mockRestore();
  }
  expect(
    await admin.task.count({ where: { title: 'Imported task', columnId: row.columnId } }),
  ).toBe(0);
  expect((await request(app).post(url).set('x-fixture-actor', 'editor').send({ csv })).status).toBe(
    400,
  );
  const first = await send('editor', 'retry', csv);
  expect(first.status).toBe(201);
  const second = await send('editor', 'retry', csv);
  expect(second.status).toBe(201);
  expect(second.body).toEqual(first.body);
  expect(
    (await send('editor', 'retry', serializeTaskCsv([{ ...row, title: 'Different' }]))).status,
  ).toBe(409);
  expect(
    await admin.task.count({ where: { title: 'Imported task', columnId: row.columnId } }),
  ).toBe(1);
  const exported = await request(app)
    .get(`/workspaces/${a}/tasks/export-csv`)
    .set('x-fixture-actor', 'owner');
  expect(parseTaskCsv(Buffer.from(exported.text))).toContainEqual(row);
  await admin.workspaceMember.delete({
    where: { userId_workspaceId: { workspaceId: a, userId: 'editor' } },
  });
  expect((await send('editor', 'after-removal', csv)).status).toBe(403);
  await admin.workspace.update({ where: { id: a }, data: { suspendedAt: new Date() } });
  expect((await send('owner', 'suspended', csv)).status).toBe(403);
});

test('task CSV import route requires authentication', async () => {
  const unauthenticated = express();
  unauthenticated.use(express.json());
  unauthenticated.use('/workspaces', workspaceRouter);
  unauthenticated.use(errorMiddleware);
  expect(
    (
      await request(unauthenticated)
        .post('/workspaces/unknown/tasks/import-csv')
        .set('Idempotency-Key', 'key')
        .send({ csv: '' })
    ).status,
  ).toBe(401);
});
