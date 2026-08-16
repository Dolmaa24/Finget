import React, { useState, useEffect, useCallback } from 'react';
import { authApi, type Profile } from '../api';
import { AuthContext, TOKEN_KEY } from './authStore';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<Profile | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);

  const logout = useCallback(() => {
    setTokenState(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('finget_scope');
  }, []);

  const refreshUser = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    setLoadingUser(true);
    try {
      setUser(await authApi.me());
    } catch {
      // A stale or invalid token should not leave the app in limbo.
      logout();
    } finally {
      setLoadingUser(false);
    }
  }, [logout]);

  const signIn = useCallback((newToken: string, nextUser?: Profile) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setTokenState(newToken);
    if (nextUser) setUser(nextUser);
  }, []);

  useEffect(() => {
    if (token && !user) void refreshUser();
  }, [token, user, refreshUser]);

  return (
    <AuthContext.Provider value={{ token, user, loadingUser, signIn, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
