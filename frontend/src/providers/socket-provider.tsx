"use client";

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
  const { isAuthenticated, getToken } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;

    let newSocket: Socket | undefined;
    getToken().then((token) => {
      if (!token) return;
      newSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('[Socket] Connected');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('[Socket] Disconnected');
    });

    newSocket.on('workspace:users', (users: PresenceUser[]) => {
      setOnlineUsers(users);
    });

      setSocket(newSocket);
    });

    return () => {
      newSocket?.close();
    };
  }, [getToken, isAuthenticated]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
