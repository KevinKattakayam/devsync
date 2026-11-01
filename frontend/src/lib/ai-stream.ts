import { z } from 'zod';
const source = z.object({
  type: z.string().max(32),
  title: z.string().max(512),
  score: z.number().finite(),
});
const event = z.object({
  content: z.string().optional(),
  sources: z.array(source).max(20).optional(),
  done: z.boolean().optional(),
  error: z.string().optional(),
});
export type AiEvent = z.infer<typeof event>;
/** Decode complete SSE frames, not individual network chunks. No provider error text is exposed. */
export async function readAiStream(
  response: Response,
  receive: (value: AiEvent) => void,
): Promise<void> {
  if (!response.ok || !response.body) throw new Error('AI is unavailable. Try again later.');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    done = false,
    total = 0;
  const frame = (text: string) => {
    const data = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    const value = event.parse(JSON.parse(data) as unknown);
    if (value.error) throw new Error('AI could not finish. Partial output cannot be applied.');
    if (!done) receive(value);
    done ||= value.done === true;
  };
  try {
    while (!done) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      buffer = buffer.replace(/\r\n/g, '\n');
      total += chunk.value?.byteLength || 0;
      if (total > 1048576) throw new Error('AI response exceeded the supported size.');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        frame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
      if (chunk.done) {
        if (buffer.trim()) frame(buffer);
        break;
      }
    }
    if (!done) throw new Error('AI connection ended early. Partial output cannot be applied.');
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
