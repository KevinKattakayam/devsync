import { createServer } from 'http';
import { fork } from 'child_process';
import { resolve } from 'path';
import { MAX_EXTRACTED_BYTES } from '../services/extraction-client';
const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/tiff', 'image/webp']);
export type Extract = (buffer: Buffer, mimeType: string, signal: AbortSignal) => Promise<string>;
/** Parent enforces a wall-clock deadline; container enforces total memory/CPU/PIDs. */
export function createIsolatedExtractor(
  childFile = resolve(__dirname, 'extract-child.js'),
): Extract {
  return (buffer, mimeType, signal) =>
    new Promise((done, reject) => {
      const child = fork(childFile, [], {
        cwd: '/tmp',
        env: { NODE_ENV: 'production', OCR_LANG_PATH: '/app/ocr-data' },
        execArgv: ['--max-old-space-size=256'],
        serialization: 'advanced',
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      let settled = false;
      const finish = (error?: Error, text?: string) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', cancel);
        child.kill('SIGKILL');
        if (error) reject(error);
        else done(text || '');
      };
      const cancel = () => finish(new Error('Extraction canceled'));
      signal.addEventListener('abort', cancel, { once: true });
      child.once('error', () => finish(new Error('Extraction unavailable')));
      child.once('exit', () => finish(new Error('Extraction failed')));
      child.once('message', (result: unknown) => {
        if (
          !result ||
          typeof result !== 'object' ||
          !('text' in result) ||
          typeof result.text !== 'string' ||
          Buffer.byteLength(result.text, 'utf8') > MAX_EXTRACTED_BYTES
        )
          finish(new Error('Invalid document'));
        else finish(undefined, result.text);
      });
      if (signal.aborted) cancel();
      else
        child.send({ buffer, mimeType }, (error) => {
          if (error) finish(new Error('Extraction unavailable'));
        });
    });
}
export const isolatedExtract = createIsolatedExtractor();
export function createExtractionServer(extract: Extract = isolatedExtract, deadlineMs = 30000) {
  let busy = false;
  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200).end();
      return;
    }
    if (req.method !== 'POST' || req.url !== '/extract') {
      res.writeHead(404).end();
      return;
    }
    const mime = req.headers['content-type'] || '';
    if (!allowed.has(mime)) {
      res.writeHead(415).end();
      return;
    }
    if (busy) {
      res.writeHead(429).end();
      return;
    }
    busy = true;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      abort.abort();
      res.destroy();
      req.destroy();
    }, deadlineMs);
    res.once('close', () => abort.abort());
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const data = Buffer.from(chunk as Uint8Array);
        size += data.length;
        if (size > 25 * 1024 * 1024) {
          res.writeHead(413).end();
          return;
        }
        chunks.push(data);
      }
      if (!size) {
        res.writeHead(422).end();
        return;
      }
      const text = await extract(Buffer.concat(chunks), mime, abort.signal);
      if (Buffer.byteLength(text, 'utf8') > MAX_EXTRACTED_BYTES) throw new Error('Text limit');
      res
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify({ text }));
    } catch {
      if (!res.destroyed) res.writeHead(422).end();
    } finally {
      clearTimeout(timer);
      busy = false;
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}
if (require.main === module) createExtractionServer().listen(5001, '0.0.0.0');
