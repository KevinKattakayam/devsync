import { expect, it, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { NextRequest, type NextFetchEvent } from 'next/server';
const { authenticated } = vi.hoisted(() => ({ authenticated: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: () => authenticated,
  createRouteMatcher: () => (req: NextRequest) => ['/', '/login'].includes(req.nextUrl.pathname),
}));
vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('geist/font/sans', () => ({ GeistSans: { variable: 'ui-font' } }));
vi.mock('geist/font/mono', () => ({ GeistMono: { variable: 'mono-font' } }));
vi.mock('@/providers/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/providers/auth-provider', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/providers/socket-provider', () => ({
  SocketProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/ui/overlays', () => ({ Toast: () => null }));
vi.mock('@/components/sync-status-manager', () => ({ SyncStatusManager: () => null }));
import Layout from '../src/app/layout';
import proxy from '../src/proxy';
import { GET } from '../src/app/healthz/route';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it('shows setup guidance without rendering private children when local identity is unconfigured', async () => {
  vi.stubEnv('DEPLOYMENT_MODE', 'local');
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '');
  const markup = renderToStaticMarkup(
    <Layout>
      <p>Private workspace content</p>
    </Layout>,
  );
  expect(markup).toContain('DevSync local setup');
  expect(markup).not.toContain('Private workspace content');
  const redirect = await proxy(
    new NextRequest('http://localhost/workspace/private'),
    {} as NextFetchEvent,
  );
  expect(redirect?.headers.get('location')).toBe('http://localhost/login');
  expect(authenticated).not.toHaveBeenCalled();
});
it('retains the real authentication boundary when configured and keeps health independent', async () => {
  vi.stubEnv('DEPLOYMENT_MODE', 'local');
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_synthetic');
  expect(
    renderToStaticMarkup(
      <Layout>
        <p>Configured provider subtree</p>
      </Layout>,
    ),
  ).toContain('Configured provider subtree');
  proxy(new NextRequest('http://localhost/workspace/private'), {} as NextFetchEvent);
  expect(authenticated).toHaveBeenCalledTimes(1);
  proxy(new NextRequest('http://localhost/healthz'), {} as NextFetchEvent);
  expect(authenticated).toHaveBeenCalledTimes(1);
  expect(await GET().json()).toEqual({ status: 'ok' });
});
