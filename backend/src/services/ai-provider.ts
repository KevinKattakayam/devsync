import { setTimeout as delay } from 'timers/promises';
export function providerStatus(error: unknown) {
  return error && typeof error === 'object' && 'status' in error ? Number(error.status) : undefined;
}
export const rejectedBeforeAdmission = (error: unknown) =>
  [401, 403, 404, 429].includes(Number(providerStatus(error)));
/** A hard attempt deadline also protects against a stalled SDK that ignores its timeout option. */
export async function boundedProvider<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 10000,
): Promise<T> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(abort.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(new Error('AI provider deadline exceeded'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
/** Never replay ambiguous failures or an admitted/partially consumed stream. */
export async function openAiStream<T>(
  primary: (() => Promise<T>) | null,
  secondary: (() => Promise<T>) | null,
  wait: (ms: number) => Promise<void> = async (ms) => {
    await delay(ms);
  },
) {
  const invoke = async (factory: () => Promise<T>) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await factory();
      } catch (error) {
        if (providerStatus(error) !== 429 || attempt >= 1) throw error;
        await wait(250 * 2 ** attempt);
      }
    }
  };
  if (!primary) {
    if (secondary) return invoke(secondary);
    throw new Error('No configured AI provider');
  }
  try {
    return await invoke(primary);
  } catch (error) {
    if (secondary && [401, 403, 404].includes(Number(providerStatus(error))))
      return invoke(secondary);
    throw error;
  }
}
export const AI_MAX_INPUT_CHARACTERS = 48000;
export const AI_MAX_OUTPUT_CHARACTERS = 16384;
export const AI_MAX_BODY_BYTES = 200000;
/** Stop a stalled iterator locally even if its SDK ignores cancellation; never replay it. */
export async function* aiText(
  stream: AsyncIterable<{ choices: { delta?: { content?: string | null } }[] }>,
  signal: AbortSignal,
  maximum = AI_MAX_OUTPUT_CHARACTERS,
) {
  const iterator = stream[Symbol.asyncIterator]();
  let rejectAbort: ((error: Error) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => rejectAbort?.(new Error('AI request cancelled'));
  signal.addEventListener('abort', onAbort, { once: true });
  let length = 0;
  try {
    if (signal.aborted) throw new Error('AI request cancelled');
    for (;;) {
      const step = await Promise.race([iterator.next(), aborted]);
      if (step.done) return;
      const text = step.value.choices[0]?.delta?.content || '';
      if (length + text.length > maximum) throw new Error('AI output limit exceeded');
      length += text.length;
      if (text) yield text;
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    void iterator.return?.().catch(() => undefined);
  }
}
