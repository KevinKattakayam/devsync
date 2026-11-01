import { Request, Response, NextFunction } from 'express';
import { requestSubject, identityProfile } from '../security/authentication';
import { UnauthorizedError } from '../utils/errors';
import { prisma } from '../lib/prisma';
import { withIdentityProfileAccess } from '../security/service-policy';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; clerkId: string; email: string };
    }
  }
}

/** Resolves a verified Clerk session to DevSync's local authorization principal. */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const clerkId = await requestSubject(req);
    if (!clerkId) throw new UnauthorizedError('Authentication required');

    let user = await prisma.user.findUnique({ where: { clerkId } });
    if (!user) {
      user = await syncClerkUser(clerkId);
    }

    if (!user.isActive) throw new UnauthorizedError('Invalid or expired session');
    req.user = { userId: user.id, clerkId: user.clerkId, email: user.email };
    next();
  } catch (error) {
    next(
      error instanceof UnauthorizedError
        ? error
        : new UnauthorizedError('Invalid or expired session'),
    );
  }
}

/** Clerk already validates any supplied session; anonymous requests continue normally. */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const clerkId = await requestSubject(req);
    if (clerkId) {
      let user = await prisma.user.findUnique({ where: { clerkId } });
      if (!user) {
        user = await syncClerkUser(clerkId);
      }
      if (user?.isActive) req.user = { userId: user.id, clerkId: user.clerkId, email: user.email };
    }
    next();
  } catch {
    next();
  }
}

/** Creates/refreshes the local profile after a successful Clerk OAuth/SSO login. */
export async function syncClerkUser(clerkId: string) {
  const profile = await identityProfile(clerkId);
  const { email, name } = profile;

  return withIdentityProfileAccess(clerkId, (tx) =>
    tx.user.upsert({
      where: { clerkId },
      create: { clerkId, email, name, avatar: profile.avatar },
      update: { email, name, avatar: profile.avatar },
    }),
  );
}
