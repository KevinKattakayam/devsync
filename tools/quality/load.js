// Prepared k6 REST read workload. No result/capacity claim until executed against an isolated fixture.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import exec from 'k6/execution';
import { validateLoadConfig, validateFixtureResponse } from './load-safety.mjs';
const health = new Trend('health_latency_ms', true);
const profile = new Trend('profile_latency_ms', true);
const documents = new Trend('documents_latency_ms', true);
const document = new Trend('document_latency_ms', true);
export const options = {
  scenarios: { reads: { executor: 'constant-vus', vus: 10, duration: '30s' } },
  summaryTrendStats: ['med', 'p(95)', 'avg', 'min', 'max', 'count'],
  thresholds: { checks: ['rate==1'], http_req_failed: ['rate==0'] },
};
function preflight(config, expectedRunId) {
  const response = http.get(`${config.origin}/__fixture/load-preflight`, {
    headers: { 'x-e2e-run-secret': __ENV.K6_FIXTURE_CAPABILITY },
    redirects: 0,
    timeout: '5s',
    tags: { name: 'fixture_preflight' },
  });
  return validateFixtureResponse(response.status, response.body, expectedRunId);
}
export function setup() {
  const config = validateLoadConfig(__ENV);
  return { runId: preflight(config) };
}
export default function runReadWorkload(setupData) {
  let config;
  try {
    config = validateLoadConfig(__ENV);
    if (!setupData || !setupData.runId) throw new Error('Missing fixture setup proof');
    preflight(config, setupData.runId);
  } catch {
    exec.test.abort('Fixture preflight failed; workload stopped');
    return;
  }
  const base = config.base;
  const headers = { Authorization: `Bearer ${__ENV.K6_ACCESS_TOKEN}` };
  const paths = [
    ['/health', health, false],
    ['/auth/me', profile, true],
    [`/workspaces/${encodeURIComponent(__ENV.K6_WORKSPACE_ID)}/documents`, documents, true],
    [`/documents/${encodeURIComponent(__ENV.K6_DOCUMENT_ID)}`, document, true],
  ];
  for (const [path, metric, protectedRoute] of paths) {
    const response = http.get(`${base}${path}`, {
      headers: protectedRoute ? headers : {},
      timeout: '5s',
      redirects: 0,
      responseType: 'none',
    });
    metric.add(response.timings.duration);
    check(response, { 'authorized read returns 200': (value) => value.status === 200 });
  }
  sleep(1);
}
export function handleSummary(data) {
  // Summary contains metric aggregates, never request headers, tokens or content.
  return { 'k6-results.json': JSON.stringify(data, null, 2) };
}
