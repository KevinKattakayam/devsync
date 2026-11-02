'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { setTokenGetter } from '../src/lib/api';
import type { User } from '../src/types';

const identity = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  avatar: z.string().nullish(),
});
const token = z.object({ token: z.string() });
const origin = 'http://127.0.0.1:5501';
const getToken: (options?: { skipCache?: boolean }) => Promise<string | null> = async () => {
  const response = await fetch(`${origin}/__test/token`, { credentials: 'include' });
  return response.ok ? token.parse(await response.json()).token : null;
};
const AuthContext = createContext({
  user: null as User | null,
  isLoading: true,
  isAuthenticated: false,
  getToken,
  logout: async () => {},
});
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setLoading] = useState(true);
  useEffect(() => {
    let disposed = false;
    setTokenGetter(getToken);
    void fetch(`${origin}/__test/me`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return;
        const value = identity.parse(await response.json());
        if (!disposed) setUser({ ...value, avatar: value.avatar || undefined });
      })
      .catch(() => {})
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      setTokenGetter(null);
    };
  }, []);
  const logout = useCallback(async () => {
    const response = await fetch(`${origin}/__test/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Fixture logout failed');
    setTokenGetter(null);
    setUser(null);
    router.push('/login');
  }, [router]);
  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, getToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
