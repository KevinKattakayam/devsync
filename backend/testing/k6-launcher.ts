// Test tooling only; no production application imports this launcher.
import { spawn } from 'child_process';
import { mkdtemp, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

export interface FixtureLoadConnection {
  baseUrl: string;
  capability: string;
  accessToken: string;
  workspaceId: string;
  documentId: string;
}
export interface SmokeResult {
  status: number | null;
  error:
    | 'invalid_configuration'
    | 'startup_failed'
    | 'cancelled'
    | 'terminated'
    | 'cleanup_failed'
    | null;
  metrics: SanitizedSmokeMetrics | null;
}
export interface SanitizedSmokeMetrics {
  requestDurationMs: { median: number | null; p95: number | null; p99: number | null };
  requests: { count: number | null; perSecond: number | null };
  failedRequestRate: number | null;
  endpoints: Record<string, { median: number | null; p95: number | null; p99: number | null }>;
}

function numericValue(source: unknown, name: string): number | null {
  if (!source || typeof source !== 'object') return null;
  const values = (source as { values?: unknown }).values;
  if (!values || typeof values !== 'object') return null;
  const value = (values as Record<string, unknown>)[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function readSanitizedMetrics(directory: string): Promise<SanitizedSmokeMetrics | null> {
  try {
    const summaryPath = join(directory, 'k6-results.json');
    if ((await stat(summaryPath)).size > 128 * 1024) return null;
    const raw = await readFile(summaryPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const metrics =
      parsed && typeof parsed === 'object' ? (parsed as { metrics?: unknown }).metrics : undefined;
    if (!metrics || typeof metrics !== 'object') return null;
    const durations = (name: string) => ({
      median: numericValue((metrics as Record<string, unknown>)[name], 'med'),
      p95: numericValue((metrics as Record<string, unknown>)[name], 'p(95)'),
      p99: numericValue((metrics as Record<string, unknown>)[name], 'p(99)'),
    });
    const endpoints = {
      health: durations('health_latency_ms'),
      profile: durations('profile_latency_ms'),
      documents: durations('documents_latency_ms'),
      document: durations('document_latency_ms'),
    };
    return {
      requestDurationMs: durations('http_req_duration'),
      requests: {
        count: numericValue((metrics as Record<string, unknown>).http_reqs, 'count'),
        perSecond: numericValue((metrics as Record<string, unknown>).http_reqs, 'rate'),
      },
      failedRequestRate: numericValue((metrics as Record<string, unknown>).http_req_failed, 'rate'),
      endpoints,
    };
  } catch {
    return null;
  }
}

function valid(input: FixtureLoadConnection): boolean {
  if (!input || typeof input !== 'object') return false;
  if (
    Object.keys(input).sort().join(',') !== 'accessToken,baseUrl,capability,documentId,workspaceId'
  )
    return false;
  const match =
    typeof input.baseUrl === 'string' &&
    /^http:\/\/127\.0\.0\.1:([0-9]{1,5})\/api\/?$/.exec(input.baseUrl);
  return Boolean(
    match &&
    Number(match[1]) >= 1 &&
    Number(match[1]) <= 65535 &&
    typeof input.capability === 'string' &&
    /^[a-f0-9]{64}$/.test(input.capability) &&
    typeof input.accessToken === 'string' &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(input.accessToken) &&
    input.accessToken.length <= 2048 &&
    typeof input.workspaceId === 'string' &&
    /^[A-Za-z0-9_-]{1,191}$/.test(input.workspaceId) &&
    typeof input.documentId === 'string' &&
    /^[A-Za-z0-9_-]{1,191}$/.test(input.documentId),
  );
}

/** Runs the fixed fixture smoke workload. Callers must independently provision a disposable fixture. */
export async function launchFixtureSmoke(
  input: FixtureLoadConnection,
  signal?: AbortSignal,
): Promise<SmokeResult> {
  if (!valid(input)) return { status: null, error: 'invalid_configuration', metrics: null };
  if (signal !== undefined && !(signal instanceof AbortSignal))
    return { status: null, error: 'invalid_configuration', metrics: null };
  if (signal?.aborted) return { status: null, error: 'cancelled', metrics: null };
  let directory: string;
  try {
    directory = await mkdtemp(join(tmpdir(), 'devsync-k6-smoke-'));
  } catch {
    return { status: null, error: 'startup_failed', metrics: null };
  }
  if (signal?.aborted) {
    try {
      await rm(directory, { recursive: true, force: true });
      return { status: null, error: 'cancelled', metrics: null };
    } catch {
      return { status: null, error: 'cleanup_failed', metrics: null };
    }
  }
  let result: SmokeResult = { status: null, error: 'startup_failed', metrics: null };
  try {
    const child = spawn('k6', ['run', resolve(__dirname, '../../tools/quality/load-smoke.js')], {
      cwd: directory,
      shell: false,
      stdio: 'ignore',
      env: {
        PATH: process.env.PATH || '/usr/bin:/bin',
        K6_NO_USAGE_REPORT: 'true',
        K6_BASE_URL: input.baseUrl,
        K6_FIXTURE_CAPABILITY: input.capability,
        K6_ACCESS_TOKEN: input.accessToken,
        K6_WORKSPACE_ID: input.workspaceId,
        K6_DOCUMENT_ID: input.documentId,
      },
    });
    result = await new Promise<SmokeResult>((done) => {
      let cancelled = false;
      let failed = false;
      let timer: NodeJS.Timeout | undefined;
      const cancel = () => {
        if (cancelled) return;
        cancelled = true;
        child.kill('SIGTERM');
        timer = setTimeout(() => child.kill('SIGKILL'), 3000);
        timer.unref();
      };
      signal?.addEventListener('abort', cancel, { once: true });
      process.on('SIGINT', cancel);
      process.on('SIGTERM', cancel);
      child.once('error', () => {
        failed = true;
      });
      child.once('close', (status) => {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        process.removeListener('SIGINT', cancel);
        process.removeListener('SIGTERM', cancel);
        done({
          status,
          error: cancelled
            ? 'cancelled'
            : failed
              ? 'startup_failed'
              : status === null
                ? 'terminated'
                : null,
          metrics: null,
        });
      });
      if (signal?.aborted) cancel();
    });
  } catch {
    result = { status: null, error: 'startup_failed', metrics: null };
  } finally {
    try {
      if (
        result.status !== null &&
        result.error !== 'startup_failed' &&
        result.error !== 'cancelled'
      )
        result.metrics = await readSanitizedMetrics(directory);
      await rm(directory, { recursive: true, force: true });
    } catch {
      result = { status: null, error: 'cleanup_failed', metrics: null };
    }
  }
  return result;
}
