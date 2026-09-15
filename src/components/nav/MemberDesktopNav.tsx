import { ClipboardList, House, Menu, Mic, UserRound } from 'lucide-react';
import type { Router } from '@/lib/router';
import { MemberNotificationBell } from '@/components/nav/MemberNotificationBell';

const LINKS = [
  { to: '/member', label: 'Home', icon: House },
  { to: '/member/open-mic', label: 'Open Mic', icon: Mic },
  { to: '/member/profile', label: 'Profile', icon: UserRound },
  { to: '/member/evaluations', label: 'Evaluasi', icon: ClipboardList },
  { to: '/member/more', label: 'More', icon: Menu },
];

export function MemberDesktopNav({ router }: { router: Router }) {
  const isActive = (to: string) => {
    if (to === '/member') return router.path === '/member';
    return router.path === to || router.path.startsWith(`${to}/`);
  };

  return (
    <header className="relative sticky top-0 z-40 overflow-visible border-b border-slate-200/80 bg-white/90 shadow-[0_4px_20px_rgba(15,23,42,0.04)] backdrop-blur-md before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-blue-700 before:via-sky-400 before:to-yellow-400">
      <div className="container-app flex h-16 items-center justify-between md:h-[4.5rem]">
        <button onClick={() => router.navigate('/member')} className="group flex min-w-0 items-center gap-2.5 sm:gap-3" aria-label="Member Area">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white shadow-[0_5px_14px_rgba(29,94,219,0.1)] transition-transform duration-200 group-hover:scale-[1.03] sm:h-10 sm:w-10">
            <img src="/assets/images/Standupindo_CIlegon_Logo.jpeg" alt="Standupindo Cilegon" className="h-7 w-7 rounded-lg object-contain sm:h-8 sm:w-8" />
          </span>
          <span className="flex min-w-0 flex-col text-left leading-tight">
            <span className="text-[13px] font-black tracking-[0.02em] text-slate-900 sm:text-[15px]">MEMBER <span className="text-blue-600">AREA</span></span>
            <span className="mt-0.5 truncate text-[9px] font-bold tracking-[0.12em] text-slate-400 sm:text-[10px]">STANDUPINDO CILEGON</span>
          </span>
        </button>

        <nav className="hidden items-center gap-1 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1 md:flex">
          {LINKS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <button
                key={item.to}
                type="button"
                onClick={() => router.navigate(item.to)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200 ${
                  active ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/70' : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <MemberNotificationBell router={router} />
          <button type="button" onClick={() => router.navigate('/member/more')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 sm:h-10 sm:w-10 md:hidden" aria-label="Menu member"><Menu className="h-5 w-5" /></button>
        </div>
      </div>
    </header>
  );
}
