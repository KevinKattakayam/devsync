import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { withWorkspaceAccess, OWNER_ROLES } from '../security/workspace-policy';
import { acceptInvitation } from '../security/invitation-policy';
import { verifiedRecipientEmail } from '../security/authentication';
import { idempotentCreate } from '../lib/create-idempotency';
import { NotFoundError } from '../utils/errors';

export const invitationSchema = z
  .object({ email: z.email().max(254), role: z.enum(['EDITOR', 'VIEWER']) })
  .strict();
export const acceptInvitationSchema = z.object({}).strict();
export async function createInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    const body = invitationSchema.parse(req.body),
      workspaceId = String(req.params.id);
    const normalized = { email: body.email.toLowerCase(), role: body.role };
    const invitation = await withWorkspaceAccess(req.user!.userId, workspaceId, OWNER_ROLES, (tx) =>
      idempotentCreate(
        tx,
        req.user!.userId,
        ['invitation.create', workspaceId],
        req.header('idempotency-key'),
        normalized,
        async () => {
          const created = await tx.workspaceInvitation.create({
            data: { ...normalized, workspaceId, expiresAt: new Date(Date.now() + 7 * 86400000) },
          });
          await tx.activity.create({
            data: {
              workspaceId,
              userId: req.user!.userId,
              type: 'invitation_created',
              message: 'created a pending workspace invitation',
            },
          });
          return created;
        },
      ),
    );
    res.status(201).json(invitation);
  } catch (error) {
    next(error);
  }
}
export async function acceptPendingInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    acceptInvitationSchema.parse(req.body);
    const email = await verifiedRecipientEmail(req);
    res.json(await acceptInvitation(req.user!.userId, email, String(req.params.invitationId)));
  } catch (error) {
    next(error);
  }
}
export async function revokeInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    await withWorkspaceAccess(req.user!.userId, String(req.params.id), OWNER_ROLES, async (tx) => {
      const updated = await tx.workspaceInvitation.updateMany({
        where: {
          id: String(req.params.invitationId),
          workspaceId: String(req.params.id),
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      if (updated.count !== 1) throw new NotFoundError('Pending invitation not found');
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
