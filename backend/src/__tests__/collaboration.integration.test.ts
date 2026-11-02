import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { randomBytes } from 'crypto';
import { spawnSync, fork } from 'child_process';
import { createServer } from 'http';
import WebSocket from 'ws';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import * as decoding from 'lib0/decoding';
import * as Y from 'yjs';
import { createTenantPrismaClient, TenantPrismaClient } from '../lib/tenant-prisma';
import { createCollaborationServer, CollaborationOptions } from '../services/collaboration-server';
import { notifyCollaborationAclChange } from '../services/collaboration-acl';
import { migrateDocument } from '../services/crdt-migration';

jest.setTimeout(120000);
beforeEach(() => {
  console.info(`Collaboration scenario: ${expect.getState().currentTestName}`);
});
let postgres: StartedPostgreSqlContainer;
let redis: StartedTestContainer;
let admin: PrismaClient;
let db: TenantPrismaClient;
let runtimeUrl: string;
let sequence = 0;
const runtimes: {
  runtime: ReturnType<typeof createCollaborationServer>;
  http: ReturnType<typeof createServer>;
  url: string;
}[] = [];
const clients: {
  document: Y.Doc;
  provider: HocuspocusProvider;
  socket: HocuspocusProviderWebsocket;
  rejected: () => number;
}[] = [];
async function until(check: () => boolean | Promise<boolean>, label: string, timeout = 8000) {
  const end = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`Timed out: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
beforeAll(async () => {
  postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  const result = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { env: { ...process.env, DATABASE_URL: postgres.getConnectionUri() }, encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  admin = new PrismaClient({ datasourceUrl: postgres.getConnectionUri() });
  const password = randomBytes(24).toString('hex');
  const connection = new Client({ connectionString: postgres.getConnectionUri() });
  await connection.connect();
  await connection.query(
    `CREATE ROLE collab_runtime LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO collab_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO collab_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO collab_runtime`,
  );
  await connection.end();
  const url = new URL(postgres.getConnectionUri());
  url.username = 'collab_runtime';
  url.password = password;
  runtimeUrl = url.toString();
  db = createTenantPrismaClient(new PrismaClient({ datasourceUrl: url.toString() }));
  for (const id of ['a', 'b', 'viewer'])
    await admin.user.create({
      data: { id, clerkId: `user_${id}`, email: `${id}@example.test`, name: id },
    });
  await admin.workspace.create({
    data: {
      id: 'workspace',
      slug: 'workspace',
      name: 'Workspace',
      members: {
        create: [
          { userId: 'a', role: 'OWNER' },
          { userId: 'b', role: 'EDITOR' },
          { userId: 'viewer', role: 'VIEWER' },
        ],
      },
    },
  });
});
afterEach(async () => {
  console.info('Closing collaboration clients and servers');
  for (const client of clients.splice(0)) {
    client.provider.destroy();
    client.socket.destroy();
    client.document.destroy();
  }
  for (const item of runtimes.splice(0)) {
    await item.runtime.stop();
    item.http.closeAllConnections();
    await new Promise<void>((resolve) => item.http.close(() => resolve()));
  }
  console.info('Collaboration cleanup complete');
});
afterAll(async () => {
  await db?.$disconnect();
  await admin?.$disconnect();
  if (redis) await redis.stop();
  if (postgres) await postgres.stop();
});
async function room() {
  const id = `document-${++sequence}`;
  await admin.document.create({
    data: {
      id,
      title: 'Concurrent paragraph',
      authorId: 'a',
      workspaceId: 'workspace',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
      },
    },
  });
  return `document:workspace:${id}`;
}
async function server(overrides: Partial<Omit<CollaborationOptions, 'db' | 'redisUrl'>> = {}) {
  const http = createServer();
  const runtime = createCollaborationServer(http, {
    db,
    redisUrl: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
    sweepMs: 100,
    async identify(token) {
      if (!['a', 'b', 'viewer'].includes(token)) throw new Error('Invalid fixture identity');
      return { id: token, name: token, expiresAt: Date.now() + 60000 };
    },
    ...overrides,
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('No listener');
  const entry = { runtime, http, url: `ws://127.0.0.1:${address.port}/yjs` };
  runtimes.push(entry);
  return entry;
}
async function client(url: string, name: string, token = 'a') {
  const document = new Y.Doc();
  let denied = 0;
  let authenticationError: string | null = null;
  const events: string[] = [];
  const socket = new HocuspocusProviderWebsocket({
    url,
    WebSocketPolyfill: WebSocket,
    delay: 100,
    minDelay: 100,
    maxDelay: 1000,
    jitter: true,
    onMaxAttemptsFailed: ({ error }) => {
      events.push(`connection: ${String(error)}`);
    },
  });
  const provider = new HocuspocusProvider({
    websocketProvider: socket,
    name,
    document,
    token,
    onAuthenticationFailed: ({ reason }) => {
      authenticationError = reason;
      events.push(`authentication: ${reason}`);
    },
    onStatus: ({ status }) => {
      events.push(`status: ${status}`);
    },
    onClose: ({ event }) => {
      events.push(`close: ${event.code} ${event.reason}`);
    },
    onMessage({ message }) {
      const decoder = decoding.createDecoder(new Uint8Array(message.data as ArrayBuffer));
      decoding.readVarString(decoder);
      if (decoding.readVarUint(decoder) === 8 && decoding.readVarInt(decoder) === 0) denied++;
    },
  });
  provider.attach();
  const entry = { document, socket, provider, rejected: () => denied };
  clients.push(entry);
  try {
    await until(() => {
      if (authenticationError) throw new Error(authenticationError);
      return provider.synced;
    }, 'initial synchronization');
  } catch (error) {
    throw new Error(`${String(error)}; ${events.join('; ')}`);
  }
  return entry;
}
function text(document: Y.Doc): Y.XmlText {
  const paragraph = document.getXmlFragment('default').get(0);
  if (!(paragraph instanceof Y.XmlElement)) throw new Error('Missing paragraph');
  const value = paragraph.get(0);
  if (!(value instanceof Y.XmlText)) throw new Error('Missing paragraph text');
  return value;
}
it('merges two real clients editing the same paragraph concurrently', async () => {
  const name = await room();
  const node = await server();
  const a = await client(node.url, name);
  const b = await client(node.url, name, 'b');
  text(a.document).insert(3, 'A');
  text(b.document).insert(3, 'B');
  await until(
    () =>
      text(a.document).toString() === text(b.document).toString() && text(a.document).length === 7,
    'concurrent convergence',
  );
  expect(text(a.document).toString()).toMatch(/A/);
  expect(text(a.document).toString()).toMatch(/B/);
  await until(
    () => !a.provider.hasUnsyncedChanges && !b.provider.hasUnsyncedChanges,
    'durable acknowledgements',
  );
});
it('merges offline edits on reconnect rather than replacing server text', async () => {
  const name = await room();
  const node = await server();
  const a = await client(node.url, name);
  const b = await client(node.url, name, 'b');
  b.socket.disconnect();
  await until(() => b.socket.status === 'disconnected', 'offline transport closed');
  text(b.document).insert(0, 'OFF');
  text(a.document).insert(0, 'LIVE');
  await until(() => !a.provider.hasUnsyncedChanges, 'online commit');
  void b.socket.connect();
  await until(
    () =>
      text(a.document).toString() === text(b.document).toString() && text(a.document).length === 12,
    'offline merge',
  );
  expect(text(a.document).toString()).toContain('OFF');
  expect(text(a.document).toString()).toContain('LIVE');
});
it('rejects viewer mutations at the actual server protocol and journal', async () => {
  const name = await room();
  const node = await server();
  const a = await client(node.url, name);
  const viewer = await client(node.url, name, 'viewer');
  expect(viewer.provider.authorizedScope).toBe('readonly');
  const baseline = viewer.rejected();
  text(viewer.document).insert(0, 'FORGED');
  await until(() => viewer.rejected() > baseline, 'server readonly rejection');
  expect(text(a.document).toString()).toBe('hello');
  const restored = new Y.Doc();
  Y.applyUpdate(
    restored,
    await node.runtime.journal.load({ workspaceId: 'workspace', documentId: name.split(':')[2] }),
  );
  expect(text(restored).toString()).toBe('hello');
  restored.destroy();
});
it('cuts off a removed member without waiting for another edit', async () => {
  const name = await room();
  const node = await server();
  const b = await client(node.url, name, 'b');
  let disconnected = false;
  b.provider.on('disconnect', () => {
    disconnected = true;
  });
  await admin.workspaceMember.delete({
    where: { userId_workspaceId: { userId: 'b', workspaceId: 'workspace' } },
  });
  try {
    await until(() => disconnected, 'passive revocation');
  } finally {
    await admin.workspaceMember.create({
      data: { userId: 'b', workspaceId: 'workspace', role: 'EDITOR' },
    });
  }
});
it('cuts off a downgraded editor and requires a new read-only session', async () => {
  const name = await room();
  const node = await server();
  const b = await client(node.url, name, 'b');
  let disconnected = false;
  b.provider.on('disconnect', () => {
    disconnected = true;
  });
  await admin.workspaceMember.update({
    where: { userId_workspaceId: { userId: 'b', workspaceId: 'workspace' } },
    data: { role: 'VIEWER' },
  });
  try {
    await until(() => disconnected, 'role revocation');
    b.socket.disconnect();
    const viewer = await client(node.url, name, 'b');
    expect(viewer.provider.authorizedScope).toBe('readonly');
  } finally {
    await admin.workspaceMember.update({
      where: { userId_workspaceId: { userId: 'b', workspaceId: 'workspace' } },
      data: { role: 'EDITOR' },
    });
  }
});
it('rejects forged document workspace prefixes and non-member rooms', async () => {
  const name = await room();
  const node = await server();
  await expect(
    client(node.url, name.replace('document:workspace:', 'document:foreign:'), 'a'),
  ).rejects.toThrow();
  await admin.workspace.create({
    data: {
      id: 'private',
      slug: 'private',
      name: 'Private',
      members: { create: { userId: 'b', role: 'OWNER' } },
    },
  });
  await admin.document.create({
    data: { id: 'private-doc', workspaceId: 'private', authorId: 'b', title: 'Private' },
  });
  await expect(client(node.url, 'document:workspace:private-doc', 'a')).rejects.toThrow();
  await expect(client(node.url, 'document:private:private-doc', 'a')).rejects.toThrow();
  expect(await admin.documentUpdate.count({ where: { documentId: 'private-doc' } })).toBe(0);
});
it('authenticates awareness names and cleans remote presence on disconnect', async () => {
  const name = await room();
  const node = await server();
  const a = await client(node.url, name);
  const b = await client(node.url, name, 'b');
  b.provider.awareness!.setLocalStateField('user', { name: 'forged', color: 'unsafe' });
  await until(
    () => a.provider.awareness!.getStates().get(b.document.clientID)?.user?.name === 'b',
    'trusted awareness',
  );
  b.socket.disconnect();
  await until(
    () => !a.provider.awareness!.getStates().has(b.document.clientID),
    'presence cleanup',
  );
});
it('recovers acknowledged updates from the journal before snapshot compaction', async () => {
  const name = await room();
  const child = fork('src/__tests__/fixtures/collaboration-child.ts', [], {
    execArgv: ['--import', 'tsx'],
    silent: true,
    env: {
      ...process.env,
      PHASE1B_TEST_DATABASE_URL: runtimeUrl,
      PHASE1B_TEST_REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
    },
  });
  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Child listener timeout')), 10000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('Child exited before listening'));
      });
      child.once('message', (message: unknown) => {
        clearTimeout(timer);
        if (
          message &&
          typeof message === 'object' &&
          'port' in message &&
          typeof message.port === 'number'
        )
          resolve(message.port);
        else reject(new Error('Invalid child readiness message'));
      });
    });
    const a = await client(`ws://127.0.0.1:${port}/yjs`, name);
    text(a.document).insert(0, 'DURABLE');
    await until(() => !a.provider.hasUnsyncedChanges, 'ack after commit');
    const record = await admin.document.findUniqueOrThrow({ where: { id: name.split(':')[2] } });
    const snapshot = new Y.Doc();
    Y.applyUpdate(snapshot, record.yjsState!);
    expect(text(snapshot).toString()).toBe('hello');
    snapshot.destroy();
    expect(await admin.documentUpdate.count({ where: { documentId: record.id } })).toBeGreaterThan(
      0,
    );
    a.socket.shouldConnect = false;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill('SIGKILL');
    await exited;
    a.socket.disconnect();
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  const restarted = await server();
  const reader = await client(restarted.url, name, 'b');
  expect(text(reader.document).toString()).toBe('DURABLEhello');
});
it('synchronizes two backend instances through real Redis fanout', async () => {
  const name = await room();
  const first = await server();
  const second = await server();
  const a = await client(first.url, name);
  const b = await client(second.url, name, 'b');
  text(a.document).insert(1, 'ONE');
  text(b.document).insert(1, 'TWO');
  await until(
    () =>
      text(a.document).toString() === text(b.document).toString() && text(a.document).length === 11,
    'Redis convergence',
  );
  await first.runtime.journal.compact({ workspaceId: 'workspace', documentId: name.split(':')[2] });
  const state = await second.runtime.journal.load({
    workspaceId: 'workspace',
    documentId: name.split(':')[2],
  });
  const recovered = new Y.Doc();
  Y.applyUpdate(recovered, state);
  expect(text(recovered).toString()).toBe(text(a.document).toString());
  recovered.destroy();
});
it('converts seeded legacy JSON with dry-run, retained backup, repeatable apply and guarded rollback', async () => {
  const seed = spawnSync(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], {
    env: {
      ...process.env,
      DATABASE_URL: runtimeUrl,
      SEED_ALLOW_WRITE: 'true',
      SEED_OWNER_CLERK_ID: 'user_a',
      SEED_EDITOR_CLERK_ID: 'user_b',
      SEED_VIEWER_CLERK_ID: 'user_viewer',
    },
    encoding: 'utf8',
  });
  expect(seed.status).toBe(0);
  const room = { workspaceId: 'devsync-sample', documentId: 'devsync-sample-doc' };
  expect(await migrateDocument(db, room, 'dry-run')).toBe('conversion-valid');
  expect(
    (await admin.document.findUniqueOrThrow({ where: { id: room.documentId } })).yjsState,
  ).toBeNull();
  expect(await migrateDocument(db, room, 'apply')).toBe('converted');
  expect(await migrateDocument(db, room, 'apply')).toBe('already-converted');
  expect(await migrateDocument(db, room, 'rollback')).toBe('restored');
  expect(await migrateDocument(db, room, 'rollback')).toBe('already-restored');
  expect(await migrateDocument(db, room, 'apply')).toBe('converted');
  const node = await server();
  const document = new Y.Doc();
  Y.applyUpdate(document, await node.runtime.journal.load(room));
  const vector = Y.encodeStateVector(document);
  text(document).insert(0, 'NEW');
  await node.runtime.journal.append(room, Y.encodeStateAsUpdate(document, vector));
  document.destroy();
  await expect(migrateDocument(db, room, 'rollback')).rejects.toThrow('subsequent edits');
});

it('resolves legacy bare IDs through tenant memberships and rejects malformed rooms', async () => {
  const name = await room();
  const node = await server();
  const legacy = await client(node.url, name.split(':')[2]);
  expect(text(legacy.document).toString()).toBe('hello');
  await expect(client(node.url, 'document:workspace:extra:invalid')).rejects.toThrow();
});
it('keeps viewers read-only in ephemeral workspace and Kanban rooms', async () => {
  const node = await server();
  const editor = await client(node.url, 'kanban:workspace');
  const viewer = await client(node.url, 'kanban:workspace', 'viewer');
  editor.document.getMap('record:boards').set('value', 'allowed');
  await until(
    () => viewer.document.getMap('record:boards').get('value') === 'allowed',
    'ephemeral read',
  );
  const denied = viewer.rejected();
  viewer.document.getMap('record:boards').set('value', 'forged');
  await until(() => viewer.rejected() > denied, 'ephemeral viewer rejection');
  expect(editor.document.getMap('record:boards').get('value')).toBe('allowed');
  const workspace = await client(node.url, 'workspace:workspace', 'viewer');
  expect(workspace.provider.authorizedScope).toBe('readonly');
});
it('enforces room admission, per-room connections and expired tokens', async () => {
  const first = await room();
  const second = await room();
  const node = await server({ maxRooms: 1, maxClientsPerRoom: 1 });
  await client(node.url, first);
  await expect(client(node.url, second, 'b')).rejects.toThrow('permission-denied');
  expect(node.runtime.hocuspocus.getDocumentsCount()).toBe(1);
  await expect(client(node.url, first, 'b')).rejects.toThrow('permission-denied');
  expect(node.runtime.connections.size).toBe(1);
  const expired = await server({ identify: async () => ({ id: 'a', name: 'a', expiresAt: 0 }) });
  await expect(client(expired.url, first)).rejects.toThrow('permission-denied');
  expect(expired.runtime.hocuspocus.getDocumentsCount()).toBe(0);
});
it('renews the same identity but disconnects a token attempting to change principals', async () => {
  const name = await room();
  const node = await server();
  const a = await client(node.url, name);
  const connection = [...node.runtime.connections][0];
  const originalExpiry = connection.context.user.expiresAt;
  connection.requestToken();
  await until(() => connection.context.user.expiresAt > originalExpiry, 'fresh token');
  let disconnected = false;
  a.provider.on('disconnect', () => {
    disconnected = true;
  });
  a.provider.configuration.token = 'b';
  await a.provider.sendToken();
  await until(() => disconnected, 'principal swap rejected');
  a.socket.disconnect();
  expect(connection.context.user.id).toBe('a');
});
it('applies every renewal to the live connection after Hocuspocus copies hook context', async () => {
  let generation = 0;
  const name = await room();
  const node = await server({
    identify: async (token) => ({
      id: token,
      name: token,
      expiresAt: Date.now() + 60000 + ++generation * 1000,
    }),
  });
  const active = await client(node.url, name);
  const connection = [...node.runtime.connections][0];
  // Await the actual library callback, including its context-copy completion.
  // The separate wire test above still exercises the token-sync protocol.
  for (let renewal = 0; renewal < 3; renewal++) {
    const previous = connection.context.user.expiresAt;
    await connection.callbacks.onTokenSyncCallback({ token: 'a' });
    expect(connection.context.user.expiresAt).toBeGreaterThan(previous);
    expect(connection.context.user.id).toBe('a');
    expect(connection.readOnly).toBe(false);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(previous + 1);
    try {
      // Message policy receives the library's copied hook context, while the
      // passive sweep uses connection.context. Both must see the renewed user.
      await expect(
        connection.callbacks.beforeHandleMessage(connection, new Uint8Array()),
      ).resolves.toBeUndefined();
    } finally {
      clock.mockRestore();
    }
  }
  for (let renewal = 0; renewal < 3; renewal++) {
    const previous = connection.context.user.expiresAt;
    await active.provider.sendToken();
    await until(() => connection.context.user.expiresAt > previous, 'wire renewal advances expiry');
  }
});

it('evicts local membership changes immediately and expires passive sessions', async () => {
  const name = await room();
  const node = await server({ sweepMs: 10000 });
  const b = await client(node.url, name, 'b');
  let disconnected = false;
  b.provider.on('disconnect', () => {
    disconnected = true;
  });
  await admin.workspaceMember.update({
    where: { userId_workspaceId: { userId: 'b', workspaceId: 'workspace' } },
    data: { role: 'VIEWER' },
  });
  try {
    notifyCollaborationAclChange('workspace', 'b');
    await until(() => disconnected, 'local eviction');
    b.socket.disconnect();
  } finally {
    await admin.workspaceMember.update({
      where: { userId_workspaceId: { userId: 'b', workspaceId: 'workspace' } },
      data: { role: 'EDITOR' },
    });
  }
  const expires = await server({
    identify: async () => ({ id: 'a', name: 'a', expiresAt: Date.now() + 1000 }),
  });
  const a = await client(expires.url, name);
  let expired = false;
  a.provider.on('disconnect', () => {
    expired = true;
  });
  await until(() => expired, 'passive expiry');
  a.socket.disconnect();
});
it('journals server reconciliation before broadcasting the resulting state', async () => {
  const name = await room();
  const node = await server({
    async reconcile(document) {
      const actions = document.getMap('devsync:ai-actions');
      if (actions.get('fixture-action') === 'pending') actions.set('fixture-action', 'authorized');
    },
  });
  const a = await client(node.url, name);
  a.document.getMap('devsync:ai-actions').set('fixture-action', 'pending');
  await until(
    () => a.document.getMap('devsync:ai-actions').get('fixture-action') === 'authorized',
    'server reconciliation',
  );
  const recovered = new Y.Doc();
  Y.applyUpdate(
    recovered,
    await node.runtime.journal.load({ workspaceId: 'workspace', documentId: name.split(':')[2] }),
  );
  expect(recovered.getMap('devsync:ai-actions').get('fixture-action')).toBe('authorized');
  recovered.destroy();
});
it('rejects foreign-origin and excess WebSocket connections before admission', async () => {
  const name = await room();
  const node = await server({ maxClients: 1 });
  const rejected = (origin?: string) =>
    new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(node.url, origin ? { origin } : undefined);
      socket.once('error', () => resolve());
      socket.once('open', () => {
        socket.terminate();
        reject(new Error('Unexpected admission'));
      });
    });
  await rejected('https://untrusted.invalid');
  await client(node.url, name);
  await rejected();
});
