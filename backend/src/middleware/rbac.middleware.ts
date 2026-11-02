import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { ForbiddenError } from '../utils/errors';
import { authorizeWorkspace } from '../security/workspace-policy';

export function requireRole(...roles: Role[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const workspaceId = String(req.params.workspaceId || req.params.id);

      if (!userId || !workspaceId) {
        throw new ForbiddenError('Missing user or workspace context');
      }

      await authorizeWorkspace(userId, workspaceId, roles);

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
