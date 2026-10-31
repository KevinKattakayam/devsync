import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError } from '../utils/errors';

export const READ_ROLES: readonly Role[] = [Role.OWNER, Role.EDITOR, Role.VIEWER];
export const WRITE_ROLES: readonly Role[] = [Role.OWNER, Role.EDITOR];

/** Shared transport-neutral policy. Call before reading a room or emitting data. */
export async function authorizeWorkspace(userId: string, workspaceId: string, roles: readonly Role[] = READ_ROLES) {
  if (!userId || !workspaceId || workspaceId.length > 191) throw new ForbiddenError('Access denied');
  const [user, workspace, member] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { suspendedAt: true } }),
    prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } }),
  ]);
  if (!user?.isActive || !workspace || workspace.suspendedAt || !member || !roles.includes(member.role)) {
    throw new ForbiddenError('Access denied');
  }
  return member;
}
