import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Instagram } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { SiteSettings } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { LOGO_URL } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';

const STORAGE_KEY = 'standupindo_follow_instagram_popup_v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 30 * DAY_MS;
const MAX_SHOWS = 3;

interface FollowPopupRecord {
  shownAt: number[];
  lastShownAt: number | null;
  lastAction: 'shown' | 'dismissed' | 'followed' | null;
  cooldownUntil: number;
}

const EMPTY_RECORD: FollowPopupRecord = {
  shownAt: [],
  lastShownAt: null,
  lastAction: null,
  cooldownUntil: 0,
};

function readRecord(): FollowPopupRecord | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...EMPTY_RECORD };
    const parsed = JSON.parse(raw) as Partial<FollowPopupRecord> | null;
    if (!parsed || !Array.isArray(parsed.shownAt)
      || (parsed.lastShownAt !== null && (!Number.isSafeInteger(parsed.lastShownAt) || parsed.lastShownAt < 0))
      || !['shown', 'dismissed', 'followed', null].includes(parsed.lastAction ?? null)
      || !Number.isSafeInteger(parsed.cooldownUntil) || (parsed.cooldownUntil ?? -1) < 0
      || !parsed.shownAt.every((timestamp) => Number.isSafeInteger(timestamp) && timestamp > 0)) return null;
    return {
      shownAt: parsed.shownAt,
      lastShownAt: parsed.lastShownAt ?? null,
      lastAction: parsed.lastAction ?? null,
      cooldownUntil: parsed.cooldownUntil ?? 0,
    };
  } catch {
    return null;
  }
}

function writeRecord(record: FollowPopupRecord): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

function getInstagramUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isTicketOrRegistrationRoute(path: string) {
  return path === '/tiket'
    || /^\/event\/[^/]+\/tiket(?:\/[^/]+)?$/.test(path)
    || /^\/event\/[^/]+\/daftar$/.test(path)
    || /^\/open-mic\/[^/]+\/daftar$/.test(path);
}

export function FollowInstagramPopup({ router, settings }: { router: Router; settings: SiteSettings }) {
  const { session, loading } = useAuth();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const initialPath = useRef(router.path);
  const attempted = useRef(false);
  const instagramUrl = getInstagramUrl(settings.instagram_url);
  const canShowOnRoute = !isTicketOrRegistrationRoute(router.path);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') {
        attempted.current = true;
        return;
      }
      setReady(true);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready || open || attempted.current || loading || session || !instagramUrl
      || !canShowOnRoute || router.path !== initialPath.current
      || document.visibilityState !== 'visible') return;

    let observer: MutationObserver | null = null;
    const stopObserving = () => {
      observer?.disconnect();
      observer = null;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        attempted.current = true;
        stopObserving();
      }
    };
    const attemptToShow = () => {
      if (attempted.current || document.visibilityState !== 'visible'
        || router.path !== initialPath.current || loading || session || !canShowOnRoute) {
        if (attempted.current || router.path !== initialPath.current || !canShowOnRoute) stopObserving();
        return;
      }

      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        if (!observer) {
          observer = new MutationObserver(attemptToShow);
          observer.observe(document.body, { childList: true, subtree: true });
        }
        return;
      }

      attempted.current = true;
      stopObserving();
      const current = readRecord();
      if (!current) return;
      const now = Date.now();
      const recentShows = current.shownAt.filter((timestamp) => timestamp > now - WINDOW_MS && timestamp <= now);
      if (recentShows.length >= MAX_SHOWS || current.cooldownUntil > now
        || (current.lastShownAt !== null && now - current.lastShownAt < DAY_MS)) return;

      const next: FollowPopupRecord = {
        shownAt: [...recentShows, now],
        lastShownAt: now,
        lastAction: 'shown',
        cooldownUntil: now + DAY_MS,
      };
      if (writeRecord(next)) setOpen(true);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    attemptToShow();
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopObserving();
    };
  }, [canShowOnRoute, instagramUrl, loading, open, ready, router.path, session]);

  function closeWithCooldown(action: 'dismissed' | 'followed') {
    const current = readRecord();
    if (current) {
      const now = Date.now();
      writeRecord({
        ...current,
        lastAction: action,
        cooldownUntil: now + (action === 'followed' ? 30 : 7) * DAY_MS,
      });
    }
    setOpen(false);
  }

  if (!instagramUrl) return null;

  return (
    <Modal open={open} onClose={() => closeWithCooldown('dismissed')} ariaLabel="Follow Standupindo Cilegon" panelClassName="!border-blue-300 !bg-gradient-to-br !from-blue-100 !via-blue-50 !to-sky-100" size="sm">
      <div className="flex flex-col items-center px-2 pb-1 pt-1 text-center sm:px-3">
        <div className="mb-3 flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-blue-100 bg-white p-2 shadow-[0_8px_20px_rgba(37,99,235,0.12)]">
          <img src={settings.logo_url ?? LOGO_URL} alt="Logo Standupindo Cilegon" className="h-full w-full object-contain" />
        </div>
        <h2 className="flex flex-col items-center text-base font-black leading-tight tracking-tight text-slate-900 sm:text-lg">
          <span>Follow</span>
          <span className="mt-1 inline-flex items-center gap-1.5">
            <Instagram className="h-4 w-4 text-pink-600" /> Standupindo Cilegon
          </span>
        </h2>
        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => closeWithCooldown('followed')}
          className="mt-4 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-2 text-xs font-extrabold text-white shadow-[0_6px_14px_rgba(37,99,235,0.22)] transition hover:-translate-y-0.5 hover:from-blue-800 hover:to-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <Instagram className="h-4 w-4" /> Follow <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </Modal>
  );
}
