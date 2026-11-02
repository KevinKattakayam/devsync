import { AsyncLocalStorage } from 'async_hooks';
import { clerkClient, getAuth } from '@clerk/express';
import type { Request } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

export interface IdentityProfile {
  email: string;
  name: string | null;
  avatar: string | null;
  emailVerified: boolean;
}
export interface AuthenticationStrategy {
  identify(req: Request): Promise<string | null>;
  profile(clerkId: string): Promise<IdentityProfile>;
}
const strategyContext = new AsyncLocalStorage<AuthenticationStrategy>();
/** Trusted composition only. Production server never binds another strategy. */
export function withAuthentication<T>(strategy: AuthenticationStrategy, operation: () => T): T {
  return strategyContext.run(strategy, operation);
}
export async function requestSubject(req: Request): Promise<string | null> {
  const strategy = strategyContext.getStore();
  return strategy ? strategy.identify(req) : getAuth(req).userId;
}
export async function identityProfile(clerkId: string): Promise<IdentityProfile> {
  const strategy = strategyContext.getStore();
  if (strategy) return strategy.profile(clerkId);
  const user = await clerkClient.users.getUser(clerkId),
    email = user.primaryEmailAddress;
  if (!email) throw new UnauthorizedError('Identity email unavailable');
  return {
    email: email.emailAddress,
    emailVerified: email.verification?.status === 'verified',
    name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || null,
    avatar: user.imageUrl,
  };
}
export async function verifiedRecipientEmail(req: Request): Promise<string> {
  if (!req.user) throw new UnauthorizedError('Authentication required');
  const profile = await identityProfile(req.user.clerkId);
  if (!profile.emailVerified || profile.email.toLowerCase() !== req.user.email.toLowerCase())
    throw new ForbiddenError('A verified email is required');
  return profile.email.toLowerCase();
}
