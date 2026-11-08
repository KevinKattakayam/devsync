import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError, UnauthorizedError } from '../utils/errors';
import { withPrincipalAccess } from '../security/workspace-policy';
import { prisma } from '../lib/prisma';
import { syncClerkUser } from '../middleware/auth.middleware';

import { requestSubject } from '../security/authentication';
import { verifyToken } from '@clerk/backend';
import { TokenVerificationError, TokenVerificationErrorReason } from '@clerk/backend/errors';

const invalidTokenReasons = new Set([
  TokenVerificationErrorReason.TokenExpired,
  TokenVerificationErrorReason.TokenInvalid,
  TokenVerificationErrorReason.TokenInvalidAlgorithm,
  TokenVerificationErrorReason.TokenInvalidAuthorizedParties,
  TokenVerificationErrorReason.TokenInvalidSignature,
  TokenVerificationErrorReason.TokenNotActiveYet,
  TokenVerificationErrorReason.TokenIatInTheFuture,
]);

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
      const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
      if (!match || match[1].length > 16384) throw new UnauthorizedError('Authentication required');
      try {
        const claims = await verifyToken(match[1], { secretKey: process.env.CLERK_SECRET_KEY });
        if (typeof claims.sub === 'string' && claims.sub.length > 0) clerkId = claims.sub;
      } catch (error) {
        if (error instanceof TokenVerificationError && invalidTokenReasons.has(error.reason))
          throw new UnauthorizedError('Invalid or expired session');
        throw new AppError('Identity verification unavailable', 503);
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
