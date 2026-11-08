import { AppError, BadRequestError } from '../utils/errors';
export const MAX_EXTRACTED_BYTES = 256 * 1024;
/** Trusted operator endpoint only. Never accept a destination from uploaded content. */
export async function extractBinary(buffer: Buffer, mimeType: string): Promise<string> {
  const endpoint = process.env.INGESTION_EXTRACTOR_URL;
  if (!endpoint) throw new AppError('Isolated document extraction is not configured', 503);
  let url: URL;
  try {
    url = new URL(endpoint);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('Invalid endpoint');
  } catch {
    throw new AppError('Invalid extraction worker configuration', 503);
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': mimeType },
      body: new Uint8Array(buffer),
      redirect: 'error',
      signal: AbortSignal.timeout(35000),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      if (response.status === 422 || response.status === 413)
        throw new BadRequestError('Document exceeds extraction limits or is invalid');
      throw new AppError('Document extraction unavailable', 503);
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_EXTRACTED_BYTES * 6 + 64) throw new Error('Worker response too large');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (
      !result ||
      typeof result !== 'object' ||
      !('text' in result) ||
      typeof result.text !== 'string' ||
      Buffer.byteLength(result.text, 'utf8') > MAX_EXTRACTED_BYTES
    )
      throw new Error('Invalid worker output');
    return result.text;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Document extraction unavailable', 503);
  }
}
