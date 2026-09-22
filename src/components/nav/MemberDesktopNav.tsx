import { ClipboardCheck, ClipboardList, House, Menu, Mic, UserRound } from 'lucide-react';
import type { Router } from '@/lib/router';
import { MemberNotificationBell } from '@/components/nav/MemberNotificationBell';
import { useAuth } from '@/lib/auth-context';

const LINKS = [
  { to: '/member', label: 'Home', icon: House },
  { to: '/member/open-mic', label: 'Open Mic', icon: Mic },
  { to: '/member/profile', label: 'Profile', icon: UserRound },
  { to: '/member/evaluations', label: 'Evaluasi', icon: ClipboardList },
  { to: '/member/more', label: 'More', icon: Menu },
];

export function MemberDesktopNav({ router, sticky = true, compact = false }: { router: Router; sticky?: boolean; compact?: boolean }) {
  const { isEvaluator } = useAuth();
  const links = isEvaluator ? [...LINKS.slice(0, 2), { to: '/evaluator', label: 'Evaluator', icon: ClipboardCheck }, ...LINKS.slice(2)] : LINKS;
  const isActive = (to: string) => {
    if (to === '/member') return router.path === '/member';
    return router.path === to || router.path.startsWith(`${to}/`);
  };

  return (
    <header className={`${sticky ? 'sticky top-0' : 'relative'} z-40 overflow-visible border-b border-blue-800/60 bg-blue-700 shadow-[0_6px_24px_rgba(29,78,216,0.22)] before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-blue-300`}>
      <div className={`container-app flex items-center justify-between ${compact ? 'h-14 md:h-16' : 'h-16 md:h-[4.5rem]'}`}>
        <button onClick={() => router.navigate('/member')} className="group flex min-w-0 items-center gap-2.5 sm:gap-3" aria-label="Member Area">
          <span className={`flex shrink-0 items-center justify-center rounded-xl border border-white/70 bg-white shadow-[0_5px_14px_rgba(15,23,42,0.14)] transition-transform duration-200 group-hover:scale-[1.03] ${compact ? 'h-8 w-8 sm:h-9 sm:w-9' : 'h-9 w-9 sm:h-10 sm:w-10'}`}>
            <img src="/assets/images/Standupindo_CIlegon_Logo.jpeg" alt="Standupindo Cilegon" className={`${compact ? 'h-6 w-6 sm:h-7 sm:w-7' : 'h-7 w-7 sm:h-8 sm:w-8'} rounded-lg object-contain`} />
          </span>
          <span className="flex min-w-0 flex-col text-left leading-tight">
            <span className={`${compact ? 'text-[12px] sm:text-[14px]' : 'text-[13px] sm:text-[15px]'} font-black tracking-[0.02em] text-white`}>MEMBER <span className="text-blue-100">AREA</span></span>
            <span className={`${compact ? 'text-[8px] sm:text-[9px]' : 'text-[9px] sm:text-[10px]'} mt-0.5 truncate font-bold tracking-[0.12em] text-blue-100`}>STANDUPINDO CILEGON</span>
          </span>
        </button>

        <nav className="hidden items-center gap-1 rounded-2xl border border-white/20 bg-blue-800/45 p-1 md:flex">
          {links.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <button
                key={item.to}
                type="button"
                onClick={() => router.navigate(item.to)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200 ${
                  active ? 'bg-white text-blue-700 shadow-sm' : 'text-blue-50 hover:bg-white/10 hover:text-white'
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
          <button type="button" onClick={() => router.navigate('/member/more')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/40 bg-white/10 text-white shadow-sm transition hover:bg-white hover:text-blue-700 sm:h-10 sm:w-10 md:hidden" aria-label="Menu member"><Menu className="h-5 w-5" /></button>
        </div>
      </div>
    </header>
  );
}
