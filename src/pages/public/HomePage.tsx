import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Mic, CalendarDays, ArrowRight, Sparkles, Handshake } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { OpenMic, EventItem, Komika } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { LOGO_URL } from '@/lib/types';
import { OpenMicCard } from '@/components/cards/OpenMicCard';
import { EventCard } from '@/components/cards/EventCard';
import { KomikaCard } from '@/components/cards/KomikaCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';

interface Props {
  router: Router;
}

function AutoSlideRow({ children, className }: { children: ReactNode[]; className: string }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const row = rowRef.current;
    if (!row || children.length < 2 || window.matchMedia('(min-width: 1024px)').matches || paused) return;
    const timer = window.setInterval(() => {
      const firstItem = row.firstElementChild as HTMLElement | null;
      if (!firstItem) return;
      const gap = Number.parseFloat(window.getComputedStyle(row).columnGap) || 0;
      const nextPosition = row.scrollLeft + firstItem.offsetWidth + gap;
      row.scrollTo({ left: nextPosition >= row.scrollWidth - row.clientWidth - 8 ? 0 : nextPosition, behavior: 'smooth' });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [children.length, paused]);

  return (
    <div ref={rowRef} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onTouchStart={() => setPaused(true)} onTouchEnd={() => setPaused(false)} className={className}>
      {children}
    </div>
  );
}

export function HomePage({ router }: Props) {
  const [loading, setLoading] = useState(true);
  const [mics, setMics] = useState<OpenMic[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [komika, setKomika] = useState<Komika[]>([]);
  const [confirmedCounts, setConfirmedCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: micData }, { data: eventData }, { data: komikaData }] = await Promise.all([
        supabase.from('open_mics').select('*').eq('published', true).eq('status', 'upcoming').gte('date', today).order('date', { ascending: true }).limit(3),
        supabase.from('events').select('*').eq('published', true).eq('status', 'upcoming').gte('date', today).order('date', { ascending: true }).limit(3),
        supabase.from('komika').select('id, stage_name, slug, photo, bio, instagram_url, tiktok_url, youtube_url, specialties, status, published, created_at, updated_at').eq('published', true).eq('status', 'active').order('stage_name', { ascending: true }).limit(6),
      ]);

      const micsList = (micData as OpenMic[]) ?? [];
      const eventsList = (eventData as EventItem[]) ?? [];
      const komikaList = (komikaData as Komika[]) ?? [];
      setMics(micsList);
      setEvents(eventsList);
      setKomika(komikaList);

      if (micsList.length > 0) {
        const ids = micsList.map((m) => m.id);
        const { data: regs } = await supabase
          .from('open_mic_registrations')
          .select('open_mic_id')
          .in('open_mic_id', ids)
          .eq('status', 'confirmed')
          .neq('attendance_status', 'absent');
        const counts: Record<string, number> = {};
        (regs ?? []).forEach((r: { open_mic_id: string }) => {
          counts[r.open_mic_id] = (counts[r.open_mic_id] ?? 0) + 1;
        });
        setConfirmedCounts(counts);
      }

      setLoading(false);
    })();
  }, []);

  return (
    <div className="animate-fade-in">
      {/* HERO */}
      <section className="hero-flag relative overflow-hidden text-white">
        <div className="hero-flag-glow hero-flag-glow-one" aria-hidden="true" />
        <div className="hero-flag-glow hero-flag-glow-two" aria-hidden="true" />
        <div className="hero-flag-wave hero-flag-wave-one" aria-hidden="true" />
        <div className="hero-flag-wave hero-flag-wave-two" aria-hidden="true" />
        <img src={LOGO_URL} alt="" aria-hidden="true" className="hero-watermark" />

        <div className="container-app relative z-10 py-7 sm:py-10 lg:py-16">
          <div className="max-w-2xl animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-[11px] font-semibold ring-1 ring-white/20 backdrop-blur-sm sm:text-xs">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#FBBF24] text-[#0B1F44]">
                <Sparkles className="h-3 w-3" />
              </span>
              Komunitas Stand Up Comedy Cilegon
            </div>
            <h1 className="mt-4 max-w-3xl text-[2.2rem] font-extrabold leading-[1.05] tracking-[-0.04em] text-white sm:mt-5 sm:text-4xl lg:text-[4rem]">
              Dari Tawa, Jadi Karya.
            </h1>
            <p className="mt-4 max-w-xl text-sm font-bold leading-relaxed text-[#BFDBFE] sm:text-base">
              Satu Panggung, Banyak Cerita.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:mt-7 sm:flex-row">
              <button onClick={() => router.navigate('/open-mic')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-[#0B1F44] shadow-[0_12px_24px_rgba(11,31,68,0.22)] transition-all hover:scale-[1.02] hover:shadow-[0_16px_28px_rgba(11,31,68,0.28)] active:scale-95">
                <Mic className="h-4 w-4" /> Temukan Open Mic
              </button>
              <button onClick={() => router.navigate('/event')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/35 bg-white/8 px-6 py-3.5 text-sm font-bold text-white backdrop-blur transition-all hover:bg-white/15 active:scale-95">
                <CalendarDays className="h-4 w-4" /> Lihat Event
              </button>
            </div>
          </div>
        </div>
        <div className="relative z-10 h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </section>

      <div className="container-app py-8 space-y-10 sm:py-12 sm:space-y-14">
        {/* OPEN MIC TERDEKAT */}
        <section>
          <div className="flex items-end justify-between gap-4">
            <SectionHeader title="Open Mic Terdekat" subtitle="Panggung terbuka untuk kamu tampil." />
            <button onClick={() => router.navigate('/open-mic')} className="hidden items-center gap-1 text-sm font-semibold text-blue-700 hover:gap-2 transition-all sm:inline-flex">
              Lihat semua <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-6">
            {loading ? (
              <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0">
                <div className="min-w-[260px] max-w-[260px] snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none"><LoadingSkeleton count={1} /></div>
                <div className="min-w-[260px] max-w-[260px] snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none"><LoadingSkeleton count={1} /></div>
                <div className="min-w-[260px] max-w-[260px] snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none"><LoadingSkeleton count={1} /></div>
              </div>
            ) : mics.length === 0 ? (
              <EmptyState title="Belum ada Open Mic yang tersedia." description="Pantau terus untuk panggung berikutnya." />
            ) : (
              <AutoSlideRow className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:pb-0">
                {mics.map((m) => (
                  <div key={m.id} className="min-w-[260px] max-w-[260px] shrink-0 snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none">
                    <OpenMicCard mic={m} confirmedCount={confirmedCounts[m.id] ?? 0} router={router} />
                  </div>
                ))}
              </AutoSlideRow>
            )}
          </div>
        </section>

        {/* EVENT MENDATANG */}
        <section>
          <div className="flex items-end justify-between gap-4">
            <SectionHeader title="Event Mendatang" subtitle="Malam penuh tawa bersama komika terbaik." />
            <button onClick={() => router.navigate('/event')} className="hidden items-center gap-1 text-sm font-semibold text-blue-700 hover:gap-2 transition-all sm:inline-flex">
              Lihat semua <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-6">
            {loading ? (
              <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0">
                <div className="min-w-[260px] max-w-[260px] snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none"><LoadingSkeleton count={1} /></div>
                <div className="min-w-[260px] max-w-[260px] snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none"><LoadingSkeleton count={1} /></div>
              </div>
            ) : events.length === 0 ? (
              <EmptyState title="Belum ada event mendatang." />
            ) : (
              <AutoSlideRow className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:pb-0">
                {events.map((e) => (
                  <div key={e.id} className="min-w-[260px] max-w-[260px] shrink-0 snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none">
                    <EventCard event={e} router={router} />
                  </div>
                ))}
              </AutoSlideRow>
            )}
          </div>
        </section>

        {/* KOMIKA */}
        <section>
          <div className="flex items-end justify-between gap-4">
            <SectionHeader title="Komika" subtitle="Kenali talent Standupindo Cilegon." />
            <button onClick={() => router.navigate('/komika')} className="hidden items-center gap-1 text-sm font-semibold text-blue-700 hover:gap-2 transition-all sm:inline-flex">
              Lihat semua <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-6">
            {loading ? (
              <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0">
                <div className="min-w-[160px] max-w-[160px] snap-start sm:min-w-[180px] lg:min-w-0 lg:max-w-none"><LoadingSkeleton count={1} /></div>
                <div className="min-w-[160px] max-w-[160px] snap-start sm:min-w-[180px] lg:min-w-0 lg:max-w-none"><LoadingSkeleton count={1} /></div>
                <div className="min-w-[160px] max-w-[160px] snap-start sm:min-w-[180px] lg:min-w-0 lg:max-w-none"><LoadingSkeleton count={1} /></div>
                <div className="min-w-[160px] max-w-[160px] snap-start sm:min-w-[180px] lg:min-w-0 lg:max-w-none"><LoadingSkeleton count={1} /></div>
              </div>
            ) : komika.length === 0 ? (
              <EmptyState title="Belum ada komika." />
            ) : (
              <AutoSlideRow className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:pb-0">
                {komika.map((k) => (
                  <div key={k.id} className="min-w-[160px] max-w-[160px] shrink-0 snap-start sm:min-w-[180px] lg:min-w-0 lg:max-w-none">
                    <KomikaCard komika={k} router={router} />
                  </div>
                ))}
              </AutoSlideRow>
            )}
          </div>
        </section>

        {/* CTA COLLABORATION */}
        <section>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-brand-800 px-6 py-12 text-center text-white sm:px-12 sm:py-16">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3) 0, transparent 40%)' }} />
            <div className="relative mx-auto max-w-xl">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                <Handshake className="h-7 w-7" />
              </div>
              <h2 className="mt-5 text-2xl font-extrabold sm:text-3xl">Mau berkolaborasi dengan Standupindo Cilegon?</h2>
              <p className="mt-3 text-sm text-blue-100 sm:text-base">Mari berkolaborasi untuk sponsorship, event, atau partnership venue bersama kami.</p>
              <button onClick={() => router.navigate('/more/kerja-sama')} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-blue-700 shadow-lg transition hover:scale-[1.02] active:scale-95">
                Kerja Sama <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
