import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors';
import { prisma } from '../lib/prisma';

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
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    + '-' + Math.random().toString(36).substring(2, 8);
}

export async function createWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, description, icon } = req.body;
    const userId = req.user!.userId;

    const workspace = await prisma.workspace.create({
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
    await prisma.activity.create({
      data: {
        type: 'workspace_created',
        message: `created workspace "${name}"`,
        userId,
        workspaceId: workspace.id,
      },
    });

    res.status(201).json(workspace);
  } catch (error) {
    next(error);
  }
}

export async function getWorkspaces(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;

    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            members: {
              include: { user: { select: { id: true, name: true, avatar: true } } },
            },
            _count: { select: { documents: true, boards: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const workspaces = memberships.map((m) => ({
      ...m.workspace,
      role: m.role,
    }));

    res.json(workspaces);
  } catch (error) {
    next(error);
  }
}

export async function getWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.id);
    const workspace = await prisma.workspace.findUnique({
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
    });

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
    const { name, description, icon } = req.body;
    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(icon && { icon }),
      },
    });
    res.json(workspace);
  } catch (error) {
    next(error);
  }
}

export async function deleteWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.id);
    await prisma.workspace.delete({ where: { id: workspaceId } });
    res.json({ message: 'Workspace deleted' });
  } catch (error) {
    next(error);
  }
}

export async function inviteMember(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, role } = req.body;
    const workspaceId = String(req.params.id);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundError('User not found with that email');
    }

    const existingMember = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId } },
    });

    if (existingMember) {
      throw new BadRequestError('User is already a member');
    }

    const member = await prisma.workspaceMember.create({
      data: {
        userId: user.id,
        workspaceId,
        role: role as Role,
      },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });

    await prisma.activity.create({
      data: {
        type: 'member_invited',
        message: `invited ${user.name || user.email} to the workspace`,
        userId: req.user!.userId,
        workspaceId,
      },
    });

    res.status(201).json(member);
  } catch (error) {
    next(error);
  }
}

export async function updateMemberRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { role } = req.body;
    const memberId = String(req.params.memberId);
    const member = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role: role as Role },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    res.json(member);
  } catch (error) {
    next(error);
  }
}

export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    const memberId = String(req.params.memberId);
    const member = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      throw new NotFoundError('Member not found');
    }

    if (member.role === Role.OWNER) {
      throw new ForbiddenError('Cannot remove workspace owner');
    }

    await prisma.workspaceMember.delete({ where: { id: memberId } });
    res.json({ message: 'Member removed' });
  } catch (error) {
    next(error);
  }
}

export async function getActivities(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.id);
    const activities = await prisma.activity.findMany({
      where: { workspaceId },
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });
    res.json(activities);
  } catch (error) {
    next(error);
  }
}
