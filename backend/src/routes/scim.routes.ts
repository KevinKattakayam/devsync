import { createHash, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { BadRequestError, UnauthorizedError } from '../utils/errors';

const router = Router();
const userSchema = z.object({
  externalId: z.string().min(1).max(255),
  userName: z.string().email(),
  name: z.object({ formatted: z.string().max(255).optional() }).optional(),
  active: z.boolean().optional().default(true),
  roles: z.array(z.object({ value: z.enum(['OWNER', 'EDITOR', 'VIEWER']) })).optional(),
});

function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }

async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = String(req.header('authorization') || '');
    if (!header.startsWith('Bearer ')) throw new UnauthorizedError('SCIM bearer token required');
    const token = header.slice(7);
    const hash = tokenHash(token);
    const record = await (prisma as any).scimProvisioningToken.findFirst({ where: { tokenHash: hash, revokedAt: null } });
    if (!record || !timingSafeEqual(Buffer.from(record.tokenHash), Buffer.from(hash))) throw new UnauthorizedError('Invalid SCIM token');
    req.scimWorkspaceId = record.workspaceId;
    next();
  } catch (error) { next(error); }
}

declare global { namespace Express { interface Request { scimWorkspaceId?: string; } } }
router.use(authenticate);

function scimUser(user: { id: string; email: string; name: string | null; isActive: boolean }, externalId: string) {
  return { schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], id: externalId, externalId, userName: user.email, active: user.isActive, name: { formatted: user.name || undefined }, meta: { resourceType: 'User' } };
}

router.post('/Users', async (req, res, next) => {
  try {
    const input = userSchema.parse(req.body);
    const workspaceId = req.scimWorkspaceId!;
    const role = input.roles?.[0]?.value ?? 'VIEWER';
    const result = await prisma.$transaction(async (tx: any) => {
      const user = await tx.user.upsert({ where: { email: input.userName.toLowerCase() }, create: { clerkId: `scim:${workspaceId}:${input.externalId}`, email: input.userName.toLowerCase(), name: input.name?.formatted, isActive: input.active }, update: { name: input.name?.formatted, isActive: input.active } } as any);
      await tx.workspaceMember.upsert({ where: { userId_workspaceId: { userId: user.id, workspaceId } }, create: { userId: user.id, workspaceId, role }, update: { role } });
      await tx.scimExternalIdentity.upsert({ where: { workspaceId_externalId: { workspaceId, externalId: input.externalId } }, create: { workspaceId, externalId: input.externalId, userId: user.id }, update: { userId: user.id } });
      return user;
    });
    res.status(201).json(scimUser(result, input.externalId));
  } catch (error) { next(error); }
});

router.patch('/Users/:externalId', async (req, res, next) => {
  try {
    const input = userSchema.partial().parse(req.body);
    const identity = await (prisma as any).scimExternalIdentity.findUnique({ where: { workspaceId_externalId: { workspaceId: req.scimWorkspaceId!, externalId: req.params.externalId } }, include: { user: true } });
    if (!identity) throw new BadRequestError('SCIM identity not found');
    const user = await prisma.user.update({ where: { id: identity.userId }, data: { ...(input.userName && { email: input.userName.toLowerCase() }), ...(input.name?.formatted !== undefined && { name: input.name.formatted }), ...(input.active !== undefined && { isActive: input.active }) } } as any);
    if (input.active === false) {
      await prisma.workspaceMember.deleteMany({ where: { userId: user.id, workspaceId: req.scimWorkspaceId! } });
      const { io } = await import('../server');
      io.in(`user:${user.id}`).disconnectSockets(true);
    }
    res.json(scimUser(user as any, identity.externalId));
  } catch (error) { next(error); }
});

router.delete('/Users/:externalId', async (req, res, next) => {
  try {
    const identity = await (prisma as any).scimExternalIdentity.findUnique({ where: { workspaceId_externalId: { workspaceId: req.scimWorkspaceId!, externalId: req.params.externalId } } });
    if (!identity) return res.status(204).end();
    await prisma.$transaction([prisma.workspaceMember.deleteMany({ where: { userId: identity.userId, workspaceId: req.scimWorkspaceId! } }), (prisma as any).scimExternalIdentity.delete({ where: { id: identity.id } })]);
    const { io } = await import('../server');
    io.in(`user:${identity.userId}`).disconnectSockets(true);
    res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
