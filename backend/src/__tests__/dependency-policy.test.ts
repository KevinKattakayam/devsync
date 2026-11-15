import { readFileSync } from 'fs';
function version(name: string): number[] {
  const metadata: unknown = JSON.parse(
    readFileSync(require.resolve(`${name}/package.json`), 'utf8'),
  );
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    !('version' in metadata) ||
    typeof metadata.version !== 'string'
  )
    throw new Error('Missing package version');
  return metadata.version.split('.').map((part) => Number(part));
}
it.each([
  ['express', [4, 22, 3]],
  ['multer', [2, 5, 0]],
  ['zod', [4, 6, 7]],
] as const)('I01 %s meets the verified advisory remediation floor', (name, floor) => {
  const installed = version(name);
  const actual = installed[0] * 1000000 + installed[1] * 1000 + installed[2];
  expect(actual).toBeGreaterThanOrEqual(floor[0] * 1000000 + floor[1] * 1000 + floor[2]);
});

it('keeps every production glob/minimatch copy above the recorded runtime remediation floors', () => {
  const lock: { packages: Record<string, { version?: string; dev?: boolean }> } = JSON.parse(
    readFileSync('package-lock.json', 'utf8'),
  );
  const floors: Record<string, number> = { glob: 14000002, minimatch: 11000001 };
  const found: string[] = [];
  for (const [path, entry] of Object.entries(lock.packages)) {
    const name = path.split('node_modules/').pop() || '';
    if (entry.dev || !(name in floors) || !entry.version) continue;
    const [major, minor, patch] = entry.version.split('.').map(Number);
    found.push(name);
    expect(major * 1000000 + minor * 1000 + patch).toBeGreaterThanOrEqual(floors[name]);
  }
  expect(found).toContain('glob');
  expect(found).toContain('minimatch');
});
