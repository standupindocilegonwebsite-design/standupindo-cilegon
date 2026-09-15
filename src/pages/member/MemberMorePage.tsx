import { ArrowLeftRight, CircleHelp, KeyRound, LogOut, ShieldCheck, UserRound, Star } from 'lucide-react';
import type { Router } from '@/lib/router';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';

export function MemberMorePage({ router }: { router: Router }) {
  const { signOut } = useAuth();

  const items = [
    { label: 'Profil', icon: UserRound, onClick: () => router.navigate('/member/profile') },
    { label: 'Evaluasi', icon: Star, onClick: () => router.navigate('/member/evaluations') },
    { label: 'Akun', icon: KeyRound, onClick: () => router.navigate('/member/settings') },
    { label: 'Peran', icon: ShieldCheck, onClick: () => router.navigate('/member/roles') },
    { label: 'Bantuan', icon: CircleHelp, onClick: () => router.navigate('/member/help') },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="More" subtitle="Fitur yang relevan untuk member." />

      <div className="container-app py-6 sm:py-8">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-600">Member Area</p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-slate-900">Akses cepat</h2>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <ArrowLeftRight className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onClick}
                  aria-label={item.label}
                  title={item.label}
                  className="group flex min-h-16 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-[0_8px_22px_rgba(15,23,42,0.03)] transition hover:border-blue-200 hover:bg-blue-50 active:scale-[0.99]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100 transition group-hover:bg-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="flex-1 text-sm font-bold text-slate-800">{item.label}</span>
                  <span className="text-xl leading-none text-slate-300 transition group-hover:text-blue-600">›</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.navigate('/member/login');
            }}
            className="flex w-full items-center justify-between rounded-[22px] border border-red-200 bg-red-50 p-4 text-left text-red-700 shadow-[0_8px_22px_rgba(239,68,68,0.08)] transition hover:bg-red-100"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-red-600 ring-1 ring-red-100">
                <LogOut className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold">Keluar</div>
                <div className="text-xs text-red-600/80">Logout akun member</div>
              </div>
            </div>
            <div className="text-red-400">›</div>
          </button>
        </div>
      </div>
    </div>
  );
}
