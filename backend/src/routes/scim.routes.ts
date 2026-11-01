import { idempotencyKeyHeader } from '../lib/create-idempotency';
import { idempotentCreate } from '../lib/create-idempotency';
import { Router } from 'express';
import { z } from 'zod';
import { BadRequestError, ForbiddenError, ConflictError } from '../utils/errors';
import { withScimAccess } from '../security/service-policy';
import { notifyCollaborationAclChange } from '../services/collaboration-acl';
import { validate } from '../middleware/validate.middleware';
import type { TenantTransaction } from '../lib/tenant-prisma';
const router = Router();
export const scimUserSchema = z.object({
  externalId: z.string().min(1).max(255),
  userName: z.string().email().max(255),
  name: z.object({ formatted: z.string().max(255).optional() }).optional(),
  active: z.boolean().optional(),
  roles: z
    .array(z.object({ value: z.enum(['EDITOR', 'VIEWER']) }))
    .max(1)
    .optional(),
});
function scimUser(
  user: { email: string; name: string | null },
  externalId: string,
  active: boolean,
) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: externalId,
    externalId,
    userName: user.email,
    active,
    name: { formatted: user.name || undefined },
    meta: { resourceType: 'User' },
  };
}
async function requireMutableMembership(
  tx: TenantTransaction,
  workspaceId: string,
  userId: string,
) {
  const member = await tx.workspaceMember.findUnique({
    where: { userId_workspaceId: { workspaceId, userId } },
  });
  if (member?.role === 'OWNER') throw new ForbiddenError('SCIM cannot modify workspace owners');
  return member;
}
router.post('/Users', idempotencyKeyHeader, validate(scimUserSchema), async (req, res, next) => {
  try {
    const input = scimUserSchema.parse(req.body);
    let mutated = false;
    const receipt = await withScimAccess(
      req.header('authorization'),
      async (tx, workspaceId, credentialId) =>
        idempotentCreate(
          tx,
          `scim:${credentialId}`,
          ['scim.user.create', workspaceId],
          req.header('idempotency-key'),
          input,
          async () => {
            mutated = true;
            const email = input.userName.toLowerCase();
            const identity = await tx.scimExternalIdentity.findUnique({
              where: { workspaceId_externalId: { workspaceId, externalId: input.externalId } },
              include: { user: true },
            });
            if (identity && identity.user.email.toLowerCase() !== email)
              throw new ConflictError('External identity is already bound');
            // Existing global Clerk profiles are never overwritten by a tenant provisioner.
            const user = await tx.user.upsert({
              where: { email },
              create: {
                clerkId: `scim:${workspaceId}:${input.externalId}`,
                email,
                name: input.name?.formatted,
              },
              update: {},
            });
            await requireMutableMembership(tx, workspaceId, user.id);
            if (input.active !== false)
              await tx.workspaceMember.upsert({
                where: { userId_workspaceId: { userId: user.id, workspaceId } },
                create: { userId: user.id, workspaceId, role: input.roles?.[0]?.value ?? 'VIEWER' },
                update: { role: input.roles?.[0]?.value ?? 'VIEWER' },
              });
            else await tx.workspaceMember.deleteMany({ where: { userId: user.id, workspaceId } });
            await tx.scimExternalIdentity.upsert({
              where: { workspaceId_externalId: { workspaceId, externalId: input.externalId } },
              create: { workspaceId, externalId: input.externalId, userId: user.id },
              update: {},
            });
            return {
              body: scimUser(user, input.externalId, input.active !== false),
              workspaceId,
              userId: user.id,
            };
          },
        ),
    );
    const result = z
      .object({ body: z.json(), workspaceId: z.string(), userId: z.string() })
      .parse(JSON.parse(JSON.stringify(receipt)));
    if (mutated) notifyCollaborationAclChange(result.workspaceId, result.userId);
    res.status(201).json(result.body);
  } catch (error) {
    next(error);
  }
});
router.patch('/Users/:externalId', validate(scimUserSchema.partial()), async (req, res, next) => {
  try {
    const input = scimUserSchema.partial().parse(req.body),
      externalId = z.string().min(1).max(255).parse(req.params.externalId);
    const result = await withScimAccess(req.header('authorization'), async (tx, workspaceId) => {
      const identity = await tx.scimExternalIdentity.findUnique({
        where: { workspaceId_externalId: { workspaceId, externalId } },
        include: { user: true },
      });
      if (!identity) throw new BadRequestError('SCIM identity not found');
      if (
        (input.externalId !== undefined && input.externalId !== externalId) ||
        (input.userName !== undefined &&
          input.userName.toLowerCase() !== identity.user.email.toLowerCase())
      )
        throw new ConflictError('Identity rebinding is not supported');
      if (input.name?.formatted !== undefined && input.name.formatted !== identity.user.name)
        throw new ConflictError('Profile changes require the identity provider');
      const existing = await requireMutableMembership(tx, workspaceId, identity.userId);
      if (input.active === false)
        await tx.workspaceMember.deleteMany({ where: { workspaceId, userId: identity.userId } });
      else if (input.active === true || input.roles !== undefined)
        await tx.workspaceMember.upsert({
          where: { userId_workspaceId: { workspaceId, userId: identity.userId } },
          create: {
            workspaceId,
            userId: identity.userId,
            role: input.roles?.[0]?.value ?? 'VIEWER',
          },
          update: { ...(input.roles?.[0]?.value && { role: input.roles[0].value }) },
        });
      return {
        body: scimUser(identity.user, externalId, input.active ?? existing !== null),
        userId: identity.userId,
        workspaceId,
      };
    });
    notifyCollaborationAclChange(result.workspaceId, result.userId);
    res.json(result.body);
  } catch (error) {
    next(error);
  }
});
router.delete('/Users/:externalId', async (req, res, next) => {
  try {
    const externalId = z.string().min(1).max(255).parse(req.params.externalId);
    const result = await withScimAccess(req.header('authorization'), async (tx, workspaceId) => {
      const identity = await tx.scimExternalIdentity.findUnique({
        where: { workspaceId_externalId: { workspaceId, externalId } },
      });
      if (!identity) return null;
      await requireMutableMembership(tx, workspaceId, identity.userId);
      await tx.workspaceMember.deleteMany({ where: { workspaceId, userId: identity.userId } });
      await tx.scimExternalIdentity.delete({ where: { id: identity.id, workspaceId } });
      return { workspaceId, userId: identity.userId };
    });
    if (result) notifyCollaborationAclChange(result.workspaceId, result.userId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
export default router;
