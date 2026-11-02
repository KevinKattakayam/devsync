import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const metrics = ['statements', 'branches', 'functions', 'lines'];
export function compareCoverage(current, baseline) {
  const changes = [];
  for (const metric of metrics) {
    const actual = current?.total?.[metric]?.pct;
    const previous = baseline?.total?.[metric]?.pct;
    if (
      !Number.isFinite(actual) ||
      !Number.isFinite(previous) ||
      actual < 0 ||
      actual > 100 ||
      previous < 0 ||
      previous > 100
    )
      throw new Error(`Invalid coverage metric: ${metric}`);
    if (actual < previous) changes.push({ metric, actual, previous });
  }
  if (changes.length) throw new Error(`Coverage decreased: ${JSON.stringify(changes)}`);
  return Object.fromEntries(metrics.map((metric) => [metric, current.total[metric].pct]));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [service, currentFile, baselineFile] = process.argv.slice(2);
  const current = JSON.parse(readFileSync(currentFile, 'utf8'));
  const data = JSON.parse(readFileSync(baselineFile, 'utf8'));
  const baseline = data.total ? data : data[service];
  console.log(
    JSON.stringify(
      { service, status: 'passed', metrics: compareCoverage(current, baseline) },
      null,
      2,
    ),
  );
}
