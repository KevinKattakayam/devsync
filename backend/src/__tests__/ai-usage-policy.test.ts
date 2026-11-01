import type { Request, Response } from 'express';
import { aiUsage, admitAi } from '../middleware/ai-quota.middleware';
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
  await admitAi(req, {} as Response, next);
  expect(authorize).toHaveBeenCalledWith('actor', 'foreign');
  expect(read).not.toHaveBeenCalled();
  expect(reserve).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledTimes(2);
});
