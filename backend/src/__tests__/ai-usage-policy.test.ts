import type { Request, Response } from 'express';
import { aiUsage, aiUsageV3, admitAi } from '../middleware/ai-quota.middleware';
const authorize = jest.fn();
const read = jest.fn();
const reserve = jest.fn();
jest.mock('../security/workspace-policy', () => ({
  authorizeWorkspace: (...args: unknown[]) => authorize(...args),
}));
jest.mock('../lib/redis', () => ({
  redis: {
    mget: (...args: unknown[]) => read(...args),
    eval: (...args: unknown[]) => reserve(...args),
  },
}));
beforeEach(() => {
  jest.clearAllMocks();
  authorize.mockRejectedValue(new Error('Access denied'));
});
it('denies foreign workspace usage and admission before any counter/provider access', async () => {
  const req = {
    query: { workspaceId: 'foreign' },
    body: { workspaceId: 'foreign' },
    user: { userId: 'actor' },
  } as unknown as Request;
  const next = jest.fn();
  await aiUsage(req, {} as Response, next);
  await aiUsageV3(req, {} as Response, next);
  await admitAi(req, {} as Response, next);
  expect(authorize).toHaveBeenCalledWith('actor', 'foreign');
  expect(read).not.toHaveBeenCalled();
  expect(reserve).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledTimes(3);
});

it('returns only the authenticated actor and selected authorized workspace counters', async () => {
  authorize.mockResolvedValue({ role: 'VIEWER' });
  read.mockResolvedValue(['2', '3', '4', '5', null, null, null, null]);
  const json = jest.fn();
  const headers = jest.fn();
  const next = jest.fn();
  await aiUsageV3(
    {
      query: { workspaceId: 'allowed', actorId: 'victim' },
      user: { userId: 'actor' },
    } as unknown as Request,
    { json, setHeader: headers } as unknown as Response,
    next,
  );
  expect(authorize).toHaveBeenCalledWith('actor', 'allowed');
  expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
  expect(json).toHaveBeenCalledWith(
    expect.objectContaining({
      userScope: 'global account',
      user: expect.objectContaining({ daily: 2 }),
      workspace: expect.objectContaining({ daily: 4 }),
    }),
  );
  expect(next).not.toHaveBeenCalled();
});
