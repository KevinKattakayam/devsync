jest.mock('../lib/redis', () => ({ redis: {} }));
import { openAiStream } from '../services/ai-provider';
it('uses only configured fallback on explicit pre-admission rejection', async () => {
  const second = jest.fn(async () => 'secondary');
  expect(
    await openAiStream(async () => {
      throw { status: 401 };
    }, second),
  ).toBe('secondary');
  expect(second).toHaveBeenCalledTimes(1);
  expect(await openAiStream(null, second)).toBe('secondary');
});
it('never falls back after ambiguous/possibly billable failure', async () => {
  for (const error of [new Error('timeout'), { status: 500 }, { status: 429 }]) {
    const second = jest.fn(async () => 'secondary');
    await expect(
      openAiStream(async () => {
        throw error;
      }, second),
    ).rejects.toEqual(error);
    expect(second).not.toHaveBeenCalled();
  }
  await expect(openAiStream(null, null)).rejects.toThrow('No configured');
});
it('does not replay partial output at a second provider', async () => {
  const secondary = jest.fn(async () => ({
    async *[Symbol.asyncIterator]() {
      yield 'other';
    },
  }));
  const stream = await openAiStream(
    async () => ({
      async *[Symbol.asyncIterator]() {
        yield 'partial';
        throw new Error('stream failed');
      },
    }),
    secondary,
  );
  await expect(
    (async () => {
      for await (const chunk of stream) {
        expect(chunk).toBe('partial');
      }
    })(),
  ).rejects.toThrow('stream failed');
  expect(secondary).not.toHaveBeenCalled();
});
it('rejects oversized editor input before admission', async () => {
  const { aiCompleteSchema } = await import('../controllers/ai.controller');
  expect(
    aiCompleteSchema.safeParse({ workspaceId: 'workspace', prompt: 'x'.repeat(16001) }).success,
  ).toBe(false);
  expect(
    aiCompleteSchema.safeParse({
      workspaceId: 'workspace',
      prompt: 'ok',
      context: 'x'.repeat(32001),
    }).success,
  ).toBe(false);
});
