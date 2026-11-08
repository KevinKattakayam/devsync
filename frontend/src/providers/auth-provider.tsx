'use client';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useState,
  useRef,
} from 'react';
import { useAuth as useClerkAuth, useClerk, useUser } from '@clerk/nextjs';
import api, { setTokenGetter } from '@/lib/api';
import { User } from '@/types';
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  getToken: (options?: { skipCache?: boolean }) => Promise<string | null>;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  getToken: async () => null,
  logout: async () => {},
});
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const { isSignedIn, getToken } = useClerkAuth();
  const { signOut } = useClerk();
  const subject = user?.id;
  const lifecycle = useRef({ subject, mounted: true });
  useEffect(() => {
    lifecycle.current = { subject, mounted: true };
    return () => {
      lifecycle.current = { subject, mounted: false };
    };
  }, [subject]);
  const [attempt, setAttempt] = useState(0);
  const [sync, setSync] = useState<{
    subject: string;
    attempt: number;
    status: 'ready' | 'failed';
  }>();
  const [logoutFailed, setLogoutFailed] = useState(false);
  useEffect(() => {
    setTokenGetter(getToken);
    let disposed = false;
    if (isSignedIn && subject) {
      void getToken({ skipCache: true })
        .then(async (token) => {
          if (!token) throw new Error('Session unavailable');
          await api.post('/auth/sync', undefined, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!disposed) setSync({ subject, attempt, status: 'ready' });
        })
        .catch(() => {
          if (!disposed) setSync({ subject, attempt, status: 'failed' });
        });
    }
    return () => {
      disposed = true;
      setTokenGetter(null);
    };
  }, [getToken, isSignedIn, subject, attempt]);
  const accessToken = useCallback(
    async (options?: { skipCache?: boolean }) => (await getToken(options)) || null,
    [getToken],
  );
  const logout = useCallback(async () => {
    setTokenGetter(null);
    try {
      await signOut({ redirectUrl: '/login' });
    } catch {
      if (lifecycle.current.mounted && lifecycle.current.subject === subject)
        setTokenGetter(getToken);
      throw new Error('Sign-out was not confirmed');
    }
  }, [signOut, getToken, subject]);
  const status = sync?.subject === user?.id && sync?.attempt === attempt ? sync.status : undefined;
  const value = useMemo<AuthContextType>(
    () => ({
      user: user
        ? {
            id: user.id,
            name:
              user.fullName || user.username || user.primaryEmailAddress?.emailAddress || 'Member',
            email: user.primaryEmailAddress?.emailAddress || '',
            avatar: user.imageUrl,
          }
        : null,
      isLoading: !isLoaded || (!!isSignedIn && !status),
      isAuthenticated: !!isSignedIn && status === 'ready',
      getToken: accessToken,
      logout,
    }),
    [accessToken, isLoaded, isSignedIn, logout, status, user],
  );
  return (
    <AuthContext.Provider value={value}>
      {isSignedIn && status !== 'ready' ? (
        <main className="mx-auto max-w-lg space-y-4 p-8">
          <h1 className="text-xl font-semibold">
            {status === 'failed' ? 'Workspace session unavailable' : 'Preparing workspace session'}
          </h1>
          <p role={status === 'failed' ? 'alert' : 'status'}>
            Clerk sign-in must synchronize with DevSync before workspace content is shown. Check
            your connection and device clock, then retry.
          </p>
          {status === 'failed' && (
            <button
              className="rounded-lg border px-4 py-2"
              onClick={() => setAttempt((a) => a + 1)}
            >
              Retry session recovery
            </button>
          )}
          <button
            className="rounded-lg border px-4 py-2"
            onClick={() => {
              void logout().catch(() => setLogoutFailed(true));
            }}
          >
            Sign out
          </button>
          {logoutFailed && (
            <p role="alert">Sign-out was not confirmed. Retry or use Clerk account recovery.</p>
          )}
        </main>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
