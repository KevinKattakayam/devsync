import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { SocketProvider, useSocket } from '@/providers/socket-provider';

type Listener = (payload?: unknown) => void;
interface FixtureSocket {
  connected: boolean;
  stopped: boolean;
  listeners: Map<string, Listener[]>;
  sent: { event: string; payload: unknown }[];
  fire(event: string, payload?: unknown): void;
}
interface AuthOptions {
  auth(callback: (value: { token: string | null }) => void): Promise<void>;
}
const state = vi.hoisted(() => ({
  sockets: [] as FixtureSocket[],
  auth: {
    isAuthenticated: true,
    user: { id: 'alice' },
    getToken: vi.fn<(options?: { skipCache?: boolean }) => Promise<string | null>>(
      async () => 'fixture-token',
    ),
  },
}));
vi.mock('@/providers/auth-provider', () => ({ useAuth: () => state.auth }));
vi.mock('socket.io-client', () => ({
  io: (_url: string, options: AuthOptions) => {
    class Fixture implements FixtureSocket {
      connected = false;
      stopped = false;
      listeners = new Map<string, Listener[]>();
      sent: { event: string; payload: unknown }[] = [];
      on(event: string, callback: Listener) {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), callback]);
        return this;
      }
      fire(event: string, payload?: unknown) {
        this.listeners.get(event)?.forEach((listener) => listener(payload));
      }
      emit(event: string, payload: unknown) {
        this.sent.push({ event, payload });
        return this;
      }
      connect() {
        void options.auth((value) => {
          if (!this.stopped && value.token) {
            this.connected = true;
            this.fire('connect');
          }
        });
        return this;
      }
      disconnect() {
        this.stopped = true;
        this.connected = false;
        this.fire('disconnect');
        return this;
      }
      removeAllListeners() {
        this.listeners.clear();
        return this;
      }
    }
    const socket = new Fixture();
    state.sockets.push(socket);
    return socket;
  },
}));
afterEach(() => {
  cleanup();
  state.sockets.length = 0;
  state.auth.isAuthenticated = true;
  state.auth.user = { id: 'alice' };
  state.auth.getToken.mockReset().mockResolvedValue('fixture-token');
});

it('does not leave an orphan connection when unmounted during token resolution', async () => {
  let resolve: (token: string | null) => void = () => {};
  state.auth.getToken.mockImplementation(
    () =>
      new Promise<string | null>((done) => {
        resolve = done;
      }),
  );
  const view = renderHook(() => useSocket(), { wrapper: SocketProvider });
  view.unmount();
  await act(async () => {
    resolve('late-token');
    await Promise.resolve();
  });
  expect(state.sockets).toHaveLength(1);
  expect(state.sockets[0].stopped).toBe(true);
  expect(state.sockets[0].connected).toBe(false);
  expect(state.sockets[0].listeners.size).toBe(0);
});
it('renews with a fresh token and hides the previous account socket/presence', async () => {
  const view = renderHook(() => useSocket(), { wrapper: SocketProvider });
  await waitFor(() => expect(view.result.current.isConnected).toBe(true));
  const original = state.sockets[0];
  act(() => {
    original.fire('session:refresh-required');
  });
  await waitFor(() =>
    expect(original.sent.some((packet) => packet.event === 'session:refresh')).toBe(true),
  );
  expect(state.auth.getToken).toHaveBeenLastCalledWith({ skipCache: true });
  act(() => {
    original.fire('workspace:users', [{ id: 'alice', name: 'Private' }]);
  });
  expect(view.result.current.onlineUsers).toHaveLength(1);
  state.auth.user = { id: 'bob' };
  view.rerender();
  await waitFor(() => expect(state.sockets).toHaveLength(2));
  expect(original.stopped).toBe(true);
  expect(view.result.current.onlineUsers).toHaveLength(0);
  state.auth.isAuthenticated = false;
  view.rerender();
  expect(view.result.current.socket).toBeNull();
  expect(view.result.current.isConnected).toBe(false);
});
