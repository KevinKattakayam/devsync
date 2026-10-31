import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('I01 Next meets the current critical advisory remediation floor', () => {
  const [major, minor, patch] = require('next/package.json').version.split('.').map(Number);
  assert.ok(major * 1000000 + minor * 1000 + patch >= 16004001);
});
test('I01 unused NextAuth is absent from the installed frontend', () => {
  assert.throws(() => require.resolve('next-auth'), { code: 'MODULE_NOT_FOUND' });
});
