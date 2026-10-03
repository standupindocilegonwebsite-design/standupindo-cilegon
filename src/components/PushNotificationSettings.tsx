import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCircle2, LoaderCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type PushState = 'loading' | 'unsupported' | 'not-installed' | 'permission-denied' | 'not-enabled' | 'enabled';
type PushSubscriptionResponse = { public_key?: string; error?: string };
const DEVICE_TOKEN_KEY = 'standupindo-push-device-token';

type PushAppIdentity = 'public' | 'admin' | 'member';

function getPushAppIdentity(): PushAppIdentity {
  if (window.location.pathname.startsWith('/admin')) return 'admin';
  if (window.location.pathname.startsWith('/member') || window.location.pathname.startsWith('/evaluator')) return 'member';
  return 'public';
}

function getPushScope(identity: PushAppIdentity) {
  return identity === 'admin' ? '/admin/' : identity === 'member' ? '/member/' : '/';
}

async function getPushRegistration() {
  const identity = getPushAppIdentity();
  const scope = getPushScope(identity);
  const registrations = await navigator.serviceWorker.getRegistrations();
  const registration = registrations.find((candidate) => new URL(candidate.scope).pathname === scope);
  if (registration) return registration;
  return navigator.serviceWorker.register('/sw.js', { scope });
}

async function waitForPushWorker(registration: ServiceWorkerRegistration) {
  if (registration.active) return;
  const worker = registration.installing ?? registration.waiting;
  if (!worker) throw new Error('Service Worker not available for this PWA.');
  await new Promise<void>((resolve, reject) => {
    const onStateChange = () => {
      if (worker.state === 'activated') {
        worker.removeEventListener('statechange', onStateChange);
        resolve();
      } else if (worker.state === 'redundant') {
        worker.removeEventListener('statechange', onStateChange);
        reject(new Error('Service Worker failed to activate for this PWA.'));
      }
    };
    worker.addEventListener('statechange', onStateChange);
    onStateChange();
  });
}

function isIosDevice(): boolean {
  const platform = navigator.platform;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

function getUnsupportedReason(): string | null {
  if (!window.isSecureContext) return 'Notifikasi hanya dapat diaktifkan melalui koneksi HTTPS.';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'Browser ini belum mendukung Web Push. Coba gunakan Safari terbaru di iPhone/iPad atau Chrome di Android.';
  }
  return null;
}

function decodeVapidKey(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function sameKey(first: ArrayBuffer | null, second: Uint8Array): boolean {
  if (!first) return false;
  const bytes = new Uint8Array(first);
  return bytes.length === second.length && bytes.every((value, index) => value === second[index]);
}

function getDeviceToken(): string {
  const stored = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (stored) return stored;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(DEVICE_TOKEN_KEY, token);
  return token;
}

export function PushNotificationSettings() {
  const [status, setStatus] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const unsupportedReason = getUnsupportedReason();
    if (unsupportedReason) {
      setStatus('unsupported');
      return;
    }
    if (isIosDevice() && !isStandalone()) {
      setStatus('not-installed');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('permission-denied');
      return;
    }
    const registration = await getPushRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    setStatus(subscription ? 'enabled' : 'not-enabled');
  }, []);

  useEffect(() => {
    void refreshStatus().catch((error) => {
      console.error('failed to check web push status', error);
      setStatus('unsupported');
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshStatus().catch((error) => console.error('failed to refresh web push status', error));
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshStatus]);

  async function invokePushAction(action: 'public_key' | 'upsert' | 'delete', payload: Record<string, unknown> = {}) {
    const guestToken = getDeviceToken();
    const { data, error } = await supabase.functions.invoke<PushSubscriptionResponse>('manage-push-subscription', {
      body: { action, app_identity: getPushAppIdentity(), guest_token: guestToken, ...payload },
    });
    if (error) throw new Error(error.message || 'Permintaan notifikasi gagal.');
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function enableNotifications() {
    setBusy(true);
    setMessage(null);
    try {
      const unsupportedReason = getUnsupportedReason();
      if (unsupportedReason) throw new Error(unsupportedReason);
      if (isIosDevice() && !isStandalone()) {
        setStatus('not-installed');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'permission-denied' : 'not-enabled');
        throw new Error(permission === 'denied'
          ? 'Izin ditolak. Ubah izin notifikasi untuk situs ini melalui pengaturan browser/perangkat.'
          : 'Izin notifikasi belum diberikan.');
      }

      const registration = await getPushRegistration();
      await waitForPushWorker(registration);
      const keyResponse = await invokePushAction('public_key');
      if (!keyResponse?.public_key) throw new Error('Kunci publik Web Push belum dikonfigurasi di server.');
      const applicationServerKey = decodeVapidKey(keyResponse.public_key);
      let subscription = await registration.pushManager.getSubscription();

      if (subscription && !sameKey(subscription.options.applicationServerKey, applicationServerKey)) {
        await invokePushAction('delete', { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      try {
        await invokePushAction('upsert', { subscription: subscription.toJSON() });
      } catch (error) {
        try {
          await subscription.unsubscribe();
        } catch (cleanupError) {
          console.error('failed to clean up unregistered browser push subscription', cleanupError);
        }
        throw error;
      }

      setStatus('enabled');
      setMessage(null);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Notifikasi gagal diaktifkan.';
      setMessage(text);
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  }

  const iosInstallHint = status === 'not-installed';
  const statusText = status === 'enabled' ? 'Aktif' : status === 'loading' ? 'Memeriksa...' : 'Belum aktif';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="push-notification-heading">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${status === 'enabled' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
          {status === 'enabled' ? <CheckCircle2 className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="push-notification-heading" className="text-base font-extrabold text-slate-900">Notifikasi</h2>
          <p className="mt-0.5 text-sm font-semibold text-slate-700">{statusText}</p>
        </div>
      </div>

      {iosInstallHint && (
        <p className="mt-3 text-xs leading-5 text-slate-500">Tambahkan ke Layar Utama, lalu buka situs dari ikon tersebut untuk mengaktifkan notifikasi.</p>
      )}
      {status === 'permission-denied' && (
        <p className="mt-3 text-xs leading-5 text-slate-500">Izinkan notifikasi untuk situs ini di pengaturan browser.</p>
      )}
      {status === 'unsupported' && (
        <p className="mt-3 text-xs leading-5 text-slate-500">{getUnsupportedReason()}</p>
      )}

      {status !== 'enabled' && (
        <button
          type="button"
          disabled={busy || status === 'loading' || status === 'unsupported' || status === 'not-installed' || status === 'permission-denied'}
          onClick={() => void enableNotifications()}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
          Aktifkan Notifikasi
        </button>
      )}

      {message && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700">
          {message}
        </p>
      )}
    </section>
  );
}
