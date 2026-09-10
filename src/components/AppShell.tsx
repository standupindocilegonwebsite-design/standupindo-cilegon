import type { Router } from '@/lib/router';
import { DesktopNavbar } from './nav/DesktopNavbar';
import { MobileBottomNav } from './nav/MobileBottomNav';
import type { SiteSettings } from '@/lib/types';
import { Instagram, Youtube, MapPin, MessageCircle } from 'lucide-react';
import { waLink } from '@/lib/format';

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
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <DesktopNavbar router={router} settings={settings} />

      <main className="flex-1 pb-safe-nav md:pb-0">{children}</main>

      {/* Footer (desktop + mobile compact) */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="container-app py-10">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5">
                <img src={settings.logo_url ?? '/assets/images/Standupindo_CIlegon_Logo.jpeg'} alt={settings.site_name} className="h-10 w-10 rounded-lg object-contain ring-1 ring-slate-200" />
                <span className="text-sm font-extrabold tracking-tight text-slate-900">
                  <span>{settings.site_short_name.replace(/\s+CILEGON$/i, '')}</span>{' '}
                  <span className="text-blue-600">CILEGON</span>
                </span>
              </div>
              <p className="mt-3 max-w-md text-sm font-semibold text-slate-700">Satu Panggung, Banyak Cerita.</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
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
                      <img src={settings.affiliation_logo_url} alt={settings.affiliation_name} className="h-11 w-auto max-w-[220px] object-contain" />
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Navigasi</h4>
              <ul className="mt-3 space-y-2">
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
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span>{settings.address}</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-100 pt-5 text-center text-xs text-slate-400">
            &copy; {year} {settings.site_name}. <span className="text-blue-600">Komunitas Stand Up Comedy Cilegon.</span>
          </div>
        </div>
      </footer>

      <MobileBottomNav router={router} />
    </div>
  );
}
