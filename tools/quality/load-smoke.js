// Fixed smoke entry point; the imported setup and iteration retain the fixture gate.
export { default, setup, handleSummary } from './load.js';
export const options = {
  scenarios: { reads: { executor: 'constant-vus', vus: 2, duration: '15s', gracefulStop: '0s' } },
  summaryTrendStats: ['med', 'p(95)', 'avg', 'min', 'max', 'count'],
  thresholds: { checks: ['rate==1'], http_req_failed: ['rate==0'] },
};
