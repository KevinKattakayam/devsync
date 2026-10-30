import { Hocuspocus, Connection, onAuthenticatePayload } from '@hocuspocus/server';
import { Redis as RedisExtension } from '@hocuspocus/extension-redis';
import { Server as HttpServer } from 'http';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import * as Y from 'yjs';
import { TenantPrismaClient } from '../lib/tenant-prisma';
import { authorizeWorkspace } from '../security/workspace-policy';
import { CrdtJournal, DocumentRoom } from './crdt-journal';
import { collaborationAcl } from './collaboration-acl';

export interface Identity {
  id: string;
  name: string;
  expiresAt: number;
}
export interface Context {
  user: Identity;
  workspaceId: string;
  documentId?: string;
  role: string;
  started: number;
  messages: number;
}
export interface CollaborationOptions {
  db: TenantPrismaClient;
  identify(token: string): Promise<Identity>;
  redisUrl?: string;
  maxRooms?: number;
  maxClients?: number;
  maxClientsPerRoom?: number;
  sweepMs?: number;
  storeDebounceMs?: number;
  reconcile?(document: Y.Doc, workspaceId: string): Promise<void>;
}
const idPattern = /^[a-zA-Z0-9_-]{1,191}$/;
function parseRoom(name: string): { workspaceId: string; documentId?: string } {
  const parts = name.split(':');
  if (
    parts.length === 3 &&
    parts[0] === 'document' &&
    parts.slice(1).every((id) => idPattern.test(id))
  )
    return { workspaceId: parts[1], documentId: parts[2] };
  if (parts.length === 2 && ['kanban', 'workspace'].includes(parts[0]) && idPattern.test(parts[1]))
    return { workspaceId: parts[1] };
  if (idPattern.test(name)) return { workspaceId: '', documentId: name };
  throw new Error('Access denied');
}

export function createCollaborationServer(http: HttpServer, options: CollaborationOptions) {
  const journal = new CrdtJournal(options.db);
  const rooms = new Map<string, DocumentRoom>();
  const admitted = new Map<string, number>();
  const connections = new Set<Connection<Context>>();
  const maxRooms = options.maxRooms ?? 100;
  let closing = false;
  async function authorize(context: Context) {
    if (!context?.user || context.user.expiresAt <= Date.now()) throw new Error('Session expired');
    const member = await authorizeWorkspace(
      context.user.id,
      context.workspaceId,
      undefined,
      options.db,
    );
    if (member.role !== context.role) throw new Error('Access changed');
    if (context.documentId) {
      const record = await options.db.withTenantTransaction(context.workspaceId, (tx) =>
        tx.document.findUnique({
          where: { id: context.documentId, workspaceId: context.workspaceId },
          select: { workspaceId: true, isArchived: true },
        }),
      );
      if (!record || record.workspaceId !== context.workspaceId || record.isArchived)
        throw new Error('Access denied');
    }
  }
  async function enforce(context: Context, connection?: Connection<Context>) {
    try {
      await authorize(context);
    } catch (error) {
      connection?.webSocket.close(4403, 'Access revoked');
      throw error;
    }
  }
  const redisAddress = options.redisUrl ? new URL(options.redisUrl) : null;
  const extensions = redisAddress
    ? [
        new RedisExtension({
          host: redisAddress.hostname,
          port: Number(redisAddress.port || 6379),
          options: {
            username: redisAddress.username || undefined,
            password: redisAddress.password || undefined,
            tls: redisAddress.protocol === 'rediss:' ? {} : undefined,
            maxRetriesPerRequest: 1,
            connectTimeout: 3000,
            commandTimeout: 2000,
          },
          identifier: randomUUID(),
          prefix: 'devsync:crdt',
          lockTimeout: 0,
        }),
      ]
    : [];
  const hocuspocus = new Hocuspocus<Context>({
    name: randomUUID(),
    quiet: true,
    debounce: options.storeDebounceMs ?? 1000,
    maxDebounce: options.storeDebounceMs ?? 5000,
    timeout: 15000,
    maxPendingDocuments: 4,
    maxUnauthenticatedQueueSize: 65536,
    maxUnauthenticatedQueueMessages: 16,
    extensions,
    async onAuthenticate(data: onAuthenticatePayload<Context>) {
      if (closing) throw new Error('Server draining');
      const user = await options.identify(data.token);
      if (!Number.isFinite(user.expiresAt) || user.expiresAt <= Date.now())
        throw new Error('Session expired');
      const room = parseRoom(data.documentName);
      if (!room.workspaceId && room.documentId) {
        // Legacy bare ID: resolve only through this user's memberships, never an unscoped RLS query.
        const memberships = await options.db.workspaceMember.findMany({
          where: { userId: user.id },
          select: { workspaceId: true },
        });
        for (const member of memberships) {
          const found = await options.db.withTenantTransaction(member.workspaceId, (tx) =>
            tx.document.findUnique({
              where: { id: room.documentId, workspaceId: member.workspaceId },
              select: { id: true },
            }),
          );
          if (found) {
            room.workspaceId = member.workspaceId;
            break;
          }
        }
      }
      const member = await authorizeWorkspace(user.id, room.workspaceId, undefined, options.db);
      const context: Context = {
        ...room,
        user,
        role: member.role,
        started: Date.now(),
        messages: 0,
      };
      await authorize(context);
      if (!admitted.has(data.documentName) && admitted.size >= maxRooms)
        throw new Error('Room limit exceeded');
      if (
        (hocuspocus.documents.get(data.documentName)?.getConnectionsCount() ?? 0) >=
        (options.maxClientsPerRoom ?? 32)
      )
        throw new Error('Room connection limit exceeded');
      admitted.set(data.documentName, Date.now());
      data.connectionConfig.readOnly = member.role === 'VIEWER';
      if (room.documentId)
        rooms.set(data.documentName, {
          workspaceId: room.workspaceId,
          documentId: room.documentId,
        });
      return context;
    },
    async connected({ connection }) {
      connections.add(connection);
      if (
        connections.size > (options.maxClients ?? 256) ||
        connection.document.getConnectionsCount() > (options.maxClientsPerRoom ?? 32)
      ) {
        connections.delete(connection);
        connection.close({ code: 4403, reason: 'Connection limit' });
        connection.webSocket.close(4403, 'Connection limit');
      }
    },
    async onTokenSync({ context, token, connection }) {
      try {
        const renewed = await options.identify(token);
        if (renewed.id !== context.user.id) throw new Error('Access denied');
        context.user = renewed;
        await enforce(context, connection);
      } catch (error) {
        connection.webSocket.close(4403, 'Access revoked');
        throw error;
      }
    },
    async beforeHandleMessage({ context, update, connection }) {
      if (closing || update.byteLength > 65536) throw new Error('Message rejected');
      if (Date.now() - context.started > 10000) {
        context.started = Date.now();
        context.messages = 0;
      }
      if (++context.messages > 120) throw new Error('Message rate exceeded');
      await enforce(context, connection);
    },
    async beforeSync({ context, connection, type, payload }) {
      if (type === 0) return;
      // A read-only sync-step2 carrying no new operations is a legal handshake.
      if (connection.readOnly) return;
      await enforce(context, connection);
      if (context.documentId)
        await journal.append(
          { workspaceId: context.workspaceId, documentId: context.documentId },
          payload,
        );
    },
    async beforeHandleAwareness({ context, states, connection }) {
      // Redis relays and server-side awareness cleanup have no connection context.
      // Every client frame already passed beforeHandleMessage with its own context.
      if (!context) return;
      await enforce(context, connection);
      if (states.size > 4) throw new Error('Awareness limit exceeded');
      const color = `#${Buffer.from(context.user.id).toString('hex').padEnd(6, '6').slice(0, 6)}`;
      for (const state of states.values()) state.user = { name: context.user.name, color };
    },
    async onLoadDocument({ documentName, document }) {
      const room = rooms.get(documentName);
      if (!room) return;
      try {
        Y.applyUpdate(document, await journal.load(room));
      } catch (error) {
        rooms.delete(documentName);
        admitted.delete(documentName);
        throw error;
      }
    },
    async onStoreDocument({ documentName, document }) {
      const room = rooms.get(documentName);
      if (room) {
        if (options.reconcile && document.getMap('devsync:ai-actions').size) {
          const candidate = new Y.Doc();
          try {
            Y.applyUpdate(candidate, await journal.load(room));
            const vector = Y.encodeStateVector(candidate);
            await options.reconcile(candidate, room.workspaceId);
            const update = Y.encodeStateAsUpdate(candidate, vector);
            if (update.byteLength > 2) {
              await journal.append(room, update);
              Y.applyUpdate(document, update);
            }
          } finally {
            candidate.destroy();
          }
        }
        await journal.compact(room);
      }
    },
    async onDisconnect({ documentName, context, socketId }) {
      for (const connection of connections)
        if (connection.socketId === socketId && connection.context === context)
          connections.delete(connection);
      if (!hocuspocus.documents.has(documentName)) {
        admitted.delete(documentName);
        rooms.delete(documentName);
      }
    },
    async afterUnloadDocument({ documentName }) {
      rooms.delete(documentName);
      admitted.delete(documentName);
    },
  });
  let sweeping = false;
  const sweep = setInterval(() => {
    if (sweeping || closing) return;
    sweeping = true;
    for (const [name, timestamp] of admitted)
      if (
        Date.now() - timestamp > 30000 &&
        !hocuspocus.documents.has(name) &&
        !hocuspocus.loadingDocuments.has(name)
      ) {
        admitted.delete(name);
        rooms.delete(name);
      }
    void Promise.all(
      [...connections].map(async (connection) => {
        try {
          await authorize(connection.context);
        } catch {
          connections.delete(connection);
          connection.close({ code: 4403, reason: 'Access revoked' });
          connection.webSocket.close(4403, 'Access revoked');
        }
      }),
    ).finally(() => {
      sweeping = false;
    });
  }, options.sweepMs ?? 1000);
  sweep.unref();
  const revoke = (workspaceId: string, userId: string) => {
    for (const connection of connections)
      if (connection.context.workspaceId === workspaceId && connection.context.user.id === userId) {
        connections.delete(connection);
        connection.close({ code: 4403, reason: 'Access revoked' });
        connection.webSocket.close(4403, 'Access revoked');
      }
  };
  collaborationAcl.on('revoke', revoke);
  const websocket = new WebSocketServer({ noServer: true, maxPayload: 65536 });
  const upgrade = (
    request: import('http').IncomingMessage,
    socket: import('stream').Duplex,
    head: Buffer,
  ) => {
    if (!new URL(request.url ?? '/', 'http://localhost').pathname.startsWith('/yjs')) return;
    if (closing || websocket.clients.size >= (options.maxClients ?? 256)) {
      socket.destroy();
      return;
    }
    const origin = request.headers.origin;
    if (origin && origin !== (process.env.FRONTEND_URL || 'http://localhost:3000')) {
      socket.destroy();
      return;
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers))
      if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    websocket.handleUpgrade(request, socket, head, (ws) => {
      const connection = hocuspocus.handleConnection(
        ws,
        new Request(new URL(request.url ?? '/', 'http://localhost'), { headers }),
      );
      let window = Date.now();
      let messages = 0;
      ws.on('message', (data) => {
        if (Date.now() - window > 10000) {
          window = Date.now();
          messages = 0;
        }
        // Bound admission before Hocuspocus's asynchronous message queue grows.
        if (++messages > 120) {
          ws.close(4403, 'Message rate exceeded');
          return;
        }
        const bytes = Array.isArray(data)
          ? Buffer.concat(data)
          : data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : data;
        connection.handleMessage(bytes);
      });
      ws.on('pong', () => connection.touch());
      ws.on('close', (code, reason) => connection.handleClose({ code, reason: reason.toString() }));
      ws.on('error', () => ws.terminate());
    });
  };
  http.on('upgrade', upgrade);
  async function stop(compact = true) {
    closing = true;
    clearInterval(sweep);
    collaborationAcl.off('revoke', revoke);
    http.off('upgrade', upgrade);
    let failure: unknown;
    try {
      if (compact)
        for (const [name, room] of rooms)
          if (hocuspocus.documents.has(name)) await journal.compact(room);
    } catch (error) {
      failure = error;
    }
    hocuspocus.closeConnections();
    hocuspocus.flushPendingStores();
    for (const client of websocket.clients) client.terminate();
    await new Promise<void>((resolve) => websocket.close(() => resolve()));
    const deadline = Date.now() + 5000;
    while (hocuspocus.documents.size && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 10));
    if (hocuspocus.documents.size) failure ??= new Error('Collaboration drain timeout');
    await hocuspocus.hooks('onDestroy', { instance: hocuspocus });
    if (failure) throw failure;
  }
  return { hocuspocus, journal, stop, connections };
}
