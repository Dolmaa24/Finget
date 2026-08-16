import { createContext, useContext } from 'react';
import type { Profile } from '../api';

export interface AuthContextType {
  token: string | null;
  user: Profile | null;
  loadingUser: boolean;
  signIn: (token: string, user?: Profile) => void;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const TOKEN_KEY = 'finget_token';
