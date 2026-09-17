import { useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { AuthContext } from './auth-context';

type RoleRequirement = 'admin-app' | 'admin' | 'member' | 'evaluator' | 'any';

type RoleSource = string | string[] | undefined;

function readUserRoles(user: User | null): string[] {
  const meta = (user?.app_metadata ?? {}) as Record<string, unknown>;
  const candidates: RoleSource[] = [
    meta.role as RoleSource,
    meta.roles as RoleSource,
    meta.user_roles as RoleSource,
  ];
  const roles = new Set<string>();

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const cleaned = candidate.trim().toLowerCase();
      if (cleaned) roles.add(cleaned);
      continue;
    }

    if (Array.isArray(candidate)) {
      candidate.forEach((entry) => {
        if (typeof entry === 'string') {
          const cleaned = entry.trim().toLowerCase();
          if (cleaned) roles.add(cleaned);
        }
      });
    }
  }

  return Array.from(roles);
}

function matchesRequiredRole(roles: string[], requiredRole: RoleRequirement): boolean {
  if (requiredRole === 'any') return true;
  if (requiredRole === 'admin-app') return roles.includes('admin') || roles.includes('open_mic_admin') || roles.includes('event_admin');
  if (requiredRole === 'admin') return roles.includes('admin');
  if (requiredRole === 'member') return roles.includes('member') || roles.includes('evaluator');
  if (requiredRole === 'evaluator') return roles.includes('evaluator') || roles.includes('admin');
  return true;
}

function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email atau password salah.';
  if (m.includes('email not confirmed')) return 'Email belum dikonfirmasi.';
  if (m.includes('database error')) return 'Sistem sedang mengalami gangguan. Silakan coba lagi.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Terlalu banyak percobaan. Coba lagi nanti.';
  if (m.includes('network') || m.includes('fetch')) return 'Tidak dapat terhubung ke server. Periksa koneksi Anda.';
  return 'Tidak dapat masuk. Silakan coba lagi.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let sessionResolved = false;
    const sessionTimeout = window.setTimeout(() => {
      if (sessionResolved) return;
      sessionResolved = true;
      console.error('timed out while restoring auth session');
      setSession(null);
      setLoading(false);
    }, 3000);

    supabase.auth.getSession()
      .then(({ data }) => {
        if (sessionResolved) return;
        sessionResolved = true;
        setSession(data.session);
        setLoading(false);
        window.clearTimeout(sessionTimeout);
      })
      .catch((error) => {
        console.error('failed to restore auth session', error);
        setLoading(false);
      })
      .finally(() => {
        if (sessionResolved) return;
        sessionResolved = true;
        window.clearTimeout(sessionTimeout);
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      (async () => { setSession(sess); })();
    });

    const refreshRoleSession = () => {
      if (document.visibilityState === 'visible') {
        void supabase.auth.getSession()
          .then(({ data }) => data.session ? supabase.auth.refreshSession() : null)
          .catch((error) => console.error('failed to refresh auth session', error));
      }
    };
    const refreshInterval = window.setInterval(refreshRoleSession, 30000);
    document.addEventListener('visibilitychange', refreshRoleSession);
    window.addEventListener('focus', refreshRoleSession);

    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(sessionTimeout);
      window.clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', refreshRoleSession);
      window.removeEventListener('focus', refreshRoleSession);
    };
  }, []);

  const user = session?.user ?? null;
  const roles = readUserRoles(user);
  const isAdmin = roles.includes('admin');
  const isOpenMicAdmin = roles.includes('open_mic_admin');
  const isEventAdmin = roles.includes('event_admin');
  const isAdminApp = isAdmin || isOpenMicAdmin || isEventAdmin;
  const isEvaluator = roles.includes('evaluator');
  const isMember = roles.includes('member') || isEvaluator || isAdmin;
  const isAuthenticated = Boolean(session);

  const signIn = async (email: string, password: string, options: { requireRole?: RoleRequirement } = {}) => {
    const requiredRole = options.requireRole ?? 'any';
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('sign-in failed', error.message);
      return { error: mapAuthError(error.message) };
    }

    const nextRoles = readUserRoles(data.user);
    if (!matchesRequiredRole(nextRoles, requiredRole)) {
      await supabase.auth.signOut();
      if (requiredRole === 'admin') {
        return { error: 'Login berhasil, tetapi akun ini belum memiliki akses admin. Hubungi administrator.' };
      }
      if (requiredRole === 'admin-app') {
        return { error: 'Akun Member tidak dapat masuk ke halaman Admin. Gunakan halaman Login Member.' };
      }
      if (requiredRole === 'member') {
        return { error: 'Akun Admin tidak dapat masuk ke halaman Member. Gunakan halaman Login Admin.' };
      }
      if (requiredRole === 'evaluator') {
        return { error: 'Login berhasil, tetapi akun ini belum memiliki akses evaluator. Hubungi administrator.' };
      }
      return { error: 'Login berhasil, tetapi akun ini tidak memiliki izin akses yang cukup.' };
    }

    setSession(data.session);
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, roles, isAdmin, isAdminApp, isOpenMicAdmin, isEventAdmin, isMember, isEvaluator, isAuthenticated, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

