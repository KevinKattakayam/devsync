import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { randomBytes } from 'crypto';
import { spawnSync } from 'child_process';
import { EventEmitter } from 'events';
import { createServer } from 'http';
import { io as connect, Socket } from 'socket.io-client';
import WebSocket from 'ws';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { createTenantPrismaClient, TenantPrismaClient } from '../lib/tenant-prisma';
import { createSocketServer } from '../socket/server';
import { createCollaborationServer } from '../services/collaboration-server';
import { RealtimeIdentity } from '../security/realtime-identity';

jest.setTimeout(90000);
let postgres: StartedPostgreSqlContainer;
let redis: StartedTestContainer;
let admin: PrismaClient;
let db: TenantPrismaClient;
const nodes: {
  http: ReturnType<typeof createServer>;
  socket: ReturnType<typeof createSocketServer>;
  crdt: ReturnType<typeof createCollaborationServer>;
  bus: EventEmitter;
  url: string;
}[] = [];
const sockets: Socket[] = [];
const documents: {
  provider: HocuspocusProvider;
  websocket: HocuspocusProviderWebsocket;
  document: Y.Doc;
}[] = [];
let sequence = 0;
async function until(check: () => boolean | Promise<boolean>, label: string, timeout = 5000) {
  const end = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`Timed out: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
beforeAll(async () => {
  postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  redis = await new GenericContainer('redis:7-alpine')
    .withCommand(['redis-server', '--requirepass', 'fixture:@pass/?#'])
    .withExposedPorts(6379)
    .start();
  const migrated = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { env: { ...process.env, DATABASE_URL: postgres.getConnectionUri() }, encoding: 'utf8' },
  );
  if (migrated.status !== 0) throw new Error(migrated.stderr);
  admin = new PrismaClient({ datasourceUrl: postgres.getConnectionUri() });
  const password = randomBytes(24).toString('hex');
  const connection = new Client({ connectionString: postgres.getConnectionUri() });
  await connection.connect();
  await connection.query(
    `CREATE ROLE realtime_runtime LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO realtime_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO realtime_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO realtime_runtime`,
  );
  await connection.end();
  const url = new URL(postgres.getConnectionUri());
  url.username = 'realtime_runtime';
  url.password = password;
  db = createTenantPrismaClient(new PrismaClient({ datasourceUrl: url.toString() }));
  for (const id of ['owner', 'member', 'viewer', 'inactive'])
    await admin.user.create({
      data: {
        id,
        clerkId: `user_${id}`,
        email: `${id}@example.test`,
        name: id,
        isActive: id !== 'inactive',
      },
    });
});
afterEach(async () => {
  sockets.splice(0).forEach((socket) => socket.disconnect());
  for (const item of documents.splice(0)) {
    item.provider.destroy();
    item.websocket.destroy();
    item.document.destroy();
  }
  for (const node of nodes.splice(0)) {
    await node.crdt.stop();
    await node.socket.stop();
    node.http.closeAllConnections();
    await new Promise<void>((resolve) => node.http.close(() => resolve()));
  }
});
afterAll(async () => {
  await db?.$disconnect();
  await admin?.$disconnect();
  if (redis) await redis.stop();
  if (postgres) await postgres.stop();
});
async function fixture() {
  const a = `team-a-${++sequence}`;
  const b = `team-b-${sequence}`;
  for (const id of [a, b]) {
    await admin.workspace.create({
      data: {
        id,
        slug: id,
        name: id,
        members: {
          create: [
            { userId: 'owner', role: 'OWNER' },
            { userId: 'member', role: 'EDITOR' },
            { userId: 'viewer', role: 'VIEWER' },
          ],
        },
      },
    });
    await admin.document.create({
      data: {
        id: `doc-${id}`,
        workspaceId: id,
        authorId: 'owner',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
        },
      },
    });
    await admin.board.create({
      data: {
        id: `board-${id}`,
        workspaceId: id,
        name: 'Board',
        columns: {
          create: {
            id: `col-${id}`,
            name: 'Todo',
            position: 0,
            tasks: { create: { id: `task-${id}`, title: 'Task', position: 0 } },
          },
        },
      },
    });
  }
  return { a, b };
}
async function server() {
  const http = createServer();
  const bus = new EventEmitter();
  const identify = async (token: string): Promise<RealtimeIdentity> => {
    const id = token === 'short' || token === 'renewed' ? 'member' : token;
    if (!['owner', 'member', 'viewer', 'inactive'].includes(id))
      throw new Error('Fixture identity rejected');
    return { id, name: id, expiresAt: Date.now() + (token === 'short' ? 1000 : 60000) };
  };
  const redisUrl = `redis://:${encodeURIComponent('fixture:@pass/?#')}@${redis.getHost()}:${redis.getMappedPort(6379)}`;
  const socket = createSocketServer(http, { db, identify, redisUrl, acl: bus, sweepMs: 100 });
  const crdt = createCollaborationServer(http, { db, identify, redisUrl, acl: bus, sweepMs: 100 });
  await socket.ready;
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('No listener');
  const node = { http, socket, crdt, bus, url: `http://127.0.0.1:${address.port}` };
  nodes.push(node);
  return node;
}
async function client(node: Awaited<ReturnType<typeof server>>, token = 'member') {
  const socket = connect(node.url, {
    transports: ['websocket'],
    reconnection: false,
    auth: { token },
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  return socket;
}
async function join(node: Awaited<ReturnType<typeof server>>, socket: Socket, workspaceId: string) {
  socket.emit('workspace:join', { workspaceId, userName: 'spoofed-name' });
  await until(
    () =>
      node.socket.io.sockets.sockets.get(socket.id ?? '')?.rooms.has(`workspace:${workspaceId}`) ===
      true,
    'workspace join',
  );
}
async function documentClient(
  node: Awaited<ReturnType<typeof server>>,
  workspaceId: string,
  token = 'member',
) {
  const document = new Y.Doc();
  let failure: string | undefined;
  const websocket = new HocuspocusProviderWebsocket({
    url: `${node.url.replace('http:', 'ws:')}/yjs`,
    WebSocketPolyfill: WebSocket,
    minDelay: 100,
    delay: 100,
    maxDelay: 1000,
  });
  const provider = new HocuspocusProvider({
    websocketProvider: websocket,
    name: `document:${workspaceId}:doc-${workspaceId}`,
    document,
    token,
    onAuthenticationFailed: ({ reason }) => {
      failure = reason;
    },
  });
  provider.attach();
  const entry = { provider, websocket, document };
  documents.push(entry);
  await until(() => {
    if (failure) throw new Error(failure);
    return provider.synced;
  }, 'CRDT sync');
  return entry;
}
it.each(['remove', 'downgrade'] as const)(
  'revokes every passive Socket.io/CRDT session across independent instances on %s',
  async (action) => {
    const { a, b } = await fixture();
    const first = await server();
    const second = await server();
    const local = await client(first);
    const remote = await client(second);
    const other = await client(second);
    const observer = await client(first, 'owner');
    await join(first, local, a);
    await join(second, remote, a);
    await join(second, other, b);
    await join(first, observer, a);
    const docLocal = await documentClient(first, a);
    const docRemote = await documentClient(second, a);
    let closedLocal = false,
      closedRemote = false;
    docLocal.provider.on('disconnect', () => {
      closedLocal = true;
    });
    docRemote.provider.on('disconnect', () => {
      closedRemote = true;
    });
    let leaked = 0;
    local.on('activity:new', () => leaked++);
    remote.on('activity:new', () => leaked++);
    const start = Date.now();
    if (action === 'remove')
      await admin.workspaceMember.delete({
        where: { userId_workspaceId: { userId: 'member', workspaceId: a } },
      });
    else
      await admin.workspaceMember.update({
        where: { userId_workspaceId: { userId: 'member', workspaceId: a } },
        data: { role: 'VIEWER' },
      });
    first.bus.emit('revoke', a, 'member'); // Second instance has a different local bus.
    await until(
      () => !local.connected && !remote.connected && closedLocal && closedRemote,
      'cross-instance revocation',
      3000,
    );
    expect(Date.now() - start).toBeLessThan(3000);
    expect(other.connected).toBe(true);
    expect(observer.connected).toBe(true);
    let delivered = false;
    observer.once('activity:new', () => {
      delivered = true;
    });
    first.socket.io.to(`workspace:${a}`).emit('activity:new', { id: 'after-revocation' });
    await until(() => delivered, 'authorized observer');
    expect(leaked).toBe(0);
    docLocal.websocket.disconnect();
    docRemote.websocket.disconnect();
    if (action === 'remove') {
      const retry = await client(second);
      let rejected = false;
      retry.on('error', () => {
        rejected = true;
      });
      retry.emit('workspace:join', { workspaceId: a, userName: 'member' });
      await until(() => rejected && !retry.connected, 'removed member rejoin');
      await expect(documentClient(second, a)).rejects.toThrow('permission-denied');
    } else {
      const viewer = await client(second);
      await join(second, viewer, a);
      let denied = 0;
      viewer.on('error', () => denied++);
      for (const event of [
        'kanban:task-created',
        'kanban:task-updated',
        'kanban:task-deleted',
        'kanban:task-moved',
      ])
        viewer.emit(event, {
          workspaceId: a,
          taskId: `task-${a}`,
          task: { id: `task-${a}`, title: 'forged' },
          fromColumnId: `col-${a}`,
          toColumnId: `col-${a}`,
          position: 0,
        });
      await until(() => denied === 4, 'viewer mutation denials');
      expect((await admin.task.findUniqueOrThrow({ where: { id: `task-${a}` } })).title).toBe(
        'Task',
      );
      const readonly = await documentClient(second, a);
      expect(readonly.provider.authorizedScope).toBe('readonly');
    }
  },
);
it('keeps a second presence tab and verifies names from the session', async () => {
  const { a } = await fixture();
  const first = await server();
  const second = await server();
  const one = await client(first);
  const two = await client(second);
  await join(first, one, a);
  await join(second, two, a);
  await until(
    async () => (await first.socket.presence.users(a)).some((user) => user.id === 'member'),
    'presence persisted',
  );
  expect(
    (await first.socket.presence.users(a)).filter((user) => user.id === 'member'),
  ).toHaveLength(1);
  expect((await first.socket.presence.users(a))[0].name).toBe('member');
  one.disconnect();
  await until(
    async () => (await first.socket.presence.users(a)).some((user) => user.socketId === two.id),
    'remaining tab',
  );
  expect(two.connected).toBe(true);
});
it('expires idle sessions, rejects inactive users, and renews only the original principal', async () => {
  const { a } = await fixture();
  const node = await server();
  await expect(client(node, 'inactive')).rejects.toThrow('Authentication required');
  const short = await client(node, 'short');
  await join(node, short, a);
  await until(() => !short.connected, 'passive token expiry', 2500);
  const renew = await client(node, 'short');
  await join(node, renew, a);
  let renewed = false;
  renew.once('session:updated', () => {
    renewed = true;
  });
  renew.emit('session:refresh', { token: 'renewed' });
  await until(() => renewed, 'token refresh');
  expect(
    node.socket.sessions.get(node.socket.io.sockets.sockets.get(renew.id ?? '')!)?.identity
      .expiresAt,
  ).toBeGreaterThan(Date.now() + 10000);
  renew.emit('session:refresh', { token: 'owner' });
  await until(() => !renew.connected, 'principal swap rejected');
});
