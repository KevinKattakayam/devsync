'use client';

import { useEffect, useState } from 'react';
import { workspaceApi, documentApi } from '@/lib/api';
import { useSocket } from '@/providers/socket-provider';
import type { Workspace, PresenceUser } from '@/types';
import type { DocumentNode } from './document-tree';

export function useShellData(
  principal: string,
  workspaceId: string | undefined,
  pathname: string,
  refresh: boolean,
) {
  const scope = `${principal}:${workspaceId || ''}`;
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    workspaces: Workspace[];
    documents: DocumentNode[];
    error: boolean;
  }>();
  useEffect(() => {
    let disposed = false;
    void Promise.all([
      workspaceApi.list(),
      workspaceId ? documentApi.list(workspaceId) : Promise.resolve({ data: [] }),
    ])
      .then(([workspaces, documents]) => {
        if (!disposed)
          setSnapshot({
            scope,
            workspaces: workspaces.data,
            documents: documents.data,
            error: false,
          });
      })
      .catch(() => {
        if (!disposed) setSnapshot({ scope, workspaces: [], documents: [], error: true });
      });
    return () => {
      disposed = true;
    };
  }, [scope, workspaceId, pathname, refresh]);
  return snapshot?.scope === scope ? snapshot : undefined;
}
export function useWorkspacePresence(
  workspaceId: string | undefined,
  members: Workspace['members'] | undefined,
) {
  const { socket, isConnected } = useSocket();
  const [presence, setPresence] = useState<{ workspaceId: string; users: PresenceUser[] }>();
  useEffect(() => {
    if (!socket || !isConnected || !workspaceId) return;
    let disposed = false;
    const receive = (users: PresenceUser[]) => {
      if (!disposed) setPresence({ workspaceId, users });
    };
    socket.on('workspace:users', receive);
    socket.emit('workspace:join', { workspaceId });
    return () => {
      disposed = true;
      socket.off('workspace:users', receive);
      socket.emit('workspace:leave', { workspaceId });
    };
  }, [socket, isConnected, workspaceId]);
  const allowed = new Set(members?.map((member) => member.user.id));
  return isConnected && workspaceId && presence?.workspaceId === workspaceId
    ? presence.users.filter((person) => allowed.has(person.id))
    : [];
}
