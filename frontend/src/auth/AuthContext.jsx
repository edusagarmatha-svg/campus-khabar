import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, setAccessToken, getAccessToken, refreshAccessToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((accessToken, user) => {
    setAccessToken(accessToken);
    setUser(user || null);
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      let res = await apiFetch('/auth/me');
      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          res = await apiFetch('/auth/me');
        }
      }
      if (res.ok) {
        const data = await res.json();
        applySession(getAccessToken(), data.user);
      } else {
        setAccessToken(null);
        setUser(null);
      }
    } catch {
      setAccessToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [applySession]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (email, password) => {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data?.error?.message || 'Login failed');
      err.status = res.status;
      throw err;
    }
    applySession(data.accessToken, data.user);
    return data.user;
  }, [applySession]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh: bootstrap }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
