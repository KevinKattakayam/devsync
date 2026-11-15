import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  subject: 'user_fixture',
  otherToken: vi.fn(async () => 'other-fixture-token'),
  token: vi.fn(async () => 'fixture-token'),
  signOut: vi.fn(async (): Promise<void> => {}),
  getter: vi.fn(),
}));
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    isLoaded: true,
    user: {
      id: mocks.subject,
      fullName: 'Fixture',
      primaryEmailAddress: { emailAddress: 'fixture@example.test' },
    },
  }),
  useAuth: () => ({
    isSignedIn: true,
    getToken: mocks.subject === 'user_other' ? mocks.otherToken : mocks.token,
  }),
  useClerk: () => ({ signOut: mocks.signOut }),
}));
vi.mock('@/lib/api', () => ({ default: { post: mocks.post }, setTokenGetter: mocks.getter }));
import { AuthProvider } from '../src/providers/auth-provider';
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.subject = 'user_fixture';
});
it('withholds protected children after failed local identity sync and permits explicit recovery', async () => {
  mocks.post
    .mockRejectedValueOnce(new Error('PRIVATE_PROVIDER_DETAIL'))
    .mockResolvedValue({ data: { id: 'local' } });
  render(
    <AuthProvider>
      <p>Protected workspace</p>
    </AuthProvider>,
  );
  expect(screen.queryByText('Protected workspace')).toBeNull();
  await screen.findByText('Workspace session unavailable');
  expect(screen.queryByText(/PRIVATE_PROVIDER_DETAIL/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry session recovery' }));
  await screen.findByText('Protected workspace');
  expect(mocks.token).toHaveBeenCalledWith({ skipCache: true });
});
it('does not report successful sign-out when the provider rejects it', async () => {
  mocks.post.mockRejectedValue(new Error('sync unavailable'));
  mocks.signOut.mockRejectedValueOnce(new Error('PRIVATE_DETAIL'));
  render(
    <AuthProvider>
      <p>Protected workspace</p>
    </AuthProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
  await screen.findByText('Sign-out was not confirmed. Retry or use Clerk account recovery.');
  await waitFor(() => expect(mocks.getter).toHaveBeenCalledWith(null));
  expect(screen.queryByText('Protected workspace')).toBeNull();
});

it('does not restore a former account token getter when delayed sign-out fails after an account switch', async () => {
  let reject: ((error: Error) => void) | undefined;
  mocks.post.mockRejectedValue(new Error('sync unavailable'));
  mocks.signOut.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      }),
  );
  const view = render(
    <AuthProvider>
      <p>Protected workspace</p>
    </AuthProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
  mocks.subject = 'user_other';
  view.rerender(
    <AuthProvider>
      <p>Protected workspace</p>
    </AuthProvider>,
  );
  await waitFor(() => expect(mocks.getter).toHaveBeenLastCalledWith(mocks.otherToken));
  reject!(new Error('old signout failure'));
  await screen.findByText('Sign-out was not confirmed. Retry or use Clerk account recovery.');
  expect(mocks.getter).toHaveBeenLastCalledWith(mocks.otherToken);
});
