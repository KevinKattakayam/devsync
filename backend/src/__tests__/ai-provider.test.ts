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
it('retries only explicit rate rejection once, with backoff and no fallback', async () => {
  const wait = jest.fn(async (_ms: number) => undefined);
  const primary = jest.fn().mockRejectedValueOnce({ status: 429 }).mockResolvedValue('accepted');
  const secondary = jest.fn();
  expect(await openAiStream(primary, secondary, wait)).toBe('accepted');
  expect(primary).toHaveBeenCalledTimes(2);
  expect(wait).toHaveBeenCalledWith(250);
  expect(secondary).not.toHaveBeenCalled();
});
it('hard bounds provider attempts and aborts even a noncooperative SDK', async () => {
  const { boundedProvider } = await import('../services/ai-provider');
  jest.useFakeTimers();
  try {
    let signal: AbortSignal | undefined;
    const result = boundedProvider(async (value) => {
      signal = value;
      return new Promise<never>(() => undefined);
    }, 100);
    const assertion = expect(result).rejects.toThrow('deadline exceeded');
    await jest.advanceTimersByTimeAsync(100);
    await assertion;
    expect(signal?.aborted).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});
it('caps streamed output and never marks partial output complete', async () => {
  const { aiText } = await import('../services/ai-provider');
  const abort = new AbortController();
  const output: string[] = [];
  const stream = {
    async *[Symbol.asyncIterator]() {
      yield { choices: [{ delta: { content: 'safe' } }] };
      yield { choices: [{ delta: { content: 'overflow' } }] };
    },
  };
  await expect(
    (async () => {
      for await (const chunk of aiText(stream, abort.signal, 4)) output.push(chunk);
    })(),
  ).rejects.toThrow('output limit');
  expect(output).toEqual(['safe']);
});
it('stops locally when a streamed iterator ignores cancellation', async () => {
  const { aiText } = await import('../services/ai-provider');
  const abort = new AbortController();
  const stream = {
    [Symbol.asyncIterator]: () => ({
      next: async () => new Promise<IteratorResult<{ choices: [] }>>(() => undefined),
    }),
  };
  const iterator = aiText(stream, abort.signal);
  const assertion = expect(iterator.next()).rejects.toThrow('cancelled');
  abort.abort();
  await assertion;
});
