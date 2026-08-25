import { Request, Response, NextFunction } from 'express';
import { getAuth, clerkClient } from '@clerk/express';
import { UnauthorizedError } from '../utils/errors';
import { prisma } from '../lib/prisma';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; clerkId: string; email: string };
    }
  }
}

/** Resolves a verified Clerk session to DevSync's local authorization principal. */
export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = getAuth(req);
    if (!auth.userId) throw new UnauthorizedError('Authentication required');

    let user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user) {
      user = await syncClerkUser(auth.userId);
    }

    req.user = { userId: user.id, clerkId: user.clerkId, email: user.email };
    next();
  } catch (error) {
    next(error instanceof UnauthorizedError ? error : new UnauthorizedError('Invalid or expired session'));
  }
}

/** Clerk already validates any supplied session; anonymous requests continue normally. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = getAuth(req);
    if (auth.userId) {
      let user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
      if (!user) {
        user = await syncClerkUser(auth.userId);
      }
      if (user) req.user = { userId: user.id, clerkId: user.clerkId, email: user.email };
    }
    next();
  } catch {
    next();
  }
}

/** Creates/refreshes the local profile after a successful Clerk OAuth/SSO login. */
export async function syncClerkUser(clerkId: string) {
  const clerkUser = await clerkClient.users.getUser(clerkId);
  const email = clerkUser.primaryEmailAddress?.emailAddress;
  if (!email) throw new UnauthorizedError('Your identity provider did not provide an email address');
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || clerkUser.username || null;

  return prisma.user.upsert({
    where: { clerkId },
    create: { clerkId, email, name, avatar: clerkUser.imageUrl },
    update: { email, name, avatar: clerkUser.imageUrl },
  });
}
