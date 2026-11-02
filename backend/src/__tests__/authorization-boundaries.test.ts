import express, { ErrorRequestHandler } from 'express';
import request from 'supertest';
import { Role } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma';
import { TenantPrismaClient } from '../lib/tenant-prisma';
import { requireOwner } from '../middleware/rbac.middleware';
import { updateMemberRole, removeMember } from '../controllers/workspace.controller';
import { createColumn } from '../controllers/task.controller';
import { createDocument } from '../controllers/document.controller';
import { setupPresenceHandlers } from '../socket/presence.handler';
import { setupKanbanHandlers } from '../socket/kanban.handler';
jest.mock('../lib/prisma', () => ({ prisma: mockDeep<TenantPrismaClient>() }));
jest.mock('../lib/redis', () => ({ redis: {}, isRedisAvailable: async () => false }));
jest.mock('../services/embedding.service', () => ({ queueEmbedding: async () => {} }));
jest.mock('../lib/queue', () => ({ getQueue: jest.fn(), QueueNames: {} }));
const db = prisma as DeepMockProxy<TenantPrismaClient>;
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = {
    userId: req.header('x-test-actor') || 'owner',
    clerkId: 'test',
    email: 'test@example.test',
  };
  next();
});
app.patch('/workspaces/:id/members/:memberId', requireOwner(), updateMemberRole);
app.delete('/workspaces/:id/members/:memberId', requireOwner(), removeMember);
app.post('/boards/:boardId/columns', createColumn);
app.post('/workspaces/:id/documents', createDocument);
const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  res
    .status(
      error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 500,
    )
    .json({ error: 'Rejected' });
};
app.use(errors);
let role: Role | null;
beforeEach(() => {
  jest.clearAllMocks();
  role = 'OWNER';
  db.user.findUnique.mockResolvedValue({ isActive: true } as Awaited<
    ReturnType<typeof prisma.user.findUnique>
  >);
  db.workspace.findUnique.mockResolvedValue({ suspendedAt: null } as Awaited<
    ReturnType<typeof prisma.workspace.findUnique>
  >);
  db.workspaceMember.findUnique.mockImplementation((args) => {
    const key = args.where.userId_workspaceId;
    if (key)
      return Promise.resolve(
        key.workspaceId === 'a' && role ? { userId: key.userId, workspaceId: 'a', role } : null,
      ) as ReturnType<typeof prisma.workspaceMember.findUnique>;
    return Promise.resolve({
      id: 'member-b',
      userId: 'victim',
      workspaceId: 'b',
      role: 'EDITOR',
    }) as ReturnType<typeof prisma.workspaceMember.findUnique>;
  });
  db.workspaceMember.findFirst.mockResolvedValue(null);
  db.workspaceMember.update.mockResolvedValue({ id: 'member-b' } as Awaited<
    ReturnType<typeof prisma.workspaceMember.update>
  >);
  db.workspaceMember.delete.mockResolvedValue({ id: 'member-b' } as Awaited<
    ReturnType<typeof prisma.workspaceMember.delete>
  >);
  db.board.findUnique.mockResolvedValue({ id: 'board-b', workspaceId: 'b' } as Awaited<
    ReturnType<typeof prisma.board.findUnique>
  >);
  db.column.create.mockResolvedValue({ id: 'injected' } as Awaited<
    ReturnType<typeof prisma.column.create>
  >);
  db.column.findUnique.mockResolvedValue({
    id: 'column-b',
    name: 'Column',
    position: 0,
    boardId: 'board-b',
    board: { workspaceId: 'b' },
  } as Awaited<ReturnType<typeof prisma.column.findUnique>>);
  db.document.findUnique.mockResolvedValue({
    id: 'document-b',
    workspaceId: 'b',
    isArchived: false,
  } as Awaited<ReturnType<typeof prisma.document.findUnique>>);
  db.task.findUnique.mockResolvedValue({
    id: 'task-b',
    columnId: 'column-b',
    title: 'Task',
    position: 0,
    priority: 'MEDIUM',
    column: { board: { workspaceId: 'b' } },
  } as unknown as Awaited<ReturnType<typeof prisma.task.findUnique>>);
  db.document.create.mockResolvedValue({ id: 'new', title: 'New' } as Awaited<
    ReturnType<typeof prisma.document.create>
  >);
  db.withTenantTransaction.mockImplementation(async (_id, operation) => operation(prisma));
});
it.each(['patch', 'delete'] as const)(
  'D05 rejects cross-workspace member %s despite ownership of URL workspace',
  async (method) => {
    const response = await request(app)
      [method]('/workspaces/a/members/member-b')
      .send({ role: 'OWNER' });
    expect([403, 404]).toContain(response.status);
    expect(db.workspaceMember.update).not.toHaveBeenCalled();
    expect(db.workspaceMember.delete).not.toHaveBeenCalled();
  },
);
it.each(['VIEWER', 'EDITOR', null] as const)(
  'D05 rejects role escalation/removal by %s',
  async (actorRole) => {
    role = actorRole;
    for (const method of ['patch', 'delete'] as const)
      expect([403, 404]).toContain(
        (await request(app)[method]('/workspaces/a/members/member-b').send({ role: 'OWNER' }))
          .status,
      );
  },
);
it.each(['VIEWER', 'EDITOR', 'OWNER', null] as const)(
  'D06 rejects foreign board columns for %s',
  async (actorRole) => {
    role = actorRole;
    expect([403, 404]).toContain(
      (await request(app).post('/boards/board-b/columns').send({ name: 'Injected' })).status,
    );
    expect(db.column.create).not.toHaveBeenCalled();
  },
);
it('D08 rejects a parent document in another workspace', async () => {
  expect([403, 404]).toContain(
    (
      await request(app)
        .post('/workspaces/a/documents')
        .send({ parentId: 'document-b', title: 'child' })
    ).status,
  );
  expect(db.document.create).not.toHaveBeenCalled();
});

type Handler = (payload: unknown) => void | Promise<void>;
function socketFixture() {
  const handlers = new Map<string, Handler>();
  const broadcast = jest.fn();
  const join = jest.fn();
  const emit = jest.fn();
  const socket = {
    id: 'socket-a',
    userId: 'owner',
    userName: 'Owner',
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    join,
    leave: jest.fn(),
    emit,
    to: () => ({ emit: broadcast }),
  } as unknown as Socket & { userId: string };
  const io = { to: () => ({ emit: broadcast }) } as unknown as Server;
  setupPresenceHandlers(io, socket);
  setupKanbanHandlers(io, socket);
  return { handlers, broadcast, join, emit };
}
const events = [
  'workspace:join',
  'workspace:leave',
  'cursor:update',
  'kanban:task-created',
  'kanban:task-updated',
  'kanban:task-deleted',
  'kanban:task-moved',
];
it.each(events)('D03/D04 %s cannot target another workspace', async (event) => {
  const socket = socketFixture();
  await socket.handlers.get(event)?.({
    workspaceId: 'b',
    userName: 'Forged',
    documentId: 'document-b',
    cursor: { anchor: 0 },
    taskId: 'task-b',
    task: { id: 'task-b', columnId: 'column-b' },
    fromColumnId: 'column-b',
    toColumnId: 'column-b',
    position: 0,
  });
  expect(socket.join).not.toHaveBeenCalled();
  expect(socket.broadcast).not.toHaveBeenCalled();
});
it.each(events.filter((event) => event.startsWith('kanban:')))(
  'D04 viewer cannot relay %s',
  async (event) => {
    role = 'VIEWER';
    const socket = socketFixture();
    await socket.handlers.get(event)?.({
      workspaceId: 'a',
      taskId: 'task-b',
      task: { id: 'task-b' },
      fromColumnId: 'column-b',
      toColumnId: 'column-b',
      position: 0,
    });
    expect(socket.broadcast).not.toHaveBeenCalled();
  },
);
it.each(events.filter((event) => event.startsWith('kanban:')))(
  'D04 editor cannot relay foreign resource via %s',
  async (event) => {
    role = 'EDITOR';
    const socket = socketFixture();
    await socket.handlers.get(event)?.({
      workspaceId: 'a',
      taskId: 'task-b',
      task: { id: 'task-b' },
      fromColumnId: 'column-b',
      toColumnId: 'column-b',
      position: 0,
    });
    expect(socket.broadcast).not.toHaveBeenCalled();
  },
);
it('D03 permits a workspace member to join the correct room', async () => {
  role = 'VIEWER';
  const socket = socketFixture();
  await socket.handlers.get('workspace:join')?.({ workspaceId: 'a', userName: 'Owner' });
  expect(socket.join).toHaveBeenCalledWith('workspace:a');
});
it.each(events.filter((event) => event.startsWith('kanban:')))(
  'D04 permits canonical same-workspace editor resource for %s',
  async (event) => {
    role = 'EDITOR';
    db.task.findUnique.mockResolvedValue({
      id: 'task-a',
      title: 'Canonical',
      position: 0,
      columnId: 'column-a',
      column: { board: { workspaceId: 'a' } },
    } as unknown as Awaited<ReturnType<typeof prisma.task.findUnique>>);
    db.column.findUnique.mockResolvedValue({
      id: 'column-a',
      name: 'Column',
      position: 0,
      boardId: 'board-a',
      board: { workspaceId: 'a' },
    } as Awaited<ReturnType<typeof prisma.column.findUnique>>);
    const socket = socketFixture();
    await socket.handlers.get(event)?.({
      workspaceId: 'a',
      taskId: 'task-a',
      task: { id: 'task-a', title: 'Forged' },
      fromColumnId: 'column-a',
      toColumnId: 'column-a',
      position: 0,
    });
    expect(socket.broadcast).toHaveBeenCalledWith(
      event,
      expect.objectContaining(
        event === 'kanban:task-deleted'
          ? { taskId: 'task-a' }
          : { task: expect.objectContaining({ title: 'Canonical' }) },
      ),
    );
  },
);
