import { AddressInfo } from 'net';
import { createExtractionServer } from '../extraction/server';
import { extractBinary, MAX_EXTRACTED_BYTES } from '../services/extraction-client';
import { parseBinary } from '../extraction/extract-child';
const servers: ReturnType<typeof createExtractionServer>[] = [];
const original = process.env.INGESTION_EXTRACTOR_URL;
afterEach(async () => {
  if (original === undefined) delete process.env.INGESTION_EXTRACTOR_URL;
  else process.env.INGESTION_EXTRACTOR_URL = original;
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
async function listen(extract: Parameters<typeof createExtractionServer>[0], deadline?: number) {
  const server = createExtractionServer(extract, deadline);
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/extract`;
  process.env.INGESTION_EXTRACTOR_URL = url;
  return url;
}
it('requires operator configuration and rejects endpoint credentials without extraction', async () => {
  delete process.env.INGESTION_EXTRACTOR_URL;
  await expect(extractBinary(Buffer.from('pdf'), 'application/pdf')).rejects.toMatchObject({
    statusCode: 503,
  });
  process.env.INGESTION_EXTRACTOR_URL = 'http://credential@invalid/extract';
  await expect(extractBinary(Buffer.from('pdf'), 'application/pdf')).rejects.toMatchObject({
    statusCode: 503,
  });
});
it('transports bytes and returns bounded text through the isolated-service adapter', async () => {
  const extractor = jest.fn(async (buffer: Buffer, mime: string) => {
    expect(buffer.toString()).toBe('synthetic-pdf');
    expect(mime).toBe('application/pdf');
    return 'Synthetic extractor output; not an OCR accuracy measurement';
  });
  await listen(extractor);
  expect(await extractBinary(Buffer.from('synthetic-pdf'), 'application/pdf')).toContain(
    'Synthetic',
  );
  expect(extractor).toHaveBeenCalledTimes(1);
});
it('bounds content types, request sizes and response text without echoing parser errors', async () => {
  const extractor = jest.fn(async () => {
    throw new Error('PRIVATE_DOCUMENT_TEXT');
  });
  const url = await listen(extractor);
  expect(
    (
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/html' },
        body: 'invalid',
      })
    ).status,
  ).toBe(415);
  expect(extractor).not.toHaveBeenCalled();
  expect(
    (
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: Buffer.alloc(25 * 1024 * 1024 + 1),
      })
    ).status,
  ).toBe(413);
  expect(extractor).not.toHaveBeenCalled();
  await expect(extractBinary(Buffer.from('pdf'), 'application/pdf')).rejects.toMatchObject({
    statusCode: 400,
    message: 'Document exceeds extraction limits or is invalid',
  });
});
it('rejects oversized output and releases the worker after a canceled deadline', async () => {
  await listen(async () => 'x'.repeat(MAX_EXTRACTED_BYTES + 1));
  await expect(extractBinary(Buffer.from('pdf'), 'application/pdf')).rejects.toMatchObject({
    statusCode: 400,
  });
  let aborted = false;
  const url = await listen(
    (_buffer, _mime, signal) =>
      new Promise((_done, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(new Error('Stopped'));
          },
          { once: true },
        );
      }),
    40,
  );
  await expect(
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: 'pdf' }),
  ).rejects.toThrow();
  expect(aborted).toBe(true);
});
it('rejects huge declared image dimensions before OCR is started', async () => {
  // Synthetic PNG header: 100000 x 100000; no image decoder/model is invoked.
  const png = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.write('IHDR', 12);
  png.writeUInt32BE(100000, 16);
  png.writeUInt32BE(100000, 20);
  await expect(parseBinary(png, 'image/png')).rejects.toThrow('Pixel limit');
});

it('extracts synthetic PDF text locally and rejects PDFs above the page budget', async () => {
  const { readFileSync } = await import('fs');
  const { resolve } = await import('path');
  const fixture = (name: string) => readFileSync(resolve(__dirname, 'fixtures/extraction', name));
  expect(await parseBinary(fixture('synthetic.pdf'), 'application/pdf')).toContain(
    'SYNTHETIC PDF TEST',
  );
  await expect(parseBinary(fixture('over-page-limit.pdf'), 'application/pdf')).rejects.toThrow(
    'Page limit',
  );
});
it('extracts the synthetic image with the pinned local OCR model, without a provider', async () => {
  const { readFileSync } = await import('fs');
  const { resolve } = await import('path');
  const previous = process.env.OCR_LANG_PATH;
  process.env.OCR_LANG_PATH = resolve('node_modules/@tesseract.js-data/eng/4.0.0_best_int');
  try {
    expect(
      await parseBinary(
        readFileSync(resolve(__dirname, 'fixtures/extraction/synthetic-text.png')),
        'image/png',
      ),
    ).toContain('SYNTHETIC TEST');
  } finally {
    if (previous === undefined) delete process.env.OCR_LANG_PATH;
    else process.env.OCR_LANG_PATH = previous;
  }
}, 30000);
it('serves only health/extract routes, rejects empty requests, and bounds concurrency', async () => {
  let release: ((value: string) => void) | undefined;
  let started: (() => void) | undefined;
  const ready = new Promise<void>((done) => {
    started = done;
  });
  const url = await listen(
    () =>
      new Promise<string>((done) => {
        release = done;
        started!();
      }),
  );
  expect((await fetch(url.replace('/extract', '/healthz'))).status).toBe(200);
  expect((await fetch(url)).status).toBe(404);
  expect(
    (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/pdf' } })).status,
  ).toBe(422);
  const first = fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/pdf' },
    body: 'pdf',
  });
  await ready;
  expect(
    (
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: 'pdf',
      })
    ).status,
  ).toBe(429);
  release!('synthetic');
  expect((await first).status).toBe(200);
});

it('kills isolated child processes on cancellation, validates IPC, and excludes API credentials', async () => {
  const { createIsolatedExtractor } = await import('../extraction/server');
  const { resolve } = await import('path');
  const extract = createIsolatedExtractor(resolve(__dirname, 'fixtures/extraction/ipc-child.cjs'));
  const previous = process.env.PRIVATE_TEST_CREDENTIAL;
  process.env.PRIVATE_TEST_CREDENTIAL = 'fixture-only';
  try {
    expect(await extract(Buffer.from('synthetic'), 'success', new AbortController().signal)).toBe(
      'credential-free fixture',
    );
    await expect(
      extract(Buffer.from('synthetic'), 'invalid', new AbortController().signal),
    ).rejects.toThrow('Invalid document');
    await expect(
      extract(Buffer.from('synthetic'), 'exit', new AbortController().signal),
    ).rejects.toThrow('Extraction failed');
    const abort = new AbortController();
    const pending = extract(Buffer.from('synthetic'), 'hang', abort.signal);
    abort.abort();
    await expect(pending).rejects.toThrow('Extraction canceled');
    await expect(extract(Buffer.from('synthetic'), 'hang', abort.signal)).rejects.toThrow(
      'Extraction canceled',
    );
    await expect(
      createIsolatedExtractor('/nonexistent/worker.js')(
        Buffer.from('x'),
        'pdf',
        new AbortController().signal,
      ),
    ).rejects.toThrow('Extraction failed');
  } finally {
    if (previous === undefined) delete process.env.PRIVATE_TEST_CREDENTIAL;
    else process.env.PRIVATE_TEST_CREDENTIAL = previous;
  }
});
