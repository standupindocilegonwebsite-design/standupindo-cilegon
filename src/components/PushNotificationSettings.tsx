import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, LoaderCircle, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type PushState = 'loading' | 'unsupported' | 'not-installed' | 'permission-denied' | 'not-enabled' | 'enabled';
type PushSubscriptionResponse = { public_key?: string; error?: string; sent?: number };
const DEVICE_TOKEN_KEY = 'standupindo-push-device-token';

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
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

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
    const registration = await navigator.serviceWorker.getRegistration('/');
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

  async function invokePushAction(action: 'public_key' | 'upsert' | 'delete' | 'test', payload: Record<string, unknown> = {}) {
    const guestToken = getDeviceToken();
    const { data, error } = await supabase.functions.invoke<PushSubscriptionResponse>('manage-push-subscription', {
      body: { action, guest_token: guestToken, ...payload },
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

      const registration = await navigator.serviceWorker.getRegistration('/')
        ?? await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
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
      setMessage({ kind: 'success', text: 'Notifikasi aktif di perangkat ini. Kamu bisa menerima pengumuman Open Mic dan Event terbaru.' });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Notifikasi gagal diaktifkan.';
      setMessage({ kind: 'error', text });
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  }

  async function disableNotifications() {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await invokePushAction('delete', { endpoint: subscription.endpoint });
        const unsubscribed = await subscription.unsubscribe();
        if (!unsubscribed) throw new Error('Subscription terhapus dari server, tetapi browser belum berhasil menonaktifkannya.');
      }
      setStatus('not-enabled');
      setMessage({ kind: 'success', text: 'Notifikasi dinonaktifkan untuk perangkat ini.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Notifikasi gagal dinonaktifkan.' });
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  }

  async function sendTestNotification() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await invokePushAction('test');
      if (!result?.sent) throw new Error('Server belum mengirim notifikasi ke perangkat ini.');
      setMessage({ kind: 'success', text: 'Notifikasi uji dikirim. Jika belum terlihat, periksa izin notifikasi dan pengaturan Focus/Do Not Disturb perangkat.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Notifikasi uji gagal dikirim.' });
    } finally {
      setBusy(false);
    }
  }

  const iosInstallHint = status === 'not-installed';
  const statusText = status === 'enabled'
    ? 'Aktif di perangkat ini'
    : status === 'permission-denied'
      ? 'Izin browser/perangkat ditolak'
      : status === 'not-installed'
        ? 'Tambahkan PWA ke Layar Utama terlebih dahulu'
        : status === 'unsupported'
          ? getUnsupportedReason() ?? 'Web Push tidak tersedia'
          : 'Belum diaktifkan di perangkat ini';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="push-notification-heading">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${status === 'enabled' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
          {status === 'enabled' ? <CheckCircle2 className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="push-notification-heading" className="text-base font-extrabold text-slate-900">Notifikasi Push</h2>
          <p className="mt-0.5 text-sm font-semibold text-slate-700">{statusText}</p>
          <p className="mt-1 text-sm leading-5 text-slate-500">
            Dapatkan pengumuman Open Mic dan Event terbaru langsung di perangkat, tanpa perlu login.
          </p>
        </div>
      </div>

      {iosInstallHint && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-sm leading-5 text-amber-900">
          Di iPhone/iPad, buka situs lewat Safari, tekan Bagikan, lalu pilih <strong>Tambahkan ke Layar Utama</strong>. Buka aplikasi dari ikon tersebut, kemudian aktifkan notifikasi. Memerlukan iOS/iPadOS 16.4 atau lebih baru.
        </p>
      )}
      {status === 'permission-denied' && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-sm leading-5 text-amber-900">
          Ubah izin situs ini menjadi Izinkan pada pengaturan notifikasi browser/perangkat, lalu muat ulang halaman ini.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {status === 'enabled' ? (
          <>
            <button type="button" disabled={busy} onClick={() => void sendTestNotification()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Kirim Notifikasi Uji
            </button>
            <button type="button" disabled={busy} onClick={() => void disableNotifications()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">
              <BellOff className="h-4 w-4" />
              Nonaktifkan
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy || status === 'loading' || status === 'unsupported' || status === 'not-installed' || status === 'permission-denied'}
            onClick={() => void enableNotifications()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Aktifkan Notifikasi
          </button>
        )}
      </div>

      {message && (
        <p role="status" className={`mt-3 rounded-xl px-3.5 py-3 text-sm leading-5 ${message.kind === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
