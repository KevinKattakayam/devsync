import { createServer } from 'http';
import { fork } from 'child_process';
jest.setTimeout(30000);
it('exports real OTLP spans only when configured and strips content, URLs and error events', async () => {
  const bodies: string[] = [];
  const collector = createServer((req, res) => {
    const chunks: Buffer[] = []; req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => { bodies.push(Buffer.concat(chunks).toString()); res.setHeader('content-type', 'application/json'); res.end('{}'); });
  });
  await new Promise<void>(resolve => collector.listen(0, '127.0.0.1', resolve));
  const address = collector.address(); if (!address || typeof address === 'string') throw new Error('No test collector');
  const child = fork('src/__tests__/fixtures/telemetry-child.ts', [], {
    execArgv: ['--import', 'tsx'], silent: true,
    env: { ...process.env, OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${address.port}`, OTEL_SDK_DISABLED: 'false' },
  });
  try {
    let offByDefault = false;
    child.on('message', (value: unknown) => { if (value && typeof value === 'object' && 'offByDefault' in value) offByDefault = value.offByDefault === true; });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('OTLP child timeout')); }, 15000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('OTLP child failed')); });
    });
    expect(offByDefault).toBe(true);
    expect(bodies.length).toBeGreaterThan(0); expect(bodies.join('')).toContain('fixture-request');
    expect(bodies.join('')).toContain('groq'); expect(bodies.join('')).not.toContain('DO_NOT_EXPORT');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    collector.closeAllConnections(); await new Promise<void>(resolve => collector.close(() => resolve()));
  }
});
