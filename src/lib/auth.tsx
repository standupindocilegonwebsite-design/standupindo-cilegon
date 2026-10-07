import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { AuthContext } from './auth-context';

type RoleRequirement = 'admin-app' | 'admin' | 'member' | 'evaluator' | 'ticket-admin' | 'qr-scanner' | 'any';

type RoleSource = string | string[] | undefined;
type AccountDeviceSession = {
  device_id: string;
  device_label: string;
};
type PendingDeviceSwitch = {
  session: Session;
  deviceLabel: string;
};

const DEVICE_ID_STORAGE_KEY = 'standupindo-account-device-id';

function getAccountDevice() {
  let deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  }

  const agent = navigator.userAgent;
  const platform = /android/i.test(agent) ? 'Android'
    : /iphone|ipad|ipod/i.test(agent) ? 'iPhone/iPad'
      : /windows/i.test(agent) ? 'Windows'
        : /macintosh|mac os/i.test(agent) ? 'Mac'
          : /linux/i.test(agent) ? 'Linux' : 'Perangkat';
  const browser = /edg\//i.test(agent) ? 'Edge'
    : /firefox\//i.test(agent) ? 'Firefox'
      : /chrome\//i.test(agent) ? 'Chrome'
        : /safari\//i.test(agent) ? 'Safari' : 'Browser';

  return { id: deviceId, label: `${platform} · ${browser}` };
}

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
  if (requiredRole === 'admin-app') return roles.includes('admin') || roles.includes('open_mic_admin') || roles.includes('event_admin') || roles.includes('admin_ticket') || roles.includes('admin_qr');
  if (requiredRole === 'admin') return roles.includes('admin');
  if (requiredRole === 'member') return roles.includes('member') || roles.includes('evaluator');
  if (requiredRole === 'evaluator') return roles.includes('evaluator') || roles.includes('admin');
  if (requiredRole === 'ticket-admin') return roles.includes('admin_ticket') || roles.includes('admin');
  if (requiredRole === 'qr-scanner') return roles.includes('admin_qr') || roles.includes('admin');
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
  const [authFlowPending, setAuthFlowPending] = useState(false);
  const [pendingDeviceSwitch, setPendingDeviceSwitch] = useState<PendingDeviceSwitch | null>(null);
  const [sessionNotice, setSessionNotice] = useState('');
  const handledSessionRef = useRef<string | null>(null);
  const signingOutRef = useRef(false);

  useEffect(() => {
    let sessionResolved = false;
    const sessionTimeout = window.setTimeout(() => {
      if (sessionResolved) return;
      sessionResolved = true;
      console.error('timed out while restoring auth session');
      setLoading(false);
    }, 10000);

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
      setSession(sess);
      setLoading(false);
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
  const isTicketAdmin = roles.includes('admin_ticket');
  const isQrScanner = roles.includes('admin_qr');
  const isAdminApp = isAdmin || isOpenMicAdmin || isEventAdmin || isTicketAdmin || isQrScanner;
  const isEvaluator = roles.includes('evaluator');
  const isMember = roles.includes('member') || isEvaluator || isAdmin;
  const isAuthenticated = Boolean(session);

  useEffect(() => {
    if (!session || authFlowPending || pendingDeviceSwitch || signingOutRef.current) return;
    if (handledSessionRef.current === session.user.id) return;

    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let activeDeviceInterval: number | null = null;
    let refreshActiveDevice: (() => void) | null = null;

    const endMovedSession = async () => {
      if (!active || signingOutRef.current) return;
      signingOutRef.current = true;
      setSessionNotice('Sesi akun ini dipindahkan ke perangkat lain. Silakan masuk kembali jika masih ingin menggunakan akun.');
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) console.error('failed to end a session moved to another device', error);
      setSession(null);
      signingOutRef.current = false;
    };

    const checkActiveDevice = async (deviceId: string) => {
      const { data: activeDevice, error } = await supabase.from('account_active_sessions')
        .select('device_id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!active || error) {
        if (error) console.error('failed to verify the active account device', error);
        return;
      }
      if (activeDevice && activeDevice.device_id !== deviceId) await endMovedSession();
    };

    void (async () => {
      let device: ReturnType<typeof getAccountDevice>;
      try {
        device = getAccountDevice();
      } catch (error) {
        console.error('failed to identify this account device', error);
        setSessionNotice('Informasi perangkat gagal dibaca. Silakan masuk kembali.');
        await supabase.auth.signOut({ scope: 'local' });
        setSession(null);
        return;
      }

      channel = supabase.channel(`account-active-session-${session.user.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'account_active_sessions',
          filter: `user_id=eq.${session.user.id}`,
        }, (payload) => {
          if (payload.eventType === 'DELETE') return;
          const row = payload.new as AccountDeviceSession;
          if (row.device_id && row.device_id !== device.id) void endMovedSession();
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void checkActiveDevice(device.id);
        });

      const { data: activeDevice, error: lookupError } = await supabase.from('account_active_sessions')
        .select('device_id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!active) return;
      if (lookupError) {
        console.error('failed to verify the active account device', lookupError);
        setSessionNotice('Status perangkat akun gagal diverifikasi. Silakan masuk kembali.');
        await supabase.auth.signOut({ scope: 'local' });
        setSession(null);
        return;
      }
      if (activeDevice && activeDevice.device_id !== device.id) {
        await endMovedSession();
        return;
      }
      if (!activeDevice) {
        const { error: registerError } = await supabase.from('account_active_sessions').upsert({
          user_id: session.user.id,
          device_id: device.id,
          device_label: device.label,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (registerError) {
          console.error('failed to register the active account device', registerError);
          setSessionNotice('Sesi perangkat gagal didaftarkan. Silakan masuk kembali.');
          await supabase.auth.signOut({ scope: 'local' });
          setSession(null);
          return;
        }
      }
      if (active) handledSessionRef.current = session.user.id;

      refreshActiveDevice = () => {
        if (document.visibilityState === 'visible') void checkActiveDevice(device.id);
      };
      activeDeviceInterval = window.setInterval(() => void checkActiveDevice(device.id), 30000);
      window.addEventListener('focus', refreshActiveDevice);
      document.addEventListener('visibilitychange', refreshActiveDevice);
    })();

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
      if (activeDeviceInterval !== null) window.clearInterval(activeDeviceInterval);
      if (refreshActiveDevice) {
        window.removeEventListener('focus', refreshActiveDevice);
        document.removeEventListener('visibilitychange', refreshActiveDevice);
      }
      if (handledSessionRef.current === session.user.id) handledSessionRef.current = null;
    };
  }, [authFlowPending, pendingDeviceSwitch, session]);

  const signIn = async (email: string, password: string, options: { requireRole?: RoleRequirement } = {}) => {
    const requiredRole = options.requireRole ?? 'any';
    setAuthFlowPending(true);
    setSessionNotice('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('sign-in failed', error.message);
        return { error: mapAuthError(error.message) };
      }

      const nextRoles = readUserRoles(data.user);
      if (!matchesRequiredRole(nextRoles, requiredRole)) {
        await supabase.auth.signOut({ scope: 'local' });
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
        if (requiredRole === 'ticket-admin') {
          return { error: 'Akun ini belum memiliki akses Admin Tiket.' };
        }
        if (requiredRole === 'qr-scanner') {
          return { error: 'Akun ini belum memiliki akses Admin QR Scanner.' };
        }
        return { error: 'Login berhasil, tetapi akun ini tidak memiliki izin akses yang cukup.' };
      }

      let device: ReturnType<typeof getAccountDevice>;
      try {
        device = getAccountDevice();
      } catch (deviceError) {
        console.error('failed to identify this account device', deviceError);
        await supabase.auth.signOut({ scope: 'local' });
        return { error: 'Informasi perangkat gagal dibaca. Silakan coba lagi.' };
      }

      const { data: activeDevice, error: lookupError } = await supabase.from('account_active_sessions')
        .select('device_id, device_label')
        .eq('user_id', data.user.id)
        .maybeSingle();
      if (lookupError) {
        console.error('failed to verify the active account device', lookupError);
        await supabase.auth.signOut({ scope: 'local' });
        return { error: 'Status perangkat akun gagal diverifikasi. Silakan coba lagi.' };
      }

      if (activeDevice && activeDevice.device_id !== device.id) {
        setPendingDeviceSwitch({ session: data.session, deviceLabel: activeDevice.device_label });
        setSession(data.session);
        return { error: null, requiresDeviceConfirmation: true, activeDeviceLabel: activeDevice.device_label };
      }

      if (!activeDevice) {
        const { error: registerError } = await supabase.from('account_active_sessions').upsert({
          user_id: data.user.id,
          device_id: device.id,
          device_label: device.label,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (registerError) {
          console.error('failed to register the active account device', registerError);
          await supabase.auth.signOut({ scope: 'local' });
          return { error: 'Sesi perangkat gagal didaftarkan. Silakan coba lagi.' };
        }
      }

      setSession(data.session);
      return { error: null };
    } finally {
      setAuthFlowPending(false);
    }
  };

  const confirmDeviceSwitch = async () => {
    if (!pendingDeviceSwitch) return { error: 'Tidak ada permintaan pindah perangkat yang menunggu konfirmasi.' };

    setAuthFlowPending(true);
    try {
      const { error: revokeError } = await supabase.auth.signOut({ scope: 'others' });
      if (revokeError) {
        console.error('failed to revoke other account sessions', revokeError);
        return { error: 'Sesi perangkat lama gagal dihentikan. Silakan coba lagi.' };
      }

      let device: ReturnType<typeof getAccountDevice>;
      try {
        device = getAccountDevice();
      } catch (deviceError) {
        console.error('failed to identify this account device', deviceError);
        return { error: 'Informasi perangkat gagal dibaca. Silakan coba lagi.' };
      }

      const { error: registerError } = await supabase.from('account_active_sessions').upsert({
        user_id: pendingDeviceSwitch.session.user.id,
        device_id: device.id,
        device_label: device.label,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (registerError) {
        console.error('failed to transfer the active account device', registerError);
        return { error: 'Perangkat baru gagal diaktifkan. Sesi lama mungkin sudah keluar; silakan coba masuk kembali.' };
      }

      handledSessionRef.current = null;
      setSession(pendingDeviceSwitch.session);
      setPendingDeviceSwitch(null);
      setSessionNotice('');
      return { error: null };
    } finally {
      setAuthFlowPending(false);
    }
  };

  const cancelDeviceSwitch = async () => {
    setAuthFlowPending(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) console.error('failed to cancel pending device login', error);
      setSession(null);
      setPendingDeviceSwitch(null);
    } finally {
      setAuthFlowPending(false);
    }
  };

  const signOut = async () => {
    if (session) {
      try {
        const device = getAccountDevice();
        const { error } = await supabase.from('account_active_sessions').delete()
          .eq('user_id', session.user.id).eq('device_id', device.id);
        if (error) console.error('failed to clear the active account device', error);
      } catch (error) {
        console.error('failed to identify the active account device during sign-out', error);
      }
    }
    await supabase.auth.signOut();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{
      session,
      user,
      loading,
      roles,
      isAdmin,
      isAdminApp,
      isOpenMicAdmin,
      isEventAdmin,
      isTicketAdmin,
      isQrScanner,
      isMember,
      isEvaluator,
      isAuthenticated,
      deviceSwitchPending: Boolean(pendingDeviceSwitch),
      sessionNotice,
      clearSessionNotice: () => setSessionNotice(''),
      confirmDeviceSwitch,
      cancelDeviceSwitch,
      signIn,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
