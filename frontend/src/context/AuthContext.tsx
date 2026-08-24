import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import type { Role, User } from '../types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string; role: Role; ngoId?: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Intentionally NOT persisted to localStorage/sessionStorage: a refresh logs
// the user out. Per the Technical Architecture doc, that's a deliberate
// hackathon-scope trade — no XSS-token-theft surface, no persistence needed
// for a live demo.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const result = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password });
      setToken(result.token);
      setUser(result.user);
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(
    async (input: { name: string; email: string; password: string; role: Role; ngoId?: string }) => {
      setLoading(true);
      try {
        const result = await api.post<{ token: string; user: User }>('/api/auth/register', input);
        setToken(result.token);
        setUser(result.user);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
  }, []);

  const value = useMemo(() => ({ user, token, loading, login, register, logout }), [user, token, loading, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ApiError };
