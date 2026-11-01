import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../utils/errors';
import { withPrincipalAccess } from '../security/workspace-policy';
import { prisma } from '../lib/prisma';
import { syncClerkUser } from '../middleware/auth.middleware';

import { requestSubject } from '../security/authentication';
import { verifyToken } from '@clerk/backend';

export const updateMeSchema = z
  .object({
    name: z.string().min(2).max(50).optional(),
    avatar: z.string().url().max(2048).optional().nullable(),
  })
  .strict();

export async function syncMe(req: Request, res: Response, next: NextFunction) {
  try {
    let clerkId: string | null = null;
    try {
      clerkId = await requestSubject(req);
    } catch {}

    if (!clerkId) {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (token) {
        const claims = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
        if (claims.sub) clerkId = String(claims.sub);
      }
    }

    if (!clerkId) throw new UnauthorizedError('Authentication required');
    const user = await syncClerkUser(clerkId);
    res.json(user);
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await withPrincipalAccess(req.user!.userId, (tx) =>
      tx.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          clerkId: true,
          name: true,
          email: true,
          avatar: true,
          createdAt: true,
          memberships: {
            include: { workspace: { select: { id: true, name: true, slug: true, icon: true } } },
          },
        },
      }),
    );
    if (!user) throw new UnauthorizedError('User not found');
    res.json(user);
  } catch (error) {
    next(error);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateMeSchema.parse(req.body);
    const user = await withPrincipalAccess(
      req.user!.userId,
      (tx) =>
        tx.user.update({
          where: { id: req.user!.userId },
          data,
          select: { id: true, name: true, email: true, avatar: true },
        }),
      prisma,
      true,
    );
    res.json(user);
  } catch (error) {
    next(error);
  }
}
