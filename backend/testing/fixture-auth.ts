import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { Router, Request } from 'express';
import { z } from 'zod';
import type { TenantPrismaClient } from '../src/lib/tenant-prisma';
import type { AuthenticationStrategy } from '../src/security/authentication';
import { UnauthorizedError } from '../src/utils/errors';

export function validateFixtureConfiguration(environment: NodeJS.ProcessEnv) {
  if (environment.NODE_ENV !== 'test') throw new Error('Fixture server requires NODE_ENV=test');
  const url = new URL(environment.DATABASE_URL || '');
  if (!/^\/devsync_e2e_[a-z0-9_]+$/.test(url.pathname))
    throw new Error('Fixture server requires an isolated devsync_e2e_ database');
  if (!environment.E2E_RUN_SECRET || !/^[a-f0-9]{64}$/.test(environment.E2E_RUN_SECRET))
    throw new Error('Fixture server requires a random 32-byte hexadecimal E2E_RUN_SECRET');
  return { secret: environment.E2E_RUN_SECRET };
}
const ticketSchema = z
  .object({
    session: z.string().uuid(),
    kind: z.enum(['session', 'access']),
    exp: z.number().int(),
  })
  .strict();
const cookieName = 'devsync_fixture_session';
const identities = new Set(['user_fixture_owner', 'user_fixture_editor', 'user_fixture_viewer']);
export function createFixtureAuthentication(db: TenantPrismaClient, secret: string) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Fixture authentication requires test mode');
  if (!/^[a-f0-9]{64}$/.test(secret))
    throw new Error('Fixture authentication requires a random run secret');
  const sessions = new Map<string, { clerkId: string; expiresAt: number }>();
  function signature(value: string) {
    return createHmac('sha256', secret).update(value).digest('base64url');
  }
  function sign(session: string, kind: 'session' | 'access', exp: number) {
    const body = Buffer.from(JSON.stringify({ session, kind, exp })).toString('base64url');
    return `${body}.${signature(body)}`;
  }
  function verify(token: string, kind: 'session' | 'access') {
    if (token.length > 2048) throw new UnauthorizedError('Invalid fixture session');
    const [body, supplied, extra] = token.split('.'),
      expected = signature(body || '');
    if (
      !body ||
      !supplied ||
      extra ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      throw new UnauthorizedError('Invalid fixture session');
    const ticket = ticketSchema.parse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))),
      current = sessions.get(ticket.session);
    if (
      ticket.kind !== kind ||
      ticket.exp <= Date.now() ||
      !current ||
      current.expiresAt <= Date.now()
    )
      throw new UnauthorizedError('Expired fixture session');
    return {
      ...current,
      session: ticket.session,
      expiresAt: Math.min(ticket.exp, current.expiresAt),
    };
  }
  function cookie(req: Request) {
    return (
      req.headers.cookie
        ?.split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith(`${cookieName}=`))
        ?.slice(cookieName.length + 1) || ''
    );
  }
  function resolve(req: Request) {
    const bearer = req.header('authorization');
    return bearer?.startsWith('Bearer ')
      ? verify(bearer.slice(7), 'access')
      : verify(cookie(req), 'session');
  }
  const strategy: AuthenticationStrategy = {
    async identify(req) {
      try {
        return resolve(req).clerkId;
      } catch {
        return null;
      }
    },
    async profile(clerkId) {
      if (!identities.has(clerkId)) throw new UnauthorizedError('Invalid fixture identity');
      const user = await db.user.findUniqueOrThrow({ where: { clerkId } });
      return { email: user.email, name: user.name, avatar: user.avatar, emailVerified: true };
    },
  };
  const router = Router();
  router.post('/login', async (req, res, next) => {
    try {
      const capability = req.header('x-e2e-run-secret') || '';
      if (
        Buffer.byteLength(capability) !== Buffer.byteLength(secret) ||
        !timingSafeEqual(Buffer.from(capability), Buffer.from(secret))
      )
        throw new UnauthorizedError('Invalid fixture capability');
      const { email } = z.object({ email: z.email() }).strict().parse(req.body);
      const user = await db.user.findUnique({ where: { email } });
      if (!user?.isActive || !identities.has(user.clerkId))
        throw new UnauthorizedError('Invalid fixture identity');
      for (const [id, session] of sessions)
        if (session.expiresAt <= Date.now()) sessions.delete(id);
      if (sessions.size >= 32) return res.status(429).json({ error: 'Fixture session limit' });
      const id = randomUUID(),
        expiresAt = Date.now() + 15 * 60000;
      sessions.set(id, { clerkId: user.clerkId, expiresAt });
      res.cookie(cookieName, sign(id, 'session', expiresAt), {
        httpOnly: true,
        sameSite: 'strict',
        secure: false,
        path: '/',
        maxAge: 15 * 60000,
      });
      res.json({ id: user.id, name: user.name, email: user.email, avatar: user.avatar });
    } catch (error) {
      next(error);
    }
  });
  router.get('/me', async (req, res, next) => {
    try {
      const identity = resolve(req);
      const user = await db.user.findUniqueOrThrow({ where: { clerkId: identity.clerkId } });
      if (!user.isActive) throw new UnauthorizedError('Inactive fixture');
      res.json({ id: user.id, name: user.name, email: user.email, avatar: user.avatar });
    } catch (error) {
      next(error);
    }
  });
  router.get('/token', async (req, res, next) => {
    try {
      const session = resolve(req);
      res.json({
        token: sign(session.session, 'access', Math.min(session.expiresAt, Date.now() + 60000)),
      });
    } catch (error) {
      next(error);
    }
  });
  router.post('/logout', (req, res) => {
    try {
      sessions.delete(resolve(req).session);
    } catch {
      /* already expired */
    }
    res.clearCookie(cookieName, { path: '/', httpOnly: true, sameSite: 'strict', secure: false });
    res.status(204).end();
  });
  return {
    router,
    strategy,
    async identifyRealtime(token: string) {
      const identity = verify(token, 'access'),
        user = await db.user.findUniqueOrThrow({ where: { clerkId: identity.clerkId } });
      if (!user.isActive) throw new UnauthorizedError('Inactive fixture');
      return { id: user.id, name: user.name || 'Fixture user', expiresAt: identity.expiresAt };
    },
  };
}
