import { prisma } from '../lib/prisma';
import { withPrincipalAccess } from './workspace-policy';
import { ForbiddenError, BadRequestError } from '../utils/errors';

/** Pre-membership exception: the verified recipient, never the link alone, grants admission. */
export async function acceptInvitation(userId: string, email: string, invitationId: string) {
  if (!invitationId || invitationId.length > 191) throw new ForbiddenError('Access denied');
  const candidate = await withPrincipalAccess(userId, async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.invitation_recipient', ${email}, true)`;
    return tx.workspaceInvitation.findUnique({ where: { id: invitationId } });
  });
  if (!candidate || candidate.email !== email) throw new ForbiddenError('Access denied');
  return prisma.withTenantTransaction(candidate.workspaceId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${candidate.workspaceId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "WorkspaceInvitation" WHERE id=${invitationId} FOR UPDATE`;
    const [user, workspace, invitation] = await Promise.all([
      tx.user.findUnique({ where: { id: userId } }),
      tx.workspace.findUnique({ where: { id: candidate.workspaceId } }),
      tx.workspaceInvitation.findUnique({ where: { id: invitationId } }),
    ]);
    if (
      !user?.isActive ||
      user.email.toLowerCase() !== email ||
      !workspace ||
      workspace.suspendedAt ||
      !invitation ||
      invitation.email !== email
    )
      throw new ForbiddenError('Access denied');
    if (
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt.getTime() <= Date.now()
    )
      throw new BadRequestError('Invitation expired, revoked or already accepted');
    const member = await tx.workspaceMember.upsert({
      where: { userId_workspaceId: { userId, workspaceId: workspace.id } },
      create: { userId, workspaceId: workspace.id, role: invitation.role },
      update: {},
    });
    await tx.workspaceInvitation.update({
      where: { id: invitationId },
      data: { acceptedAt: new Date() },
    });
    await tx.activity.create({
      data: {
        workspaceId: workspace.id,
        userId,
        type: 'invitation_accepted',
        message: 'accepted a workspace invitation',
      },
    });
    return member;
  });
}
