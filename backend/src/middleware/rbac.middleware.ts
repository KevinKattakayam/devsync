import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { prisma } from '../lib/prisma';

export function requireRole(...roles: Role[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const workspaceId = String(req.params.workspaceId || req.params.id);

      if (!userId || !workspaceId) {
        throw new ForbiddenError('Missing user or workspace context');
      }

      const member = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId,
            workspaceId,
          },
        },
      });

      if (!member) {
        throw new NotFoundError('Not a member of this workspace');
      }

      if (!roles.includes(member.role)) {
        throw new ForbiddenError(`Requires one of: ${roles.join(', ')}`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireWorkspaceMember() {
  return requireRole(Role.OWNER, Role.EDITOR, Role.VIEWER);
}

export function requireEditor() {
  return requireRole(Role.OWNER, Role.EDITOR);
}

export function requireOwner() {
  return requireRole(Role.OWNER);
}
