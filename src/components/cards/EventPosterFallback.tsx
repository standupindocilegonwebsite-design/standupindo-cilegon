export function EventPosterFallback({ label = 'ARSIP EVENT' }: { label?: string }) {
  return (
    <span className="absolute inset-0 flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#17366c] via-[#0c2450] to-[#071735] px-3 text-center text-white">
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_50%_35%,rgba(96,165,250,0.55),transparent_38%),linear-gradient(135deg,transparent_48%,rgba(255,255,255,0.08)_49%,transparent_50%)]" />
      <svg
        aria-hidden="true"
        viewBox="0 0 96 112"
        fill="none"
        className="relative mb-3 h-[30%] max-h-28 min-h-14 w-auto text-amber-300 drop-shadow-[0_8px_16px_rgba(0,0,0,0.4)]"
      >
        <path d="M48 8c-10 0-18 8-18 18v25c0 10 8 18 18 18s18-8 18-18V26c0-10-8-18-18-18Z" fill="currentColor" />
        <path d="M40 24v28m8-34v38m8-32v28" stroke="#102952" strokeLinecap="round" strokeWidth="4" />
        <path d="M18 48v4c0 17 13 30 30 30s30-13 30-30v-4M48 82v16m-15 0h30" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="6" />
        <path d="m16 20 2.5 5.5L24 28l-5.5 2.5L16 36l-2.5-5.5L8 28l5.5-2.5L16 20Zm64 36 2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2 2-4.5Z" fill="#FACC15" />
      </svg>
      <span className="relative text-[10px] font-black uppercase tracking-[0.2em] text-sky-200 sm:text-xs">{label}</span>
      <span className="relative mt-1 text-xs font-extrabold leading-tight text-white sm:text-sm">Poster Belum Diunggah</span>
      <span aria-hidden="true" className="relative mt-3 h-0.5 w-10 rounded-full bg-amber-300/80" />
    </span>
  );
}
