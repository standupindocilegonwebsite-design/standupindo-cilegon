import { Home, Mic, CalendarDays, Drama, Menu } from 'lucide-react';
import type { Router } from '@/lib/router';

const ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/open-mic', label: 'Open Mic', icon: Mic },
  { to: '/event', label: 'Event', icon: CalendarDays },
  { to: '/komika', label: 'Komika', icon: Drama },
  { to: '/more', label: 'More', icon: Menu },
];

export function MobileBottomNav({ router }: { router: Router }) {
  const isActive = (to: string) =>
    to === '/' ? router.path === '/' : router.path.startsWith(to);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-blue-100 bg-white/90 shadow-[0_-8px_24px_rgba(11,60,93,0.08)] backdrop-blur-xl md:hidden"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
      aria-label="Navigasi utama"
    >
      <div className="mx-auto grid max-w-md grid-cols-5">
        {ITEMS.map((item) => {
          const active = isActive(item.to);
          const Icon = item.icon;
          return (
            <button
              key={item.to}
              onClick={() => router.navigate(item.to)}
              className={`mobile-nav-item flex flex-col items-center gap-0.5 py-2.5 transition-all duration-300 ${active ? 'mobile-nav-item-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span
                className={`mobile-nav-icon flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300 ${
                  active ? 'mobile-nav-icon-active bg-blue-600 text-white shadow-[0_8px_18px_rgba(29,94,219,0.3)]' : 'text-slate-400'
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className={`mobile-nav-label text-[10px] font-semibold ${active ? 'mobile-nav-label-active text-blue-700' : 'text-slate-400'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
