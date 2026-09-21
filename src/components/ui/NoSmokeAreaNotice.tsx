interface Props {
  detail?: boolean;
  context?: 'open-mic' | 'event';
}

export function NoSmokeAreaNotice({ detail = false, context = 'event' }: Props) {
  const areaLabel = context === 'open-mic' ? 'Open Mic' : 'acara';
  const coordinatorLabel = context === 'open-mic' ? 'Open Mic' : 'Acara';

  return detail ? (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-amber-950 sm:px-5">
      <p className="text-sm font-extrabold uppercase tracking-[0.08em]">🚭 JAGA AREA TETAP BEBAS ASAP</p>
      <p className="mt-1.5 text-sm leading-6">Merokok, vaping &amp; pods diperbolehkan di luar area {areaLabel} dan penonton.</p>
      <p className="mt-1 text-sm leading-6">Laporkan pelanggaran kepada Koordinator {coordinatorLabel}.</p>
    </div>
  ) : (
    <p className="text-sm font-semibold text-slate-700">🚭 No Smoke Area</p>
  );
}
