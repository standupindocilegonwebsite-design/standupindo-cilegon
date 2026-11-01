import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CalendarDays, MapPin, Medal, Mic2, Sparkles, Star, Trophy, Users, X } from 'lucide-react';
import { DEFAULT_RECAP_CLOSING, type AnnualRecapStats } from '@/lib/annual-recap';
import { formatDate } from '@/lib/format';
import { LOGO_URL } from '@/lib/types';
import { useSiteSettings } from '@/lib/useSiteSettings';

const SLIDE_DURATIONS = {
  opening: 9000,
  numbers: 9000,
  people: 15000,
  communities: 12000,
  yearline: 14000,
  spotlight: 12000,
  'open-mics': 15000,
  events: 15000,
  closing: 12000,
} as const;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
const formatCount = (count: number) => count.toLocaleString('id-ID');

function AnimatedCount({ value, reducedMotion, className, startDelay = 800 }: { value: number; reducedMotion: boolean; className: string; startDelay?: number }) {
  const [count, setCount] = useState(reducedMotion ? value : 0);

  useEffect(() => {
    if (reducedMotion) {
      setCount(value);
      return;
    }

    setCount(0);
    let frameId = 0;
    const timeoutId = window.setTimeout(() => {
      const startedAt = performance.now();
      const updateCount = (now: number) => {
        const progress = Math.min((now - startedAt) / 1200, 1);
        const easedProgress = 1 - (1 - progress) ** 3;
        setCount(Math.round(value * easedProgress));
        if (progress < 1) frameId = window.requestAnimationFrame(updateCount);
      };
      frameId = window.requestAnimationFrame(updateCount);
    }, startDelay);

    return () => {
      window.clearTimeout(timeoutId);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [reducedMotion, startDelay, value]);

  return <strong className={className} aria-label={formatCount(value)}>{formatCount(reducedMotion ? value : count)}</strong>;
}

export function AnnualRecapStory({ year, stats, closingNarrative, musicUrl, onClose }: {
  year: number;
  stats: AnnualRecapStats;
  closingNarrative: string | null;
  musicUrl?: string | null;
  onClose: () => void;
}) {
  const { settings } = useSiteSettings();
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [holdPaused, setHoldPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicStartedRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number; ignored: boolean } | null>(null);
  const holdTriggeredRef = useRef(false);
  const progressRef = useRef(0);
  const isPaused = holdPaused;
  const slides = ['opening', 'numbers', 'people', 'communities', 'yearline', 'spotlight', 'open-mics', 'events', 'closing'] as const;
  const activeSlide = slides[index];
  const slideDuration = SLIDE_DURATIONS[activeSlide];
  const busiestMonth = stats.monthlyActivity.reduce<{ month: string; count: number } | null>(
    (busiest, month) => month.count > (busiest?.count ?? 0) ? month : busiest,
    null,
  );
  const largestActivity = Math.max(...stats.monthlyActivity.map((month) => month.count), 0);
  const closingCopy = closingNarrative?.trim() || DEFAULT_RECAP_CLOSING;

  const startMusic = useCallback(() => {
    const audio = audioRef.current;
    if (!musicUrl || !audio) return;
    audio.loop = true;
    if (musicStartedRef.current) {
      if (audio.paused) void audio.play().catch(() => undefined);
      return;
    }
    void audio.play().then(() => {
      musicStartedRef.current = true;
    }).catch(() => undefined);
  }, [musicUrl]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener?.('change', updatePreference);
    return () => mediaQuery.removeEventListener?.('change', updatePreference);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!musicUrl || !audio) return;
    audio.loop = true;
    void audio.play().then(() => {
      musicStartedRef.current = true;
    }).catch(() => undefined);
    return () => {
      audio.pause();
      audio.currentTime = 0;
      musicStartedRef.current = false;
    };
  }, [musicUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!musicUrl || !audio) return;
    if (isPaused) {
      audio.pause();
      return;
    }
    if (musicStartedRef.current && audio.paused) void audio.play().catch(() => undefined);
  }, [isPaused, musicUrl]);

  useEffect(() => {
    if (isPaused || reducedMotion) return;
    const audio = audioRef.current;
    if (musicStartedRef.current && audio?.paused) void audio.play().catch(() => undefined);
    const startedAt = Date.now() - (progressRef.current / 100) * slideDuration;
    const timer = window.setInterval(() => {
      const nextProgress = Math.min(((Date.now() - startedAt) / slideDuration) * 100, 100);
      progressRef.current = nextProgress;
      setProgress(nextProgress);
      if (nextProgress >= 100) {
        if (index === slides.length - 1) {
          audio?.pause();
          musicStartedRef.current = false;
          window.clearInterval(timer);
          return;
        }
        progressRef.current = 0;
        setProgress(0);
        setIndex(index + 1);
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [index, isPaused, reducedMotion, slideDuration, slides.length]);

  useEffect(() => () => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (selectedPhoto) setSelectedPhoto(null);
        else onClose();
      } else if (!selectedPhoto && event.key === 'ArrowLeft') {
        startMusic();
        progressRef.current = 0;
        setProgress(0);
        setIndex((current) => Math.max(0, current - 1));
      } else if (!selectedPhoto && event.key === 'ArrowRight') {
        startMusic();
        progressRef.current = 0;
        setProgress(0);
        setIndex((current) => Math.min(slides.length - 1, current + 1));
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [index, onClose, selectedPhoto, slides.length, startMusic]);

  function goToSlide(nextIndex: number) {
    progressRef.current = 0;
    setProgress(0);
    setIndex(Math.max(0, Math.min(slides.length - 1, nextIndex)));
  }

  function startHold(event: ReactPointerEvent<HTMLElement>) {
    const target = event.target;
    const ignored = target instanceof Element && Boolean(target.closest('button, a, input, textarea, select'));
    pointerStartRef.current = { x: event.clientX, y: event.clientY, ignored };
    holdTriggeredRef.current = false;
    if (!ignored) {
      startMusic();
      if (!reducedMotion && event.button === 0) event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (reducedMotion || ignored) return;
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      holdTriggeredRef.current = true;
      setHoldPaused(true);
    }, 300);
  }

  function finishPointer(event?: ReactPointerEvent<HTMLElement>, allowTap = false) {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (allowTap && event && start && !start.ignored && !holdTriggeredRef.current) {
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved < 12) {
        const bounds = event.currentTarget.getBoundingClientRect();
        goToSlide(event.clientX < bounds.left + bounds.width / 2 ? index - 1 : index + 1);
      }
    }
    holdTriggeredRef.current = false;
    setHoldPaused(false);
  }

  return (
    <div className="recap-stage min-h-dvh bg-[#040d1c] text-white md:grid md:place-items-center md:p-6">
      <div className="recap-device relative mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-[#071a35] shadow-2xl md:h-[min(880px,calc(100dvh-48px))] md:w-auto md:aspect-[9/19.5] md:rounded-[38px] md:border md:border-white/30">
        {musicUrl && <audio ref={audioRef} src={musicUrl} preload="auto" loop className="hidden" />}
        <div className="recap-device-texture pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative z-20 flex h-9 shrink-0 gap-1 px-3 pr-14 pt-3" aria-label={`Slide ${index + 1} dari ${slides.length}`}>
          {slides.map((slide, slideIndex) => <div key={slide} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-cyan-300" style={{ width: slideIndex < index ? '100%' : slideIndex === index ? `${reducedMotion ? 0 : progress}%` : '0%' }} /></div>)}
        </div>
        <button type="button" onClick={onClose} aria-label="Tutup Annual Recap" className="absolute right-2 top-[calc(env(safe-area-inset-top)+0.25rem)] z-50 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm"><X className="h-4 w-4" /></button>

        <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-3 pt-4 sm:px-6" onPointerDown={startHold} onPointerUp={(event) => finishPointer(event, true)} onPointerCancel={(event) => finishPointer(event)}>
          <div key={activeSlide} className="recap-slide-enter flex min-h-full flex-col">
            {activeSlide === 'opening' && <section className="relative flex min-h-full flex-col justify-between overflow-hidden pb-2 pt-20">
              <div className="absolute right-1 top-[27%] rotate-[-13deg] text-cyan-300/80" aria-hidden="true"><Mic2 className="h-24 w-24 drop-shadow-[0_10px_18px_rgba(12,173,255,0.3)] sm:h-28 sm:w-28" strokeWidth={1.4} /><span className="absolute -left-7 top-2 h-20 w-px rotate-[-26deg] bg-cyan-300/50" /><span className="absolute -left-2 top-[-1.5rem] h-16 w-px rotate-[-26deg] bg-cyan-300/30" /></div>
              <img src="/assets/images/standup-indo-logo.png" alt="Logo Standupindo" className="absolute right-0 top-1 h-12 w-24 object-contain" />
              <div className="recap-sequence"><div className="flex items-center gap-3"><span className="flex shrink-0 items-center justify-center rounded-xl bg-white p-1.5"><img src={settings.logo_url ?? LOGO_URL} alt="Logo Standupindo Cilegon" className="h-[4.5rem] w-auto object-contain" /></span><p className="text-[11px] font-bold uppercase text-cyan-100">Satu tahun bersama Standupindo Cilegon</p></div><h1 className="mt-5 flex flex-col text-[4.5rem] font-black leading-[0.78] text-white sm:text-[5.5rem]"><span>RECAP</span><span className="mt-3 -rotate-2 text-[5.8rem] text-cyan-300 sm:text-[6.5rem]">{year}</span></h1><p className="mt-7 max-w-[18rem] text-sm leading-6 text-blue-100">Setahun penuh cerita, panggung, tawa, dan orang-orang yang ikut memeriahkan.</p><p className="mt-6 max-w-[15rem] -rotate-2 font-serif text-lg italic text-cyan-200">Yuk, lihat apa yang terjadi selama setahun...</p></div>
              <div className="pb-2 text-[9px] font-bold uppercase text-blue-200/80" style={{ animationDelay: '3600ms' }}>STANDUPINDO CILEGON</div>
            </section>}

            {activeSlide === 'numbers' && <section className="relative flex min-h-full flex-col pb-2">
              <p className="text-[3.5rem] font-black leading-none text-white">{year}</p><h1 className="mt-1 text-xl font-extrabold text-cyan-200">Ternyata ramai juga.</h1>
              <div className="recap-sequence recap-sequence-late mt-5 grid grid-cols-2 gap-3">{[
                { value: stats.openMicCount, label: 'OPEN MIC', Icon: Mic2 },
                { value: stats.eventCount, label: 'EVENT', Icon: CalendarDays },
                { value: stats.totalPerformerCount, label: 'KOMIKA TAMPIL', Icon: Users },
                { value: stats.appearanceCount, label: 'PENAMPILAN', Icon: Star },
              ].map(({ value, label, Icon }, statisticIndex) => <div key={label} className="flex min-h-28 flex-col items-center justify-center rounded-2xl bg-white px-2 py-3 text-center text-[#0b1f44] shadow-[0_10px_24px_rgba(2,8,23,0.18)]"><Icon className="h-6 w-6 text-blue-600" strokeWidth={2.4} /><AnimatedCount value={value} reducedMotion={reducedMotion} startDelay={1600 + statisticIndex * 1000} className="mt-1 text-3xl font-black leading-none" /><span className="mt-1 text-[9px] font-extrabold uppercase">{label}</span></div>)}</div>
              <div className="relative mt-auto flex h-24 items-end justify-center overflow-hidden pt-4" aria-hidden="true">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,rgba(56,189,248,0.2),transparent_68%)]" />
                <div className="absolute inset-x-0 bottom-0 flex h-20 items-end justify-around opacity-65">
                  {Array.from({ length: 17 }, (_, buildingIndex) => <span key={buildingIndex} className="relative shrink-0 rounded-t-[2px] bg-gradient-to-b from-[#3479a7] via-[#1a4c77] to-[#0b2342]" style={{ width: `${12 + ((buildingIndex * 7) % 11)}px`, height: `${30 + ((buildingIndex * 13) % 34)}px` }}><span className="absolute inset-x-1 top-2 bottom-1 opacity-35" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 8px, rgba(125,211,252,0.65) 8px 10px), repeating-linear-gradient(90deg, transparent 0 6px, rgba(125,211,252,0.55) 6px 8px)' }} /></span>)}
                </div>
                <div className="relative z-10 flex h-full w-full items-end justify-center gap-[2px]">
                  {Array.from({ length: 12 }, (_, buildingIndex) => <span key={buildingIndex} className="relative shrink-0 rounded-t-[2px] bg-gradient-to-b from-[#286b9b] via-[#154574] to-[#081b35] shadow-[0_0_12px_rgba(56,189,248,0.12)]" style={{ width: `${16 + ((buildingIndex * 13) % 13)}px`, height: `${34 + ((buildingIndex * 19) % 55)}px` }}><span className="absolute inset-x-1 top-2 bottom-1 opacity-60" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 8px, rgba(125,211,252,0.72) 8px 10px), repeating-linear-gradient(90deg, transparent 0 6px, rgba(125,211,252,0.62) 6px 8px)' }} /></span>)}
                </div>
              </div>
            </section>}

            {activeSlide === 'people' && <section className="relative flex min-h-full flex-col pb-2">
              <p className="text-[11px] font-black uppercase leading-4 text-cyan-200">MEREKA YANG NAIK KE PANGGUNG</p><div className="mt-2 flex items-end gap-2"><AnimatedCount value={stats.totalPerformerCount} reducedMotion={reducedMotion} className="text-[5.3rem] font-black leading-[0.82] text-white" /><span className="bg-gradient-to-r from-cyan-300 via-emerald-300 to-amber-300 bg-clip-text pb-1 text-xl font-extrabold text-transparent">komika</span></div><p className="mt-2 text-sm font-medium text-blue-100">dari komunitas, luar komunitas, dan umum tampil sepanjang {year}.</p>
              <div className="recap-sequence recap-sequence-late mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white px-3 py-3 text-[#0b1f44] shadow-lg"><strong className="block text-3xl font-black">{formatCount(stats.firstTimePerformerCount)}</strong><p className="mt-1 text-[10px] leading-4">orang pertama kali tercatat tampil di <span className="font-extrabold text-cyan-700">Standupindo Cilegon</span> tahun ini.</p></div><div className="rounded-2xl bg-white px-3 py-3 text-[#0b1f44] shadow-lg"><strong className="block text-3xl font-black">{formatCount(stats.newMemberCount)}</strong><p className="mt-1 text-[10px] leading-4">member baru bergabung bersama <span className="font-extrabold text-cyan-700">Standupindo Cilegon</span>.</p></div></div>
              <div className="recap-sequence recap-sequence-later mt-7"><p className="text-[10px] font-black uppercase tracking-wide text-cyan-200">3 KOMIKA INTERNAL TERAKTIF DI OPEN MIC</p><div className="recap-sequence recap-sequence-last recap-sequence-reverse mt-2 grid grid-cols-3 gap-2">{stats.topInternalPerformers.map((performer, performerIndex) => <article key={performer.id} className="relative aspect-[3/5] min-w-0 overflow-hidden rounded-[18px] border-2 border-blue-300/80 bg-slate-900 shadow-[0_0_14px_rgba(37,99,235,0.28)]">{performer.photo ? <img src={performer.photo} alt={performer.name} className="recap-performer-photo absolute inset-0 h-full w-full object-cover object-top" /> : <div className="recap-performer-photo absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-300 via-blue-600 to-indigo-950 text-4xl font-black text-white">{performer.name.charAt(0)}</div>}<div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(30,64,175,0.02)_20%,rgba(29,78,216,0.16)_48%,rgba(30,58,138,0.8)_76%,rgba(15,23,80,0.98)_100%)]" /><span className={`absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border-2 shadow-lg ${['border-amber-100 bg-amber-300 text-amber-950', 'border-slate-100 bg-slate-200 text-slate-800', 'border-orange-100 bg-orange-300 text-orange-950'][performerIndex]}`}><Medal className="h-6 w-6" /><span className="absolute text-[9px] font-black">{performerIndex + 1}</span></span><div className="absolute inset-x-0 bottom-0 min-w-0 px-2 pb-2.5 text-white"><h2 className="line-clamp-2 break-words text-xs font-black leading-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">{performer.name}</h2><p className="mt-1 text-[9px] font-semibold text-blue-100">{formatCount(performer.count)} penampilan</p></div></article>)}{stats.topInternalPerformers.length === 0 && <p className="col-span-3 py-8 text-center text-xs text-blue-100">Belum ada komika internal yang tercatat tampil.</p>}</div></div>
            </section>}

            {activeSlide === 'communities' && <section className="relative flex min-h-full flex-col pb-2">
              <p className="text-[10px] font-black uppercase tracking-wide text-cyan-200">PANGGUNG KITA RAMAI-RAMAI</p>
              <h1 className="mt-2 max-w-[18rem] text-3xl font-black uppercase leading-tight text-white">KOMUNITAS TAMU</h1>
              <p className="mt-2 max-w-[19rem] text-xs leading-5 text-blue-100">Komunitas dari luar Standupindo Cilegon yang ikut meramaikan panggung.</p>
              <div className="mt-5 flex flex-col gap-2">
                {stats.topCommunities.slice(0, 3).map((community, communityIndex) => {
                  const cardDelay = 2400 + communityIndex * 2000;
                  return <div key={community.name} className="recap-community-row flex min-h-[4.5rem] items-center gap-3 rounded-2xl bg-white px-4 py-3 text-[#0b1f44] shadow-[0_10px_24px_rgba(2,8,23,0.18)]" style={{ animationDelay: `${cardDelay}ms` }}><span className={`recap-community-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-black ${['bg-amber-300 text-amber-900', 'bg-slate-200 text-slate-600', 'bg-orange-200 text-orange-800'][communityIndex]}`} style={{ animationDelay: `${cardDelay + 400}ms` }}><Trophy className="h-5 w-5" /></span><span className="recap-community-copy min-w-0 flex-1 text-xs font-extrabold" style={{ animationDelay: `${cardDelay + 800}ms` }}>{community.name}</span><div className="recap-community-copy shrink-0 text-right" style={{ animationDelay: `${cardDelay + 800}ms` }}><AnimatedCount value={community.count} reducedMotion={reducedMotion} startDelay={cardDelay + 800} className="block text-xl font-black leading-none" /><span className="text-[9px] font-semibold text-slate-500">kali tampil</span></div></div>;
                })}
                {stats.topCommunities.length === 0 && <p className="px-4 py-6 text-sm text-blue-100">Belum ada komunitas tamu tercatat.</p>}
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-cyan-200/20 bg-cyan-300/10 px-4 py-3 text-blue-50" style={{ animationDelay: '8400ms' }}><Users className="h-5 w-5 shrink-0 text-cyan-300" /><strong className="min-w-0 flex-1 text-[10px] font-black uppercase leading-tight tracking-wide text-cyan-200">Komika umum / independen</strong><span className="shrink-0 text-right"><AnimatedCount value={stats.independentAppearanceCount} reducedMotion={reducedMotion} startDelay={8400} className="block text-xl font-black leading-none" /><span className="text-[9px] font-semibold text-blue-100">kali tampil</span></span></div>
            </section>}

            {activeSlide === 'yearline' && <section className="relative flex min-h-full flex-col pb-2">
              <p className="text-[1.8rem] font-black leading-none">PERJALANAN <span className="text-cyan-300">{year}</span></p><p className="mt-2 text-xs text-blue-100">Bulan demi bulan, panggung terus berjalan.</p><div className="mt-4 flex min-h-0 flex-1 flex-col justify-between">{MONTHS.map((monthLabel, monthIndex) => {
                const activity = stats.monthlyActivity[monthIndex]?.count ?? 0;
                const normalizedMonth = busiestMonth?.month.toLocaleLowerCase('id-ID').replace('.', '');
                const isBusiest = activity > 0 && [monthLabel.toLocaleLowerCase('id-ID'), `${monthLabel.toLocaleLowerCase('id-ID')}.`].includes(normalizedMonth ?? '');
                const width = largestActivity > 0 ? Math.max(activity ? 12 : 0, (activity / largestActivity) * 100) : 0;
                const animationDelay = `${2400 + monthIndex * 250}ms`;
                return <div key={monthLabel} className="recap-month-row grid min-h-[1.25rem] flex-1 grid-cols-[2.5rem_1fr_1.5rem] items-center gap-2" style={{ animationDelay }}><span className={`text-[9px] font-bold ${isBusiest ? 'text-cyan-200' : 'text-blue-100'}`}>{monthLabel}</span><div className="h-2.5 overflow-hidden rounded-full bg-blue-950/90 ring-1 ring-white/10"><div className={`recap-month-bar h-full rounded-full ${isBusiest ? 'bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.6)]' : 'bg-gradient-to-r from-blue-700 to-sky-400'}`} style={{ width: `${width}%`, animationDelay }} /></div><span className={`text-right text-[9px] font-bold ${isBusiest ? 'text-cyan-200' : 'text-cyan-100'}`}>{activity || ''}</span></div>;
              })}</div><div className="mt-3 flex items-center justify-between gap-2 border-t border-white/15 pt-2 text-[9px] text-right" style={{ animationDelay: '6000ms' }}><span className="font-bold uppercase text-blue-200">Bulan tersibuk</span><strong className="text-cyan-200">{busiestMonth ? `${busiestMonth.month} · ${formatCount(busiestMonth.count)} kegiatan` : 'Belum ada kegiatan'}</strong></div>
            </section>}

            {activeSlide === 'spotlight' && <section className="relative flex min-h-full flex-col pb-2">
              <h1 className="max-w-[17rem] text-2xl font-black uppercase leading-tight text-white">PALING RAMAI TAHUN INI</h1>
              <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
                <article className="recap-slide-enter flex min-h-0 flex-1 flex-col items-center border-b border-white/15 pb-2" style={{ animationDelay: '1600ms' }}>
                  <div className="shrink-0 px-2 pt-1 text-center text-white">
                    <div className="flex items-baseline justify-center gap-2"><strong className="text-4xl font-black leading-none">{stats.topOpenMics[0] ? formatCount(stats.topOpenMics[0].appearanceCount) : '0'}</strong><span className="text-[10px] font-black uppercase tracking-wide text-cyan-200">KOMIKA TAMPIL</span></div>
                    <p className="mt-1 truncate text-[10px] text-blue-100">Hadir di <strong className="font-extrabold text-white">{stats.topOpenMics[0]?.title ?? 'Open Mic'}</strong></p>
                  </div>
                  {stats.topOpenMics[0]?.poster && <div className="flex min-h-0 w-full flex-1 items-center justify-center pt-2"><img src={stats.topOpenMics[0].poster} alt={`Poster ${stats.topOpenMics[0].title}`} className="max-h-full max-w-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)]" /></div>}
                </article>
                <article className="recap-slide-enter flex min-h-0 flex-1 flex-col items-center pt-1" style={{ animationDelay: '2700ms' }}>
                  <div className="shrink-0 px-2 text-center text-white">
                    <div className="flex items-baseline justify-center gap-2"><strong className="text-4xl font-black leading-none">{stats.spotlightEvent ? formatCount(stats.spotlightEvent.ticketsSold) : stats.totalTicketsSold === null ? '—' : '0'}</strong><span className="text-[10px] font-black uppercase tracking-wide text-cyan-200">PENONTON</span></div>
                    <p className="mt-1 truncate text-[10px] text-blue-100">{stats.spotlightEvent ? <>Hadir di <strong className="font-extrabold text-white">{stats.spotlightEvent.title}</strong></> : stats.totalTicketsSold === null ? 'Data tiket belum tersedia' : 'Belum ada tiket terjual'}</p>
                  </div>
                  {(stats.spotlightEvent?.poster || stats.spotlightEvent?.photo) && <div className="flex min-h-0 w-full flex-1 items-center justify-center pt-2"><img src={stats.spotlightEvent.poster || stats.spotlightEvent.photo || ''} alt={`Poster ${stats.spotlightEvent?.title ?? 'Event'}`} className="max-h-full max-w-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)]" /></div>}
                </article>
              </div>
            </section>}

            {activeSlide === 'open-mics' && <section className="relative flex min-h-full flex-col pb-2">
              <p className="text-[10px] font-black uppercase tracking-wide text-cyan-200">OPEN MIC</p>
              <h1 className="mt-1 max-w-[19rem] text-xl font-black uppercase leading-tight text-white">3 PANGGUNG OPEN MIC PALING RAMAI</h1>
              <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
                {stats.topOpenMics.map((openMic, openMicIndex) => <article key={openMic.id} className="recap-slide-enter flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/20 bg-white text-[#0b1f44] shadow-lg" style={{ animationDelay: `${1600 + openMicIndex * 1000}ms` }}>
                  <div className="relative flex w-[38%] shrink-0 items-center justify-center bg-slate-950 p-2">{openMic.poster && <img src={openMic.poster} alt={`Poster ${openMic.title}`} className="max-h-full max-w-full object-contain" />}<span className="absolute left-2 top-2 rounded-md bg-cyan-300 px-2 py-1 text-[9px] font-black text-[#071a35]">0{openMicIndex + 1}</span></div>
                  <div className="flex min-w-0 flex-1 flex-col p-3"><span className="text-[8px] font-black uppercase tracking-wide text-blue-700">OPEN MIC</span><h2 className="mt-1 line-clamp-3 break-words text-sm font-black leading-tight">{openMic.title}</h2><div className="mt-2 space-y-1 text-[9px] font-semibold leading-tight text-slate-600"><p className="flex items-start gap-1.5"><CalendarDays className="h-3 w-3 shrink-0 text-blue-600" /><span>{formatDate(openMic.date)}</span></p><p className="flex items-start gap-1.5"><MapPin className="h-3 w-3 shrink-0 text-blue-600" /><span>{openMic.venue}{openMic.location ? ` · ${openMic.location}` : ''}</span></p></div><div className="mt-auto flex flex-1 flex-col items-center justify-center pt-2"><strong className="text-4xl font-black leading-none">{formatCount(openMic.appearanceCount)}</strong><span className="mt-1 text-center text-[9px] font-black uppercase tracking-wide text-blue-700">KOMIKA TAMPIL</span></div></div>
                </article>)}
                {stats.topOpenMics.length === 0 && <p className="flex flex-1 items-center justify-center text-center text-sm text-blue-100">Belum ada penampilan Open Mic terverifikasi.</p>}
              </div>
            </section>}

            {activeSlide === 'events' && <section className="relative flex min-h-full flex-col rounded-2xl bg-slate-50 p-3 text-[#0b1f44]">
              <p className="text-[1.1rem] font-black">DAN TENTU SAJA...</p><h1 className="text-[0.95rem] font-black uppercase leading-tight">ADA BANYAK PANGGUNG BESAR.</h1>
              <p className="mt-3 border-t border-slate-200 pt-2 text-[9px] font-black uppercase tracking-wide text-blue-700">POSTER EVENT</p>
              <div className="mt-2 grid grid-cols-2 gap-2">{stats.eventPosters.map((event) => <button key={event.id} type="button" onClick={() => setSelectedPhoto(event.poster)} aria-label={`Lihat poster ${event.title}`} className="overflow-hidden rounded-lg bg-slate-900 shadow-sm ring-1 ring-slate-200"><img src={event.poster} alt={event.title} className="aspect-[4/5] w-full object-contain" /></button>)}</div>
              <div className="mt-2 border-t border-slate-200 pt-2"><p className="text-[9px] font-black uppercase tracking-wide text-blue-700">DOKUMENTASI PANGGUNG</p>{stats.eventPhotos.length > 0 ? <div className="mt-2 grid grid-cols-3 gap-2">{stats.eventPhotos.slice(0, 3).map((photo) => <button key={photo.id} type="button" onClick={() => setSelectedPhoto(photo.url)} aria-label={`Lihat dokumentasi ${photo.eventTitle}`} className="overflow-hidden rounded-lg bg-[#0b1f44]"><img src={photo.url} alt={`${photo.eventTitle}, dokumentasi`} className="aspect-[4/3] w-full object-cover" /></button>)}</div> : <p className="mt-1 text-center text-[9px] font-semibold text-slate-500">Dokumentasi foto belum tersedia.</p>}</div>
            </section>}

            {activeSlide === 'closing' && <section className="relative flex min-h-full flex-col items-center justify-center overflow-hidden pb-7 text-center">
              <div className="absolute inset-x-[-2rem] bottom-0 flex h-24 items-end justify-center gap-1 opacity-70" aria-hidden="true">{[34, 54, 38, 72, 46, 60, 84, 44, 66, 39, 74, 52, 32].map((height, buildingIndex) => <span key={buildingIndex} className="w-7 bg-[#020918]" style={{ height: `${height}px` }} />)}</div><Sparkles className="mb-4 h-6 w-6 text-cyan-300" /><p className="text-sm font-black uppercase tracking-wide text-white">TERIMA KASIH,</p><h1 className="mt-1 -rotate-2 text-[5.3rem] font-black leading-none text-cyan-300">{year}.</h1><p className="mt-5 max-w-[19rem] text-xs leading-5 text-blue-100">{closingCopy}</p><p className="mt-6 max-w-[17rem] rounded-full bg-cyan-300 px-5 py-3 text-[10px] font-black text-[#0b1f44] shadow-[0_8px_28px_rgba(34,211,238,0.2)]">SAMPAI KETEMU DI PANGGUNG BERIKUTNYA.</p><div className="relative mt-8 flex flex-col items-center gap-2"><img src="/assets/images/standup-indo-logo.png" alt="Logo Stand Up Indo" className="h-12 w-24 object-contain" /><img src={settings.logo_url ?? LOGO_URL} alt="Logo Standupindo Cilegon" className="h-10 w-10 rounded-full bg-white object-contain p-0.5" /></div>
            </section>}
          </div>
        </main>

        {selectedPhoto && <div className="absolute inset-0 z-[60] flex items-center justify-center bg-[#020918]/95 p-5" role="dialog" aria-modal="true" aria-label="Pratinjau media Event" onClick={() => setSelectedPhoto(null)}><button type="button" onClick={() => setSelectedPhoto(null)} aria-label="Tutup pratinjau" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"><X className="h-5 w-5" /></button><img src={selectedPhoto} alt="Dokumentasi Annual Recap" className="max-h-full max-w-full rounded-xl object-contain" /></div>}
      </div>
    </div>
  );
}