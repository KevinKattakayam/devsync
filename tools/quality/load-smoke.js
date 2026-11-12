// Fixed smoke entry point; the imported setup and iteration retain the fixture gate.
import workload, { options as workloadOptions } from './load.js';
export { setup, handleSummary } from './load.js';
export default workload;
export const options = {
  ...workloadOptions,
  scenarios: { reads: { executor: 'constant-vus', vus: 2, duration: '15s', gracefulStop: '0s' } },
  summaryTrendStats: ['med', 'p(95)', 'p(99)', 'avg', 'min', 'max', 'count'],
  thresholds: { checks: ['rate==1'], http_req_failed: ['rate==0'] },
};
