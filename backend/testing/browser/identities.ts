import { expect, BrowserContext } from '@playwright/test';
const api = 'http://127.0.0.1:5501';
export async function login(context: BrowserContext, role: 'owner' | 'editor' | 'viewer') {
  const secret = process.env.E2E_RUN_SECRET;
  if (!secret) throw new Error('Missing isolated browser run capability');
  // Node fetch keeps the run capability out of Playwright request/trace instrumentation.
  const response = await fetch(`${api}/__test/login`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json', 'x-e2e-run-secret': secret },
    body: JSON.stringify({ email: `sample-${role}@devsync.invalid` }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie()[0]?.split(';')[0];
  if (!cookie) throw new Error('Fixture login did not issue a cookie');
  const split = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, split),
      value: cookie.slice(split + 1),
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Strict',
      secure: false,
    },
  ]);
  expect((await context.request.get(`${api}/api/auth/me`)).status()).toBe(200);
}
