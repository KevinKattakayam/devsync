import express, { ErrorRequestHandler } from 'express';
import request from 'supertest';
import { createServer } from 'http';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { TenantPrismaClient } from '../lib/tenant-prisma';
import { onAuthenticatePayload } from '@hocuspocus/server';
import { verifyToken } from '@clerk/backend';
import { prisma } from '../lib/prisma';
import { setupHocuspocusServer, destroyHocuspocus } from '../services/yjs.service';
import { updateMe, updateMeSchema } from '../controllers/auth.controller';
import { executeSnippet } from '../controllers/snippet.controller';
import { validate } from '../middleware/validate.middleware';
jest.mock('../lib/prisma', () => ({ prisma: mockDeep<TenantPrismaClient>() }));
jest.mock('../lib/cache', () => ({ cache: { del: jest.fn() }, CacheKeys: {} }));
jest.mock('../services/embedding.service', () => ({ queueEmbedding: jest.fn() }));
jest.mock('@clerk/backend', () => ({ verifyToken: jest.fn() }));
const db = prisma as DeepMockProxy<TenantPrismaClient>;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { userId: 'user-a', clerkId: 'clerk-a', email: 'a@example.test' }; next(); });
app.patch('/api/auth/me', validate(updateMeSchema), updateMe);
app.post('/api/snippets/execute', executeSnippet);
const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => { res.status(error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 500).json({ error: 'Request rejected' }); };
app.use(errors);
beforeEach(() => {
  jest.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ id: 'user-a', name: 'A', email: 'a@example.test', isActive: true } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
  db.user.update.mockResolvedValue({ id: 'user-a', name: 'A' } as Awaited<ReturnType<typeof prisma.user.update>>);
  db.workspaceMember.findUnique.mockResolvedValue({ userId: 'user-a', workspaceId: 'workspace-a', role: 'EDITOR' } as Awaited<ReturnType<typeof prisma.workspaceMember.findUnique>>);
  db.workspace.findUnique.mockResolvedValue({ id: 'workspace-a', suspendedAt: null } as Awaited<ReturnType<typeof prisma.workspace.findUnique>>);
  jest.mocked(verifyToken).mockResolvedValue({ sub: 'clerk-a', exp: Math.floor(Date.now() / 1000) + 60 } as Awaited<ReturnType<typeof verifyToken>>);
});
describe('D01 profile mutation boundary', () => {
  it.each([{ systemRole: 'SUPER_ADMIN' }, { clerkId: 'clerk-victim' }, { memberships: { create: { workspaceId: 'victim', role: 'OWNER' } } }])('rejects privilege fields %j before Prisma', async attack => {
    expect((await request(app).patch('/api/auth/me').send({ name: 'Updated', ...attack })).status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it('permits only profile changes', async () => {
    expect((await request(app).patch('/api/auth/me').send({ name: 'Updated' })).status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-a' }, data: { name: 'Updated' } }));
  });
});
describe('E01 execution must fail closed', () => {
  it.each(['javascript', 'python', 'bash'])('rejects %s execution', async language => {
    const response = await request(app).post('/api/snippets/execute').send({ language, code: 'AUDIT_NON_EXECUTABLE_TEXT' });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Code execution is unavailable' });
  });
});
describe('D02/D07 Hocuspocus authorization hooks', () => {
  afterEach(async () => { await destroyHocuspocus(); });
  async function authenticate(room: string) {
    const instance = setupHocuspocusServer(createServer());
    const connectionConfig = { readOnly: false, isAuthenticated: false };
    if (!instance.configuration.onAuthenticate) throw new Error('Missing authentication hook');
    await instance.configuration.onAuthenticate({ documentName: room, token: 'test-session', connectionConfig } as onAuthenticatePayload);
    return connectionConfig;
  }
  it('rejects a forged prefix for another workspace document', async () => {
    db.document.findUnique.mockResolvedValue({ id: 'document-b', workspaceId: 'workspace-b' } as Awaited<ReturnType<typeof prisma.document.findUnique>>);
    await expect(authenticate('document:workspace-a:document-b')).rejects.toThrow();
  });
  it('rejects nonexistent bare IDs', async () => {
    db.document.findUnique.mockResolvedValue(null);
    await expect(authenticate('nonexistent')).rejects.toThrow();
  });
  it('marks viewers read-only at the protocol connection', async () => {
    db.document.findUnique.mockResolvedValue({ id: 'document-a', workspaceId: 'workspace-a' } as Awaited<ReturnType<typeof prisma.document.findUnique>>);
    db.workspaceMember.findUnique.mockResolvedValue({ role: 'VIEWER' } as Awaited<ReturnType<typeof prisma.workspaceMember.findUnique>>);
    expect((await authenticate('document:workspace-a:document-a')).readOnly).toBe(true);
  });
  it('permits same-workspace editors', async () => {
    db.document.findUnique.mockResolvedValue({ id: 'document-a', workspaceId: 'workspace-a' } as Awaited<ReturnType<typeof prisma.document.findUnique>>);
    expect((await authenticate('document:workspace-a:document-a')).readOnly).toBe(false);
  });
});
