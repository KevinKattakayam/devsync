import { notifyCollaborationAclChange } from '../services/collaboration-acl';
import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors';
import {
  OWNER_ROLES,
  READ_ROLES,
  withPrincipalAccess,
  withWorkspaceAccess,
} from '../security/workspace-policy';

export const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().max(500).optional(),
  icon: z.string().max(10).optional(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  description: z.string().max(500).optional(),
  icon: z.string().max(10).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['EDITOR', 'VIEWER']).default('EDITOR'),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['OWNER', 'EDITOR', 'VIEWER']),
});

function generateSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') +
    '-' +
    Math.random().toString(36).substring(2, 8)
  );
}

export async function createWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, description, icon } = createWorkspaceSchema.parse(req.body);
    const userId = req.user!.userId;

    const workspace = await withPrincipalAccess(userId, async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name,
          slug: generateSlug(name),
          description,
          icon: icon || '💻',
          billingStatus: 'active',
          members: {
            create: {
              userId,
              role: Role.OWNER,
            },
          },
          // Create a default board
          boards: {
            create: {
              name: 'Main Board',
              columns: {
                create: [
                  { name: 'Backlog', position: 0 },
                  { name: 'To Do', position: 1 },
                  { name: 'In Progress', position: 2 },
                  { name: 'Review', position: 3 },
                  { name: 'Done', position: 4 },
                ],
              },
            },
          },
        },
        include: {
          members: {
            include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
          },
        },
      });

      // Log activity
      await tx.activity.create({
        data: {
          type: 'workspace_created',
          message: `created workspace "${name}"`,
          userId,
          workspaceId: workspace.id,
        },
      });

      return workspace;
    });

    res.status(201).json(workspace);
  } catch (error) {
    next(error);
  }
}

export async function getWorkspaces(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const memberships = await withPrincipalAccess(userId, (tx) =>
      tx.workspaceMember.findMany({
        where: { userId, workspace: { suspendedAt: null } },
        select: { workspaceId: true },
        orderBy: { joinedAt: 'desc' },
      }),
    );
    const workspaces = [];
    for (const { workspaceId } of memberships) {
      const workspace = await withWorkspaceAccess(userId, workspaceId, READ_ROLES, async (tx) => {
        const member = await tx.workspaceMember.findUniqueOrThrow({
          where: { userId_workspaceId: { userId, workspaceId } },
        });
        const workspace = await tx.workspace.findUniqueOrThrow({
          where: { id: workspaceId },
          include: {
            members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
            _count: { select: { documents: true, boards: true } },
          },
        });
        return { ...workspace, role: member.role };
      });
      workspaces.push(workspace);
    }
    res.json(workspaces);
  } catch (error) {
    next(error);
  }
}

export async function getWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.id);
    const workspace = await withWorkspaceAccess(req.user!.userId, workspaceId, READ_ROLES, (tx) =>
      tx.workspace.findUnique({
        where: { id: workspaceId },
        include: {
          members: {
            include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
          },
          _count: { select: { documents: true, boards: true, snippets: true } },
          activities: {
            take: 20,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { id: true, name: true, avatar: true } } },
          },
        },
      }),
    );

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    res.json(workspace);
  } catch (error) {
    next(error);
  }
}

export async function updateWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.id);
    const { name, description, icon } = updateWorkspaceSchema.parse(req.body);
    const workspace = await withWorkspaceAccess(req.user!.userId, workspaceId, OWNER_ROLES, (tx) =>
      tx.workspace.update({
        where: { id: workspaceId },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(icon && { icon }),
        },
      }),
    );
    res.json(workspace);
  } catch (error) {
    next(error);
  }
}

export async function deleteWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.id);
    await withWorkspaceAccess(req.user!.userId, workspaceId, OWNER_ROLES, (tx) =>
      tx.workspace.delete({ where: { id: workspaceId } }),
    );
    res.json({ message: 'Workspace deleted' });
  } catch (error) {
    next(error);
  }
}

export async function inviteMember(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, role } = inviteMemberSchema.parse(req.body);
    const workspaceId = String(req.params.id);

    const member = await withWorkspaceAccess(
      req.user!.userId,
      workspaceId,
      OWNER_ROLES,
      async (tx) => {
        const user = await tx.user.findUnique({ where: { email } });
        if (!user) {
          throw new NotFoundError('User not found with that email');
        }

        const existingMember = await tx.workspaceMember.findUnique({
          where: { userId_workspaceId: { userId: user.id, workspaceId } },
        });

        if (existingMember) {
          throw new BadRequestError('User is already a member');
        }

        const member = await tx.workspaceMember.create({
          data: {
            userId: user.id,
            workspaceId,
            role,
          },
          include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
        });

        await tx.activity.create({
          data: {
            type: 'member_invited',
            message: `invited ${user.name || user.email} to the workspace`,
            userId: req.user!.userId,
            workspaceId,
          },
        });

        return member;
      },
    );
    res.status(201).json(member);
  } catch (error) {
    next(error);
  }
}

export async function updateMemberRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { role } = updateMemberRoleSchema.parse(req.body);
    const memberId = String(req.params.memberId),
      workspaceId = String(req.params.id);
    const member = await withWorkspaceAccess(
      req.user!.userId,
      workspaceId,
      OWNER_ROLES,
      async (tx) => {
        const target = await tx.workspaceMember.findUnique({ where: { id: memberId } });
        if (!target || target.workspaceId !== workspaceId)
          throw new NotFoundError('Member not found');
        if (
          target.role === Role.OWNER &&
          role !== Role.OWNER &&
          (await tx.workspaceMember.count({ where: { workspaceId, role: Role.OWNER } })) <= 1
        )
          throw new ForbiddenError('Cannot demote the last workspace owner');
        return tx.workspaceMember.update({
          where: { id: memberId, workspaceId },
          data: { role },
          include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
        });
      },
    );
    notifyCollaborationAclChange(workspaceId, member.userId);
    res.json(member);
  } catch (error) {
    next(error);
  }
}
export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    const memberId = String(req.params.memberId),
      workspaceId = String(req.params.id);
    const member = await withWorkspaceAccess(
      req.user!.userId,
      workspaceId,
      OWNER_ROLES,
      async (tx) => {
        const target = await tx.workspaceMember.findUnique({ where: { id: memberId } });
        if (!target || target.workspaceId !== workspaceId)
          throw new NotFoundError('Member not found');
        if (target.role === Role.OWNER) throw new ForbiddenError('Cannot remove workspace owner');
        return tx.workspaceMember.delete({ where: { id: memberId, workspaceId } });
      },
    );
    notifyCollaborationAclChange(workspaceId, member.userId);
    res.json({ message: 'Member removed' });
  } catch (error) {
    next(error);
  }
}

export async function getActivities(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.id);
    const activities = await withWorkspaceAccess(req.user!.userId, workspaceId, READ_ROLES, (tx) =>
      tx.activity.findMany({
        where: { workspaceId },
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, avatar: true } } },
      }),
    );
    res.json(activities);
  } catch (error) {
    next(error);
  }
}
