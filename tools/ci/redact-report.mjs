import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [kind, input, output] = process.argv.slice(2);
if (existsSync(input)) {
  const data = JSON.parse(readFileSync(input, 'utf8'));
  if (kind === 'gitleaks')
    for (const finding of data) {
      finding.Secret = '[REDACTED]';
      finding.Match = '[REDACTED]';
    }
  else if (kind === 'semgrep')
    for (const finding of data.results || []) {
      delete finding.extra?.lines;
      delete finding.extra?.metavars;
    }
  else throw new Error('Unknown report type');
  writeFileSync(output, JSON.stringify(data, null, 2) + '\n');
}
