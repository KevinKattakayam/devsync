// Prepared k6 REST read workload. No result/capacity claim until executed against an isolated fixture.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
const health = new Trend('health_latency_ms', true);
const profile = new Trend('profile_latency_ms', true);
const documents = new Trend('documents_latency_ms', true);
const document = new Trend('document_latency_ms', true);
export const options = {
  scenarios: { reads: { executor: 'constant-vus', vus: 10, duration: '30s' } },
  summaryTrendStats: ['med', 'p(95)', 'avg', 'min', 'max', 'count'],
  thresholds: { checks: ['rate==1'], http_req_failed: ['rate==0'] },
};
export function setup() {
  if (
    !__ENV.K6_BASE_URL ||
    !__ENV.K6_ACCESS_TOKEN ||
    !__ENV.K6_WORKSPACE_ID ||
    !__ENV.K6_DOCUMENT_ID
  )
    throw new Error(
      'Provide an isolated fixture URL, token, workspace and document via private environment variables',
    );
  if (
    !/^https?:\/\/(localhost|127\.0\.0\.1|host\.docker\.internal)(:\d+)?(?:\/|$)/.test(
      __ENV.K6_BASE_URL,
    )
  )
    throw new Error('This bounded local workload refuses nonlocal targets');
}
export default function () {
  const base = __ENV.K6_BASE_URL.replace(/\/$/, '');
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
