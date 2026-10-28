import { useEffect, useRef } from 'react';
import type { Router } from '@/lib/router';
import { DesktopNavbar } from './nav/DesktopNavbar';
import { MobileBottomNav } from './nav/MobileBottomNav';
import type { SiteSettings } from '@/lib/types';
import { Instagram, Youtube, MapPin, MessageCircle } from 'lucide-react';
import { waLink } from '@/lib/format';
import { AppCredit } from './AppCredit';
import { FollowInstagramPopup } from './FollowInstagramPopup';
import { UpcomingEventPopup } from './UpcomingEventPopup';

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.3 0 .59.04.86.13V9.4a6.33 6.33 0 0 0-.86-.06A6.34 6.34 0 0 0 3.14 15.7a6.34 6.34 0 0 0 11.94-3V8.4a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-.26-.83z" />
    </svg>
  );
}

interface AppShellProps {
  router: Router;
  settings: SiteSettings;
  children: React.ReactNode;
}

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/open-mic', label: 'Open Mic' },
  { to: '/event', label: 'Event' },
  { to: '/komika', label: 'Komika' },
  { to: '/more', label: 'More' },
];

export function AppShell({ router, settings, children }: AppShellProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const year = new Date().getFullYear();
  const isTicketAccessPage = router.path === '/tiket';
  const isEventDocumentationPage = /^\/event\/[^/]+\/dokumentasi$/.test(router.path);
  const isPublicMainPage = ['/', '/open-mic', '/event', '/komika', '/more'].includes(router.path);
  const isPublicDetailPage = /^\/(open-mic|event|komika)\/[^/]+$/.test(router.path);
  const isPublicNavyPage = isPublicMainPage || isPublicDetailPage;

  useEffect(() => {
    const root = shellRef.current;
    if (!root) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let observer: IntersectionObserver | null = null;

    if (!reducedMotion && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer?.unobserve(entry.target);
        });
      }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
    }

    const scanTargets = () => {
      const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-scroll-reveal]'));
      targets.forEach((target) => {
        if (reducedMotion || !observer) {
          target.classList.add('is-visible');
        } else if (!target.classList.contains('is-visible')) {
          observer.observe(target);
        }
      });
    };

    scanTargets();
    const mutations = new MutationObserver(scanTargets);
    mutations.observe(root, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer?.disconnect();
    };
  }, [router.path]);

  return (
    <div ref={shellRef} className={`flex min-h-screen flex-col ${isTicketAccessPage ? 'bg-slate-200' : isEventDocumentationPage ? 'bg-[#030712]' : isPublicNavyPage ? 'bg-[#0B1F44]' : 'bg-slate-50'}`}>
      {!isTicketAccessPage && !isEventDocumentationPage && <DesktopNavbar router={router} settings={settings} />}

      <main className={`flex-1 ${isPublicNavyPage ? 'text-slate-100' : ''}`}>{children}</main>

      {/* Footer (desktop + mobile compact) */}
      {!isTicketAccessPage && !isEventDocumentationPage && <footer className="border-t border-slate-200 bg-white pb-safe-nav md:pb-0">
        <div className="container-app pb-0 pt-6 md:py-6">
          <div className="grid gap-5 md:grid-cols-4 md:gap-6">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5">
                <span className="relative flex shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-0.5 shadow-[0_5px_14px_rgba(29,94,219,0.1)]">
                  <span className="site-brand-logo-light-leak relative isolate block h-12 w-auto overflow-hidden rounded-md sm:h-14">
                    <img src={settings.logo_url ?? '/assets/images/Logo%20Standupindo%20Cilegon%20Biru.png'} alt={settings.site_name} width={640} height={859} className="block h-full w-auto rounded-md object-contain" />
                  </span>
                </span>
                <span className="flex flex-col text-sm font-extrabold leading-tight tracking-tight text-slate-900">
                  <span>{settings.site_short_name.replace(/\s+CILEGON$/i, '')}</span>
                  <span className="text-blue-600">CILEGON</span>
                </span>
              </div>
              <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-700">Menjadi ruang bertemunya komika, penikmat komedi, dan insan kreatif untuk berbagi tawa, mengembangkan potensi, serta membangun ekosistem stand up comedy di Cilegon.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {settings.instagram_url && (
                  <a href={settings.instagram_url} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-blue-600 hover:text-white">
                    <Instagram className="h-4 w-4" />
                  </a>
                )}
                {settings.tiktok_url && (
                  <a href={settings.tiktok_url} target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-blue-600 hover:text-white">
                    <TikTokIcon className="h-4 w-4" />
                  </a>
                )}
                {settings.youtube_url && (
                  <a href={settings.youtube_url} target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-blue-600 hover:text-white">
                    <Youtube className="h-4 w-4" />
                  </a>
                )}
                <a href={waLink(settings.whatsapp_admin)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-blue-600 hover:text-white">
                  <MessageCircle className="h-4 w-4" />
                </a>
                {settings.affiliation_name && settings.affiliation_website && settings.affiliation_logo_url && (
                  <div className="ml-2 flex items-center gap-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Bagian Dari</span>
                    <a href={settings.affiliation_website} target="_blank" rel="noopener noreferrer" aria-label={`Kunjungi ${settings.affiliation_name}`} className="flex h-14 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 transition hover:border-blue-100 hover:bg-white hover:shadow-sm">
                      <img src={settings.affiliation_logo_url} alt={settings.affiliation_name} width={settings.affiliation_logo_url === '/assets/images/image.png' ? 440 : undefined} height={settings.affiliation_logo_url === '/assets/images/image.png' ? 293 : undefined} loading="lazy" className="h-11 w-auto max-w-[220px] object-contain" />
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Navigasi</h4>
              <ul className="mt-2 space-y-1">
                {NAV.map((n) => (
                  <li key={n.to}>
                    <button onClick={() => router.navigate(n.to)} className="text-sm text-slate-600 transition hover:text-blue-700">
                      {n.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Kontak</h4>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span>{settings.address}</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-3 text-center text-xs text-slate-400">
            &copy; {year} {settings.site_name}.
          </div>
          <AppCredit className="mt-2" />
        </div>
      </footer>}

      {!isTicketAccessPage && !isEventDocumentationPage && <MobileBottomNav router={router} />}
      {!isEventDocumentationPage && <UpcomingEventPopup router={router} />}
      {!isEventDocumentationPage && <FollowInstagramPopup router={router} settings={settings} />}
    </div>
  );
}
