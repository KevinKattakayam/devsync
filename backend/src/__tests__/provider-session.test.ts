jest.mock('@clerk/express', () => ({
  getAuth: jest.fn(),
  clerkClient: {
    sessions: { getSession: jest.fn(), getSessionList: jest.fn(), revokeSession: jest.fn() },
  },
}));
import { getAuth, clerkClient } from '@clerk/express';
import type { Request } from 'express';
const originalKey = process.env.CLERK_SECRET_KEY;
beforeAll(() => {
  process.env.CLERK_SECRET_KEY = 'fixture-only';
});
afterAll(() => {
  if (originalKey === undefined) delete process.env.CLERK_SECRET_KEY;
  else process.env.CLERK_SECRET_KEY = originalKey;
});
import { requestSubject } from '../security/authentication';
it('rejects a provider-revoked session even while its verified JWT is unexpired', async () => {
  jest
    .mocked(getAuth)
    .mockReturnValue({ userId: 'user_fixture', sessionId: 'sess_revoked' } as ReturnType<
      typeof getAuth
    >);
  jest.mocked(clerkClient.sessions.getSession).mockResolvedValue({
    id: 'sess_revoked',
    userId: 'user_fixture',
    status: 'revoked',
    expireAt: Date.now() + 60000,
  } as Awaited<ReturnType<typeof clerkClient.sessions.getSession>>);
  await expect(requestSubject({} as Request)).rejects.toThrow();
});

import { ProviderSessions, type ProviderSession } from '../security/provider-sessions';
const record = (status = 'active', userId = 'user_fixture'): ProviderSession => ({
  id: 'sess_fixture',
  userId,
  status,
  expireAt: Date.now() + 60000,
  createdAt: 0,
  lastActiveAt: 0,
});
it('coalesces checks for at most five seconds, then denies remote revocation and cross-principal use', async () => {
  let now = Date.now();
  let status = 'active';
  const get = jest.fn(async () => record(status));
  const sessions = new ProviderSessions(
    { get, list: async () => ({ data: [], totalCount: 0 }), revoke: async () => record('revoked') },
    () => now,
    () => now,
  );
  await Promise.all([
    sessions.assertActive('sess_fixture', 'user_fixture'),
    sessions.assertActive('sess_fixture', 'user_fixture'),
  ]);
  expect(get).toHaveBeenCalledTimes(1);
  await expect(sessions.assertActive('sess_fixture', 'foreign')).rejects.toThrow(
    'Invalid or revoked',
  );
  status = 'revoked';
  now += 5001;
  await expect(sessions.assertActive('sess_fixture', 'user_fixture')).rejects.toThrow(
    'Invalid or revoked',
  );
  expect(get).toHaveBeenCalledTimes(2);
});
it('revokes only owned sessions and immediately invalidates locally cached authority', async () => {
  const revoke = jest.fn(async () => record('revoked'));
  const sessions = new ProviderSessions({
    get: async () => record(),
    list: async () => ({ data: [record()], totalCount: 101 }),
    revoke,
  });
  expect((await sessions.list('user_fixture', 'sess_fixture')).items[0].current).toBe(true);
  expect((await sessions.list('user_fixture')).hasMore).toBe(true);
  await expect(sessions.revoke('sess_fixture', 'foreign')).rejects.toThrow('Access denied');
  expect(revoke).not.toHaveBeenCalled();
  await sessions.assertActive('sess_fixture', 'user_fixture');
  await sessions.revoke('sess_fixture', 'user_fixture');
  await expect(sessions.assertActive('sess_fixture', 'user_fixture')).rejects.toThrow('revoked');
});
it('bounds provider failures and never returns provider exception details', async () => {
  const sessions = new ProviderSessions({
    get: async () => {
      throw new Error('PRIVATE_PROVIDER_DETAIL');
    },
    list: async () => ({ data: [record('active', 'foreign')], totalCount: 1 }),
    revoke: async () => record(),
  });
  await expect(sessions.assertActive('sess_fixture', 'user_fixture')).rejects.toMatchObject({
    statusCode: 503,
    message: 'Identity session service unavailable',
  });
  await expect(sessions.list('user_fixture')).rejects.toThrow('Access denied');
  await expect(sessions.assertActive(undefined, 'user_fixture')).rejects.toThrow('Invalid session');
});

it('does not extend cached authority when the host clock is corrected backwards', async () => {
  let wall = Date.now(),
    ticks = 0,
    status = 'active';
  const get = jest.fn(async () => record(status));
  const sessions = Reflect.construct(ProviderSessions, [
    { get, list: async () => ({ data: [], totalCount: 0 }), revoke: async () => record('revoked') },
    () => wall,
    () => ticks,
  ]) as ProviderSessions;
  await sessions.assertActive('sess_fixture', 'user_fixture');
  wall -= 19800000;
  ticks += 5001;
  status = 'revoked';
  await expect(sessions.assertActive('sess_fixture', 'user_fixture')).rejects.toThrow('revoked');
  expect(get).toHaveBeenCalledTimes(2);
});
