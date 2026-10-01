import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

export function TicketWorkspaceHeader({ title, subtitle, eyebrow = 'Admin Tiket', action, onBack }: { title: string; subtitle: string; eyebrow?: string; action?: ReactNode; onBack?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[22px] border border-blue-500 bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 p-4 text-white shadow-[0_10px_24px_rgba(37,99,235,0.2)] sm:gap-4 sm:p-5">
      <div className="min-w-0">
        {onBack && <button type="button" onClick={onBack} className="mb-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80" aria-label="Kembali ke menu Lainnya"><ArrowLeft className="h-3.5 w-3.5" /> Kembali</button>}
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-100 sm:text-[11px]">{eyebrow}</p>
        <h1 className="mt-1.5 text-xl font-black tracking-tight text-white sm:text-2xl">{title}</h1>
        <p className="mt-1 text-xs font-medium leading-5 text-blue-50 sm:text-sm">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
