// Test tooling only; no production application imports this launcher.
import { spawn } from 'child_process';
import { resolve } from 'path';

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
  summaryDiagnostic?:
    | 'summary_missing'
    | 'summary_invalid_json'
    | 'summary_schema_mismatch'
    | 'summary_oversized'
    | 'summary_duplicate';
  summaryChunks?: 'none' | 'single' | 'multiple';
}
export interface SanitizedSmokeMetrics {
  requestDurationMs: { median: number | null; p95: number | null; p99: number | null };
  requests: { count: number | null; perSecond: number | null };
  failedRequestRate: number | null;
  application: {
    requestDurationMs: { median: number | null; p95: number | null; p99: number | null };
    requests: { count: number | null; perSecond: number | null };
    failedRequestRate: number | null;
  };
  endpoints: Record<string, { median: number | null; p95: number | null; p99: number | null }>;
}

function numericValue(source: unknown, name: string): number | null {
  if (!source || typeof source !== 'object') return null;
  const values = (source as { values?: unknown }).values;
  if (!values || typeof values !== 'object') return null;
  const value = (values as Record<string, unknown>)[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readSanitizedMetrics(raw: string): {
  metrics: SanitizedSmokeMetrics | null;
  diagnostic?: NonNullable<SmokeResult['summaryDiagnostic']>;
} {
  const prefix = 'DEVSYNC_K6_SUMMARY_V1:';
  const lines = raw.split(/\r?\n/).filter((line) => line.startsWith(prefix));
  if (lines.length === 0) return { metrics: null, diagnostic: 'summary_missing' };
  if (lines.length !== 1) return { metrics: null, diagnostic: 'summary_duplicate' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(lines[0].slice(prefix.length));
  } catch {
    return { metrics: null, diagnostic: 'summary_invalid_json' };
  }
  try {
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      Object.keys(parsed).sort().join(',') !== 'metrics,version' ||
      (parsed as { version?: unknown }).version !== 1
    )
      return { metrics: null, diagnostic: 'summary_schema_mismatch' };
    const metrics =
      parsed && typeof parsed === 'object' ? (parsed as { metrics?: unknown }).metrics : undefined;
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics))
      return { metrics: null, diagnostic: 'summary_schema_mismatch' };
    const expected = [
      'http_req_duration',
      'http_reqs',
      'http_req_failed',
      'health_latency_ms',
      'profile_latency_ms',
      'documents_latency_ms',
      'document_latency_ms',
      'application_latency_ms',
      'application_requests',
      'application_failures',
    ];
    if (Object.keys(metrics).sort().join(',') !== expected.sort().join(','))
      return { metrics: null, diagnostic: 'summary_schema_mismatch' };
    for (const metric of Object.values(metrics)) {
      if (
        !metric ||
        typeof metric !== 'object' ||
        Array.isArray(metric) ||
        Object.keys(metric).join(',') !== 'values'
      )
        return { metrics: null, diagnostic: 'summary_schema_mismatch' };
      const values = (metric as { values?: unknown }).values;
      if (
        !values ||
        typeof values !== 'object' ||
        Array.isArray(values) ||
        Object.entries(values).some(
          ([key, value]) =>
            !['med', 'p(95)', 'p(99)', 'count', 'rate'].includes(key) ||
            typeof value !== 'number' ||
            !Number.isFinite(value),
        )
      )
        return { metrics: null, diagnostic: 'summary_schema_mismatch' };
    }
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
    const result: SanitizedSmokeMetrics = {
      requestDurationMs: durations('http_req_duration'),
      requests: {
        count: numericValue((metrics as Record<string, unknown>).http_reqs, 'count'),
        perSecond: numericValue((metrics as Record<string, unknown>).http_reqs, 'rate'),
      },
      failedRequestRate: numericValue((metrics as Record<string, unknown>).http_req_failed, 'rate'),
      application: {
        requestDurationMs: durations('application_latency_ms'),
        requests: {
          count: numericValue((metrics as Record<string, unknown>).application_requests, 'count'),
          perSecond: numericValue(
            (metrics as Record<string, unknown>).application_requests,
            'rate',
          ),
        },
        failedRequestRate: numericValue(
          (metrics as Record<string, unknown>).application_failures,
          'rate',
        ),
      },
      endpoints,
    };
    const required = [
      result.requestDurationMs.median,
      result.requestDurationMs.p95,
      result.requestDurationMs.p99,
      result.requests.count,
      result.requests.perSecond,
      result.failedRequestRate,
      result.application.requestDurationMs.median,
      result.application.requestDurationMs.p95,
      result.application.requestDurationMs.p99,
      result.application.requests.count,
      result.application.requests.perSecond,
      result.application.failedRequestRate,
      ...Object.values(endpoints).flatMap((entry) => [entry.median, entry.p95, entry.p99]),
    ];
    if (required.some((value) => value === null))
      return { metrics: null, diagnostic: 'summary_schema_mismatch' };
    return { metrics: result };
  } catch {
    return { metrics: null, diagnostic: 'summary_schema_mismatch' };
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
  let result: SmokeResult = { status: null, error: 'startup_failed', metrics: null };
  try {
    const child = spawn('k6', ['run', resolve(__dirname, '../../tools/quality/load-smoke.js')], {
      shell: false,
      stdio: ['ignore', 'pipe', 'ignore'],
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
    let summary = '';
    let tooLarge = false;
    let chunks = 0;
    child.stdout?.on('data', (chunk: Buffer) => {
      chunks++;
      if (tooLarge) return;
      if (Buffer.byteLength(summary) + chunk.length > 128 * 1024) {
        summary = '';
        tooLarge = true;
      } else summary += chunk.toString('utf8');
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
    if (result.status !== null && result.error === null) {
      const parsed = tooLarge
        ? { metrics: null, diagnostic: 'summary_oversized' as const }
        : readSanitizedMetrics(summary);
      result.metrics = parsed.metrics;
      if (parsed.diagnostic) result.summaryDiagnostic = parsed.diagnostic;
      result.summaryChunks = chunks === 0 ? 'none' : chunks === 1 ? 'single' : 'multiple';
    }
  } catch {
    result = { status: null, error: 'startup_failed', metrics: null };
  }
  return result;
}
