import { Home, Mic, CalendarDays, Drama, CircleHelp, Menu, Store } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { SiteSettings } from '@/lib/types';
import { getPublicMerchConfig } from '@/lib/merch';

const LINKS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/open-mic', label: 'Open Mic', icon: Mic },
  { to: '/event', label: 'Event', icon: CalendarDays },
  { to: '/komika', label: 'Komika', icon: Drama },
  { to: '/more', label: 'More', icon: Menu },
];

export function DesktopNavbar({ router, settings }: { router: Router; settings: SiteSettings }) {
  const isActive = (to: string) =>
    to === '/' ? router.path === '/' : router.path.startsWith(to);
  const isGuideActive = router.path === '/panduan';
  const merchConfig = getPublicMerchConfig(settings);
  const [headerBrandFirst, ...headerBrandRest] = settings.site_short_name.trim().split(/\s+/);
  const headerBrandSecond = headerBrandRest.join(' ');

  return (
    <header className="relative sticky top-0 z-40 overflow-hidden border-b border-blue-900/40 bg-blue-700/95 text-white shadow-[0_4px_20px_rgba(15,23,42,0.16)] backdrop-blur-md before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-sky-300 before:via-white before:to-yellow-300">
      <div className="container-app flex h-16 items-center justify-between md:h-[4.5rem]">
        <button onClick={() => router.navigate('/')} className="group flex min-w-0 items-center gap-2.5 sm:gap-3" aria-label={settings.site_name}>
          <span className="relative flex shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-0.5 shadow-[0_5px_14px_rgba(29,94,219,0.1)] transition-transform duration-200 group-hover:scale-[1.03]">
            <span className="site-brand-logo-light-leak relative isolate block h-12 w-auto overflow-hidden rounded-md sm:h-14">
              <img src={settings.logo_url ?? '/assets/images/Logo%20Standupindo%20Cilegon%20Biru.png'} alt={settings.site_name} width={640} height={859} className="block h-full w-auto rounded-md object-contain" />
            </span>
          </span>
          <span className="site-brand-light-leak-text hidden max-w-[18rem] truncate text-[15px] font-black tracking-[-0.02em] text-white sm:inline sm:text-[15px]" data-light-leak={settings.site_short_name}>{settings.site_short_name}</span>
          <span className="site-brand-light-leak-text flex max-w-[10rem] flex-col truncate text-left text-[13px] font-black leading-tight tracking-[-0.025em] text-white sm:hidden" data-light-leak={settings.site_short_name}>
            <span className="truncate">{headerBrandFirst || settings.site_short_name}</span>
            {headerBrandSecond && <span className="mt-0.5 truncate text-[13px] leading-tight tracking-[-0.025em] text-yellow-300">{headerBrandSecond}</span>}
          </span>
        </button>

        <nav className="hidden items-center gap-1 rounded-2xl border border-white/20 bg-blue-800/50 p-1 md:flex">
          {LINKS.map((l) => (
            <button
              key={l.to}
              onClick={() => router.navigate(l.to)}
              className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200 ${
                isActive(l.to)
                  ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/70'
                  : 'text-blue-50 hover:bg-white/15 hover:text-white'
              }`}
            >
              {l.label}
            </button>
          ))}
        </nav>

        <button onClick={() => router.navigate('/open-mic')} className="btn-primary hidden md:inline-flex !rounded-xl !px-4 !py-2.5">
          <Mic className="h-4 w-4" /> Daftar Open Mic
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {merchConfig && (
            <a
              href={merchConfig.shopUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-merch-store-trigger
              className="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/15 hover:text-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              aria-label={`Buka toko Merch ${settings.site_name}`}
              title={`Toko Merch ${settings.site_name}`}
            >
              <Store className="h-5 w-5" />
            </a>
          )}
          <button
            onClick={() => router.navigate('/panduan')}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${isGuideActive ? 'bg-white text-blue-700 shadow-[0_2px_10px_rgba(15,23,42,0.22)] ring-2 ring-blue-200/80' : 'text-white hover:bg-white/15 hover:text-blue-100'}`}
            aria-label="Panduan dan FAQ"
            title="Panduan dan FAQ"
            aria-current={isGuideActive ? 'page' : undefined}
          >
            <CircleHelp className={`h-6 w-6 transition-transform duration-200 ${isGuideActive ? 'scale-110' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
