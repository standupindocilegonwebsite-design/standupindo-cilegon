import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  roles: string[];
  isAdmin: boolean;
  isAdminApp: boolean;
  isOpenMicAdmin: boolean;
  isEventAdmin: boolean;
  isMember: boolean;
  isEvaluator: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string, options?: { requireRole?: 'admin' | 'member' | 'evaluator' | 'any' }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
