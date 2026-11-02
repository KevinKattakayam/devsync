import { expect, it } from 'vitest';
import { resetDestination } from '../src/lib/safe-redirect';
it('blocks foreign, protocol-relative and backslash reset destinations', () => {
  for (const value of [
    'https://attacker.invalid/',
    '//attacker.invalid',
    '/\\attacker.invalid',
    'javascript:alert(1)',
    null,
  ])
    expect(resetDestination(value, 'https://devsync.invalid/api/auth/reset').href).toBe(
      'https://devsync.invalid/login',
    );
  expect(
    resetDestination('/dashboard?q=docs#recent', 'https://devsync.invalid/api/auth/reset').href,
  ).toBe('https://devsync.invalid/dashboard?q=docs#recent');
});
