'use client';

import type { PresenceUser } from '@/types';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './auth-provider';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  onlineUsers: PresenceUser[];
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  onlineUsers: [],
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [principal, setPrincipal] = useState<string | undefined>();
  const { isAuthenticated, getToken, user } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;

    let disposed = false;
    const newSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000', {
      autoConnect: false,
      auth: async (callback) => {
        try {
          const token = await getToken();
          if (!disposed) callback({ token });
        } catch {
          if (!disposed) callback({ token: null });
        }
      },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
    });
    const refresh = async () => {
      try {
        const token = await getToken({ skipCache: true });
        if (token && !disposed && newSocket.connected) newSocket.emit('session:refresh', { token });
      } catch {
        if (!disposed) newSocket.disconnect();
      }
    };
    newSocket.on('connect', () => {
      if (!disposed) {
        setPrincipal(user?.id);
        setIsConnected(true);
        setSocket(newSocket);
        setOnlineUsers([]);
      }
    });
    newSocket.on('disconnect', () => {
      if (!disposed) {
        setIsConnected(false);
        setOnlineUsers([]);
      }
    });
    newSocket.on('workspace:users', (users: PresenceUser[]) => {
      if (!disposed) setOnlineUsers(users);
    });
    newSocket.on('session:refresh-required', refresh);
    newSocket.connect();
    return () => {
      disposed = true;
      newSocket.removeAllListeners();
      newSocket.disconnect();
    };
  }, [getToken, isAuthenticated, user?.id]);

  return (
    <SocketContext.Provider
      value={{
        socket: isAuthenticated && principal === user?.id ? socket : null,
        isConnected: isAuthenticated && principal === user?.id && isConnected,
        onlineUsers: isAuthenticated && principal === user?.id ? onlineUsers : [],
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
