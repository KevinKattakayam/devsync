"use client";

import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useAuth as useClerkAuth, useClerk, useUser } from '@clerk/nextjs';
import api, { setTokenGetter } from '@/lib/api';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  getToken: () => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ user: null, isLoading: true, isAuthenticated: false, getToken: async () => null, logout: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const { isSignedIn, getToken } = useClerkAuth();
  const { signOut } = useClerk();

  useEffect(() => {
    setTokenGetter(getToken);
    if (isSignedIn) {
      getToken().then(token => token ? api.post('/auth/sync', undefined, { headers: { Authorization: `Bearer ${token}` } }) : null).catch(() => {});
    }
    return () => setTokenGetter(null);
  }, [getToken, isSignedIn]);

  const value = useMemo<AuthContextType>(() => ({
    user: user ? { id: user.id, name: user.fullName || user.username || user.primaryEmailAddress?.emailAddress || 'Member', email: user.primaryEmailAddress?.emailAddress || '', avatar: user.imageUrl } : null,
    isLoading: !isLoaded,
    isAuthenticated: !!isSignedIn,
    getToken: async () => (await getToken()) || null,
    logout: () => signOut({ redirectUrl: '/login' }),
  }), [getToken, isLoaded, isSignedIn, signOut, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
