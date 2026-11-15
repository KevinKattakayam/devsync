import { beforeEach, expect, it, vi } from 'vitest';
const { readCookies } = vi.hoisted(() => ({ readCookies: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: readCookies }));
import * as route from '../src/app/api/auth/reset/route';
const url = 'https://devsync.invalid/api/auth/reset?redirect=/dashboard';
beforeEach(() => {
  readCookies.mockReset();
  readCookies.mockResolvedValue({
    getAll: () => [
      { name: '__session', value: 'private' },
      { name: 'theme', value: 'dark' },
    ],
  });
});
it('keeps legacy GET redirect without clearing any cookie', async () => {
  const response = await route.GET(new Request(url));
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('/dashboard');
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(readCookies).not.toHaveBeenCalled();
});
it.each([undefined, 'null', 'https://foreign.invalid'])(
  'rejects POST origin %s before reading cookies',
  async (origin) => {
    const post = Reflect.get(route, 'POST') as
      ((request: Request) => Promise<Response>) | undefined;
    expect(post).toBeTypeOf('function');
    const response = await post!(
      new Request(url, { method: 'POST', headers: origin ? { origin } : {} }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(readCookies).not.toHaveBeenCalled();
  },
);
it('clears only identity cookies on same-origin POST and redirects with GET semantics', async () => {
  const post = Reflect.get(route, 'POST') as ((request: Request) => Promise<Response>) | undefined;
  expect(post).toBeTypeOf('function');
  const response = await post!(
    new Request(url, { method: 'POST', headers: { origin: 'https://devsync.invalid' } }),
  );
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/dashboard');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('set-cookie')).toContain('__session=');
  expect(response.headers.get('set-cookie')).not.toContain('theme=');
  expect(response.headers.get('set-cookie')).not.toContain('private');
});
it('uses only configured canonical origin behind a normalizing proxy, never caller-controlled Host', async () => {
  const previous = process.env.AUTH_TRUSTED_ORIGIN;
  try {
    process.env.AUTH_TRUSTED_ORIGIN = 'https://devsync.invalid';
    const proxyUrl = 'http://localhost:3000/api/auth/reset';
    expect(
      (
        await route.POST(
          new Request(proxyUrl, { method: 'POST', headers: { origin: 'https://devsync.invalid' } }),
        )
      ).status,
    ).toBe(303);
    expect(
      (
        await route.POST(
          new Request(proxyUrl, {
            method: 'POST',
            headers: { origin: 'https://foreign.invalid', host: 'foreign.invalid' },
          }),
        )
      ).status,
    ).toBe(403);
    process.env.AUTH_TRUSTED_ORIGIN = 'null';
    expect(
      (await route.POST(new Request(proxyUrl, { method: 'POST', headers: { origin: 'null' } })))
        .status,
    ).toBe(403);
  } finally {
    if (previous === undefined) delete process.env.AUTH_TRUSTED_ORIGIN;
    else process.env.AUTH_TRUSTED_ORIGIN = previous;
  }
});
