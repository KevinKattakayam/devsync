import { collectShellRendererDiagnostics } from './shell-renderer-diagnostics';

it('retains runtime metadata when renderer inspection fails', async () => {
  const diagnostics = await collectShellRendererDiagnostics('Chromium 151', false, async () => {
    throw new Error('Page renderer unavailable');
  });

  expect(diagnostics).toEqual({
    browserVersion: 'Chromium 151',
    executableOverride: false,
    rendererRead: 'unavailable',
  });
});

it('retains partial renderer fields when a browser field is unavailable', async () => {
  const diagnostics = await collectShellRendererDiagnostics('Chromium 151', true, async () => ({
    userAgent: { value: 'Chromium' },
    deviceScaleFactor: { value: 1 },
    viewport: { value: { width: 1440, height: 1000 } },
    colorScheme: { value: 'dark' },
    theme: { value: 'dark' },
    bodyFont: { error: 'unavailable' },
    fontStatus: { value: 'loaded' },
    fontFaces: { value: [{ family: 'GeistSans', weight: '100 900', status: 'loaded' }] },
  }));

  expect(diagnostics.rendererRead).toBe('complete');
  expect(diagnostics.renderer?.bodyFont).toEqual({ error: 'unavailable' });
  expect(diagnostics.renderer?.fontStatus).toEqual({ value: 'loaded' });
  expect(diagnostics.renderer?.fontFaces).toEqual({
    value: [{ family: 'GeistSans', weight: '100 900', status: 'loaded' }],
  });
});
