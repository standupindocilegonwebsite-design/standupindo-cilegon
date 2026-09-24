import { AlertTriangle, CigaretteOff } from 'lucide-react';

interface Props {
  detail?: boolean;
  context?: 'open-mic' | 'event';
  compact?: boolean;
}

export function NoSmokeAreaNotice({ detail = false, context = 'event', compact = false }: Props) {
  const areaLabel = context === 'open-mic' ? 'Open Mic' : 'acara';
  const coordinatorLabel = context === 'open-mic' ? 'Open Mic' : 'Acara';

  return detail ? (
    <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3.5 text-white shadow-[0_10px_24px_rgba(15,23,42,0.2)] sm:px-5">
      <span className="pointer-events-none absolute -right-5 -top-6 h-20 w-20 rounded-full border-[10px] border-amber-400/20" />
      <div className="relative flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950 shadow-sm"><AlertTriangle className="h-5 w-5" /></span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><p className="inline-flex items-center gap-1.5 text-sm font-extrabold uppercase tracking-[0.08em] text-white"><CigaretteOff className="h-4 w-4 text-amber-300" /> Jaga Area Tetap Bebas Asap</p><span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-950"><CigaretteOff className="h-3 w-3" /> Wajib Dipatuhi</span></div>
          <p className="mt-1.5 text-sm leading-6 text-slate-200">Berlaku untuk seluruh pihak yang hadir, baik <strong className="font-extrabold text-amber-300">komika</strong> maupun <strong className="font-extrabold text-amber-300">penonton</strong>.</p>
          <p className="mt-1 text-sm leading-6 text-slate-200">Merokok, vaping &amp; pods hanya diperbolehkan di luar area {areaLabel} dan area penonton.</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-amber-300">Laporkan pelanggaran kepada Koordinator {coordinatorLabel}.</p>
        </div>
      </div>
    </div>
  ) : (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-extrabold ${compact ? 'bg-red-50 text-red-700 ring-1 ring-red-200' : 'bg-red-600 text-white shadow-sm shadow-red-600/20'}`}><CigaretteOff className="h-3.5 w-3.5" /> <span>No Smoke Area</span></span>
  );
}
