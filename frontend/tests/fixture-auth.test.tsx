import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../testing/auth-provider';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockClear();
});
function Consumer() {
  const auth = useAuth();
  return (
    <>
      <p>{auth.isLoading ? 'loading' : auth.user?.email || 'signed out'}</p>
      <button onClick={() => void auth.getToken({ skipCache: true })}>Renew</button>
      <button onClick={() => void auth.logout()}>Logout</button>
    </>
  );
}
for (const role of ['owner', 'editor', 'viewer']) {
  it(`loads ${role}, requests fresh tokens and invalidates logout before navigation`, async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/me'))
        return Response.json({ id: role, name: role, email: `${role}@example.test` });
      if (url.endsWith('/token')) return Response.json({ token: 'ephemeral-test-token' });
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetcher);
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await screen.findByText(`${role}@example.test`);
    fireEvent.click(screen.getByText('Renew'));
    fireEvent.click(screen.getByText('Renew'));
    await waitFor(() =>
      expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/token'))).toHaveLength(2),
    );
    fireEvent.click(screen.getByText('Logout'));
    await screen.findByText('signed out');
    expect(push).toHaveBeenCalledWith('/login');
    expect(fetcher).toHaveBeenLastCalledWith('http://127.0.0.1:5501/__test/logout', {
      method: 'POST',
      credentials: 'include',
    });
  });
}
it('ignores an identity response after the provider unmounts', async () => {
  let resolve: (response: Response) => void = () => {};
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ),
  );
  const view = render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
  view.unmount();
  await act(async () =>
    resolve(Response.json({ id: 'old', name: 'Old', email: 'old@example.test' })),
  );
  expect(screen.queryByText('old@example.test')).toBeNull();
});
