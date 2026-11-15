export interface ShellRendererDiagnostics {
  browserVersion: string;
  executableOverride: boolean;
  renderer?: {
    userAgent: DiagnosticField<string>;
    deviceScaleFactor: DiagnosticField<number>;
    viewport: DiagnosticField<{ width: number; height: number }>;
    colorScheme: DiagnosticField<'dark' | 'light'>;
    theme: DiagnosticField<string>;
    bodyFont: DiagnosticField<string>;
    fontStatus: DiagnosticField<string>;
    fontFaces: DiagnosticField<{ family: string; weight: string; status: string }[]>;
  };
  rendererRead: 'complete' | 'unavailable';
}

export type DiagnosticField<T> = { value: T } | { error: 'unavailable' };

export async function collectShellRendererDiagnostics(
  browserVersion: string,
  executableOverride: boolean,
  readRenderer: () => Promise<ShellRendererDiagnostics['renderer']>,
): Promise<ShellRendererDiagnostics> {
  try {
    return {
      browserVersion,
      executableOverride,
      renderer: await readRenderer(),
      rendererRead: 'complete',
    };
  } catch {
    return { browserVersion, executableOverride, rendererRead: 'unavailable' };
  }
}
