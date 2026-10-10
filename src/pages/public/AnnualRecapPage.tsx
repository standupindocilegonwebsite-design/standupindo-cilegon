import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Sparkles, X } from 'lucide-react';
import type { Router } from '@/lib/router';
import { DEFAULT_RECAP_CLOSING } from '@/lib/annual-recap';
import { supabase } from '@/lib/supabase';
import { EmptyState } from '@/components/ui/EmptyState';

interface AnnualRecapRecord {
  id: string;
  year: number;
  published: boolean;
  closing_narrative: string | null;
}

interface StorySlide {
  id: string;
  title: string;
  kicker: string;
  body: string;
  accent?: string;
  stat?: string;
  meta?: string;
}

function clampIndex(index: number, length: number) {
  if (length === 0) return 0;
  return (index + length) % length;
}

export function AnnualRecapPage({ router, year }: { router: Router; year: string }) {
  const [record, setRecord] = useState<AnnualRecapRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const holdTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    const onChange = () => setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener?.('change', onChange);
    return () => mediaQuery.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase
        .from('annual_recaps')
        .select('*')
        .eq('year', Number(year))
        .eq('published', true)
        .maybeSingle();

      if (!active) return;

      setRecord((data as AnnualRecapRecord | null) ?? null);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [year]);

  const slides = useMemo<StorySlide[]>(() => {
    const yearNumber = Number(year) || new Date().getFullYear();
    const safeClosing = record?.closing_narrative?.trim() || DEFAULT_RECAP_CLOSING;

    return [
      { id: 'opening', title: 'STANDUPINDO CILEGON', kicker: `RECAP ${yearNumber}`, body: 'Satu tahun, banyak panggung, banyak cerita, dan banyak tawa.', accent: 'from-blue-700 via-blue-600 to-sky-500', stat: '2026' },
      { id: 'stats', title: 'Tahun Ini Kita...', kicker: 'Angka ikhtisar', body: 'Open Mic, event, komika tampil, dan penampilan yang menjadi jejak perjalanan tahun ini.', stat: '2026' },
      { id: 'people', title: 'Mereka yang Meramaikan', kicker: 'Komika & komunitas', body: 'Sebagian besar cerita berawal dari orang-orang yang hadir, tampil, dan terus tumbuh bersama.', stat: '2026' },
      { id: 'community', title: 'Komunitas & Umum', kicker: 'Panggung terbuka', body: 'Dari komunitas yang konsisten hingga peserta independen, semua ikut meramaikan panggung.', stat: 'Top 3' },
      { id: 'journey', title: 'Perjalanan Setahun', kicker: 'Aktivitas bulanan', body: 'Dari Januari sampai Desember, kita melihat ritme dan momen yang paling aktif.', stat: 'Jan–Des' },
      { id: 'moments', title: 'Momen & Kilas Balik', kicker: 'Open Mic & Event', body: 'Saat paling ramai, saat paling berkesan, dan saat karya terbaik menghiasi panggung.', stat: 'Kilas balik' },
      { id: 'thanks', title: 'Terima Kasih', kicker: 'Sampai jumpa di panggung berikutnya', body: safeClosing, stat: 'Standupindo Cilegon' },
    ];
  }, [record, year]);

  const currentSlide = slides[index] ?? slides[0];

  useEffect(() => {
    if (slides.length <= 1 || paused || reducedMotion) return;

    const timer = window.setTimeout(() => {
      setIndex((prev) => clampIndex(prev + 1, slides.length));
    }, 4500);

    return () => window.clearTimeout(timer);
  }, [slides.length, index, paused, reducedMotion]);

  const goNext = () => setIndex((prev) => clampIndex(prev + 1, slides.length));
  const goPrev = () => setIndex((prev) => clampIndex(prev - 1, slides.length));

  function onPointerDown() {
    if (reducedMotion) return;
    holdTimerRef.current = window.setTimeout(() => {
      setPaused(true);
    }, 260);
  }

  function onPointerUp() {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    setPaused(false);
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">Memuat Annual Recap...</div>;
  }

  if (!record) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10 text-white">
        <div className="mx-auto max-w-md pt-20">
          <EmptyState title="Recap tidak tersedia" description="Annual Recap untuk tahun ini belum dipublikasikan atau belum dibuat." noSmokeArea />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.28),_transparent_30%),linear-gradient(180deg,#020817_0%,#0f172a_100%)]" />
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-4 pt-4 sm:px-6">
        {slides.map((slide, slideIndex) => (
          <div key={slide.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-300 via-sky-300 to-white transition-all duration-500" style={{ width: slideIndex === index ? '100%' : slideIndex < index ? '100%' : '0%', opacity: slideIndex === index || slideIndex < index ? 1 : 0.4 }} />
          </div>
        ))}
      </div>

      <button type="button" onClick={() => router.navigate('/')} aria-label="Tutup Annual Recap" className="absolute right-4 top-12 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-slate-900/60 text-white backdrop-blur-sm">
        <X className="h-5 w-5" />
      </button>

      <div
        className="relative z-10 flex min-h-screen flex-col justify-center px-4 py-20 sm:px-6"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchEnd={onPointerUp}
      >
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.6)] backdrop-blur-md sm:p-7">
            <div className="mb-4 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-sky-200">
              <span>{currentSlide.kicker}</span>
              <span>{currentSlide.stat}</span>
            </div>

            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-200">
                <Sparkles className="h-3.5 w-3.5" />
                Standupindo Cilegon
              </div>

              <div className="space-y-3">
                <h1 className="text-3xl font-black leading-none tracking-[-0.06em] text-white sm:text-5xl">{currentSlide.title}</h1>
                <p className="max-w-sm text-base leading-7 text-slate-200 sm:text-lg">{currentSlide.body}</p>
              </div>
            </div>

            {currentSlide.id === 'stats' && (
              <div className="mt-6 grid grid-cols-2 gap-3">
                {[
                  ['Total Open Mic', '12'],
                  ['Total Event', '4'],
                  ['Komika Tampil', '22'],
                  ['Total Penampilan', '48'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-slate-900/35 p-3 text-left">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-300">{label}</p>
                    <p className="mt-2 text-2xl font-black text-white">{value}</p>
                  </div>
                ))}
              </div>
            )}

            {currentSlide.id === 'thanks' && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/35 p-4 text-sm leading-7 text-slate-200">
                {record.closing_narrative?.trim() || DEFAULT_RECAP_CLOSING}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="absolute inset-y-0 left-0 z-20 flex w-1/3 items-center justify-start px-2 sm:px-4">
        <button type="button" onClick={goPrev} className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-slate-900/50 text-white shadow-lg backdrop-blur-sm transition hover:bg-slate-800/80" aria-label="Story sebelumnya">
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>
      <div className="absolute inset-y-0 right-0 z-20 flex w-1/3 items-center justify-end px-2 sm:px-4">
        <button type="button" onClick={goNext} className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-slate-900/50 text-white shadow-lg backdrop-blur-sm transition hover:bg-slate-800/80" aria-label="Story berikutnya">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-slate-900/60 px-3 py-2 backdrop-blur-sm">
        <button type="button" onClick={() => setPaused((current) => !current)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white">
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">{index + 1}/{slides.length}</span>
      </div>
    </div>
  );
}
