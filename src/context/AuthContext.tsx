import React, { createContext, useContext, useState } from 'react';

export interface UserProfile {
  name: string;
  email: string;
  monthlyIncome?: number;
}

interface AuthContextType {
  token: string | null;
  user: UserProfile | null;
  setToken: (token: string | null, userProfile?: UserProfile) => void;
  setUser: (user: UserProfile | null) => void;
  loginWithDemo: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem('finget_token'));
  const [user, setUserState] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('finget_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  const setToken = (newToken: string | null, userProfile?: UserProfile) => {
    setTokenState(newToken);
    if (newToken) {
      localStorage.setItem('finget_token', newToken);
      if (userProfile) {
        setUserState(userProfile);
        localStorage.setItem('finget_user', JSON.stringify(userProfile));
      }
    } else {
      localStorage.removeItem('finget_token');
      localStorage.removeItem('finget_user');
      setUserState(null);
    }
  };

  const setUser = (userProfile: UserProfile | null) => {
    setUserState(userProfile);
    if (userProfile) {
      localStorage.setItem('finget_user', JSON.stringify(userProfile));
    } else {
      localStorage.removeItem('finget_user');
    }
  };

  const loginWithDemo = () => {
    const demoToken = 'demo-jwt-token-' + Date.now();
    const demoUser: UserProfile = {
      name: 'Dolmaa Demo',
      email: 'demo@finget.ai',
      monthlyIncome: 85000,
    };
    setToken(demoToken, demoUser);
  };

  const logout = () => {
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, setToken, setUser, loginWithDemo, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

