import { useState } from 'react';
import { ArrowLeftRight, CircleHelp, ClipboardCheck, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Router } from '@/lib/router';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { Modal } from '@/components/ui/Modal';

export function MemberMorePage({ router }: { router: Router }) {
  const { isEvaluator, signOut } = useAuth();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
      router.navigate('/member/login');
    } finally {
      setLoggingOut(false);
    }
  };

  const items: Array<{ label: string; description?: string; icon: LucideIcon; onClick: () => void }> = [
    ...(isEvaluator ? [{ label: 'Evaluator', icon: ClipboardCheck, onClick: () => router.navigate('/evaluator') }] : []),
    { label: 'Akun', icon: KeyRound, onClick: () => router.navigate('/member/settings') },
    { label: 'Peran', icon: ShieldCheck, onClick: () => router.navigate('/member/roles') },
    { label: 'Bantuan', icon: CircleHelp, onClick: () => router.navigate('/member/help') },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="More" subtitle="Fitur yang relevan untuk member." backTo="/member" />

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
                  <span className="flex-1">
                    <span className="block text-sm font-bold text-slate-800">{item.label}</span>
                    {item.description && <span className="mt-0.5 block text-xs text-slate-500">{item.description}</span>}
                  </span>
                  <span className="text-xl leading-none text-slate-300 transition group-hover:text-blue-600">›</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
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
      <Modal
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="KONFIRMASI KELUAR"
        titleEyebrow="Akun member"
        ariaLabel="Konfirmasi keluar akun"
        size="sm"
        panelClassName="!max-w-[26rem] !rounded-[1.75rem] !border-blue-700 !shadow-[0_28px_80px_rgba(15,23,42,0.28)]"
        headerClassName="!bg-blue-700 !px-5 !pb-4 !pt-4 sm:!px-6 sm:!pb-4"
        titleClassName="!text-white"
        titleEyebrowClassName="!text-blue-100"
        closeButtonClassName="!bg-white/15 !text-white hover:!bg-white/25 hover:!text-white"
      >
        <div className="space-y-5 pb-1 pt-1">
          <div className="flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5 sm:p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-100">
              <LogOut className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold tracking-[-0.02em] text-slate-900">Yakin ingin keluar?</h3>
              <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm">Sesi akun di perangkat ini akan diakhiri. Kamu bisa masuk kembali kapan saja.</p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <button type="button" onClick={() => setConfirmLogout(false)} disabled={loggingOut} className="btn-secondary min-h-11 flex-1 !rounded-xl !font-bold !text-sm">Batal</button>
            <button type="button" onClick={() => void handleLogout()} disabled={loggingOut} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2.5 text-sm font-extrabold text-white shadow-[0_6px_16px_rgba(220,38,38,0.22)] transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-70">
              <LogOut className="h-4 w-4" /> {loggingOut ? 'Sedang keluar...' : 'Keluar akun'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
