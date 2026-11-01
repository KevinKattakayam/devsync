import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { TenantPrismaClient, TenantTransaction } from '../lib/tenant-prisma';
import { ForbiddenError } from '../utils/errors';

export const READ_ROLES: readonly Role[] = [Role.OWNER, Role.EDITOR, Role.VIEWER];
export const WRITE_ROLES: readonly Role[] = [Role.OWNER, Role.EDITOR];
export const OWNER_ROLES: readonly Role[] = [Role.OWNER];

/** Operations such as workspace creation have a principal but no existing tenant. */
export async function withPrincipalAccess<T>(
  userId: string,
  operation: (tx: TenantTransaction) => Promise<T>,
  db: TenantPrismaClient = prisma,
): Promise<T> {
  if (!userId || userId.length > 191) throw new ForbiddenError('Access denied');
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR SHARE`;
    const user = await tx.user.findUnique({ where: { id: userId }, select: { isActive: true } });
    if (!user?.isActive) throw new ForbiddenError('Access denied');
    return operation(tx);
  });
}

/** Shared transport-neutral policy. Call before reading a room or emitting data. */
export async function authorizeWorkspace(
  userId: string,
  workspaceId: string,
  roles: readonly Role[] = READ_ROLES,
  db: Pick<TenantPrismaClient, 'user' | 'workspace' | 'workspaceMember'> = prisma,
) {
  if (!userId || !workspaceId || workspaceId.length > 191)
    throw new ForbiddenError('Access denied');
  const [user, workspace, member] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { isActive: true } }),
    db.workspace.findUnique({ where: { id: workspaceId }, select: { suspendedAt: true } }),
    db.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } }),
  ]);
  if (
    !user?.isActive ||
    !workspace ||
    workspace.suspendedAt ||
    !member ||
    !roles.includes(member.role)
  ) {
    throw new ForbiddenError('Access denied');
  }
  return member;
}

/** Locks and policy share the mutation's transaction; membership cannot change mid-write. */
export async function withWorkspaceAccess<T>(
  userId: string,
  workspaceId: string,
  roles: readonly Role[],
  operation: (tx: TenantTransaction) => Promise<T>,
  db: TenantPrismaClient = prisma,
): Promise<T> {
  if (!userId || !workspaceId || workspaceId.length > 191)
    throw new ForbiddenError('Access denied');
  return db.withTenantTransaction(workspaceId, async (tx) => {
    if (roles.includes(Role.VIEWER))
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${workspaceId} FOR SHARE`;
    else await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${workspaceId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "WorkspaceMember" WHERE "workspaceId"=${workspaceId} AND "userId"=${userId} FOR SHARE`;
    await authorizeWorkspace(userId, workspaceId, roles, tx);
    return operation(tx);
  });
}

export type ProtectedResource = 'document' | 'snippet' | 'task';
/** Legacy standalone URLs must not discover a protected resource by bypassing RLS. */
export async function withResourceAccess<T>(
  userId: string,
  kind: ProtectedResource,
  resourceId: string,
  roles: readonly Role[],
  operation: (tx: TenantTransaction, workspaceId: string) => Promise<T>,
  db: TenantPrismaClient = prisma,
): Promise<T> {
  if (!userId || !resourceId || resourceId.length > 191) throw new ForbiddenError('Access denied');
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
    orderBy: { workspaceId: 'asc' },
  });
  for (const { workspaceId } of memberships) {
    // First discover the ID within RLS. Do not reject unrelated read-only memberships.
    const found = await db.withTenantTransaction(workspaceId, async (tx) => {
      if (kind === 'document')
        return tx.document.findUnique({ where: { id: resourceId }, select: { id: true } });
      if (kind === 'snippet')
        return tx.snippet.findUnique({ where: { id: resourceId }, select: { id: true } });
      return tx.task.findUnique({ where: { id: resourceId }, select: { id: true } });
    });
    if (found)
      return withWorkspaceAccess(
        userId,
        workspaceId,
        roles,
        async (tx) => operation(tx, workspaceId),
        db,
      );
  }
  throw new ForbiddenError('Access denied');
}
