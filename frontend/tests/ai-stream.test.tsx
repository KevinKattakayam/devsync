import { expect, it } from 'vitest';
import { readAiStream } from '../src/lib/ai-stream';
function response(text: string, bytewise = false) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        if (bytewise) for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
        else c.enqueue(bytes);
        c.close();
      },
    }),
  );
}
it('preserves split UTF8 and JSON frames, sources and explicit completion', async () => {
  const values: unknown[] = [];
  await readAiStream(
    response(
      'data: {"sources":[{"type":"document","title":"Welcome","score":1}]}\n\ndata: {"content":"தமிழ்"}\n\ndata: {"done":true}\r\n\r\n',
      true,
    ),
    (v) => values.push(v),
  );
  expect(values).toHaveLength(3);
  expect(values[1]).toEqual({ content: 'தமிழ்' });
});
it('rejects early termination and provider errors instead of marking drafts complete', async () => {
  await expect(readAiStream(response('data: {"content":"partial"}\n\n'), () => {})).rejects.toThrow(
    'ended early',
  );
  await expect(
    readAiStream(response('data: {"error":"private provider detail"}\n\n'), () => {}),
  ).rejects.toThrow('could not finish');
});
it('rejects malformed events without trusting arbitrary payloads', async () => {
  await expect(
    readAiStream(response('data: {"sources":[{"title":"missing type"}]}\n\n'), () => {}),
  ).rejects.toThrow();
});
