import { useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { AuthContext } from './auth-context';

type AdminRole = string | null;

function readAdminRole(user: User | null): AdminRole {
  const meta = user?.app_metadata as Record<string, unknown> | undefined;
  if (meta && typeof meta.role === 'string') return meta.role;
  return null;
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
    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session))
      .catch((error) => console.error('failed to restore auth session', error))
      .finally(() => setLoading(false));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      (async () => { setSession(sess); })();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const user = session?.user ?? null;
  const adminRole = readAdminRole(user);
  const isAdmin = adminRole === 'admin';

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('admin sign-in failed', error.message);
      return { error: mapAuthError(error.message) };
    }
    if (readAdminRole(data.user) !== 'admin') {
      await supabase.auth.signOut();
      return { error: 'Login berhasil, tetapi akun ini belum memiliki akses admin. Hubungi administrator.' };
    }
    setSession(data.session);
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, isAdmin, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

