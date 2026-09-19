import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { api, onUnauthorized } from './api';
import type { AdminUser } from './types';

type Session = {
  user: AdminUser | null | undefined; // undefined = still checking
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};
const Context = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null | undefined>(undefined);
  useEffect(() => {
    api<{ user: AdminUser }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
    // An expired session anywhere in the app sends the person to the login form; unsaved
    // editor input stays in React state and is still there after logging back in.
    const unsubscribe = onUnauthorized(() => setUser(null));
    return () => {
      unsubscribe();
    };
  }, []);
  const login = useCallback(async (login: string, password: string) => {
    const r = await api<{ user: AdminUser }>('/auth/login', { body: { login, password } });
    setUser(r.user);
  }, []);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);
  return <Context.Provider value={{ user, login, logout }}>{children}</Context.Provider>;
}

export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error('SessionProvider is missing');
  return value;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const location = useLocation();
  if (user === undefined) return <p className="muted">Проверяем вход…</p>;
  if (!user) return <Navigate to="/login" replace state={{ returnTo: location.pathname }} />;
  return children;
}
