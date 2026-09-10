import { Home, Mic, CalendarDays, Drama, Menu } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { SiteSettings } from '@/lib/types';

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

  return (
    <header className="relative sticky top-0 z-40 overflow-hidden border-b border-slate-200/80 bg-white/90 shadow-[0_4px_20px_rgba(15,23,42,0.04)] backdrop-blur-md before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-blue-700 before:via-sky-400 before:to-yellow-400">
      <div className="container-app flex h-16 items-center justify-between md:h-[4.5rem]">
        <button onClick={() => router.navigate('/')} className="group flex min-w-0 items-center gap-2.5 sm:gap-3" aria-label={settings.site_name}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white shadow-[0_5px_14px_rgba(29,94,219,0.1)] transition-transform duration-200 group-hover:scale-[1.03] sm:h-10 sm:w-10">
            <img src={settings.logo_url ?? '/assets/images/Standupindo_CIlegon_Logo.jpeg'} alt={settings.site_name} className="h-7 w-7 rounded-lg object-contain sm:h-8 sm:w-8" />
          </span>
          <span className="hidden text-[15px] font-black tracking-[-0.02em] text-slate-900 sm:inline sm:text-[15px]">
            <span>{settings.site_short_name.replace(/\s+CILEGON$/i, '')}</span>{' '}
            <span className="text-blue-600">CILEGON</span>
          </span>
          <span className="flex flex-col text-left text-[14px] font-black leading-[0.95] tracking-[-0.025em] text-slate-900 sm:hidden">
            <span>STANDUPINDO</span>
            <span className="text-blue-600">CILEGON</span>
          </span>
        </button>

        <nav className="hidden items-center gap-1 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1 md:flex">
          {LINKS.map((l) => (
            <button
              key={l.to}
              onClick={() => router.navigate(l.to)}
              className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200 ${
                isActive(l.to)
                  ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/70'
                  : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
              }`}
            >
              {l.label}
            </button>
          ))}
        </nav>

        <button onClick={() => router.navigate('/open-mic')} className="btn-primary hidden md:inline-flex !rounded-xl !px-4 !py-2.5">
          <Mic className="h-4 w-4" /> Daftar Open Mic
        </button>

        <button
          onClick={() => router.navigate('/more')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 sm:h-10 sm:w-10 md:hidden"
          aria-label="Menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
