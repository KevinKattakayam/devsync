import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PresenceUser, WorkspaceMember } from '../src/types';
import { useWorkspacePresence } from '../src/components/shell/use-shell-data';
const socket = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn() }));
vi.mock('@/providers/socket-provider', () => ({
  useSocket: () => ({ socket, isConnected: true }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('uses the existing join DTO, re-joins a new workspace and filters stale foreign presence', () => {
  const members: WorkspaceMember[] = [
    {
      id: 'membership',
      role: 'OWNER',
      joinedAt: '',
      user: { id: 'allowed', name: 'Developer', email: 'developer@example.test' },
    },
  ];
  const { result, rerender, unmount } = renderHook(
    ({ id }) => useWorkspacePresence(id, members, 'Developer'),
    { initialProps: { id: 'first' } },
  );
  expect(socket.emit).toHaveBeenCalledWith('workspace:join', {
    workspaceId: 'first',
    userName: 'Developer',
  });
  const receive = socket.on.mock.calls[0][1] as (users: PresenceUser[]) => void;
  act(() =>
    receive([
      { id: 'allowed', name: 'Developer', socketId: '1' },
      { id: 'foreign', name: 'Foreign', socketId: '2' },
    ]),
  );
  expect(result.current.map((user) => user.id)).toEqual(['allowed']);
  rerender({ id: 'second' });
  expect(result.current).toEqual([]);
  expect(socket.emit).toHaveBeenCalledWith('workspace:leave', { workspaceId: 'first' });
  expect(socket.emit).toHaveBeenCalledWith('workspace:join', {
    workspaceId: 'second',
    userName: 'Developer',
  });
  unmount();
  expect(socket.emit).toHaveBeenCalledWith('workspace:leave', { workspaceId: 'second' });
});
