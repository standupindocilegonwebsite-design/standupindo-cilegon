import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Mic, CalendarDays, ArrowRight, Sparkles, Handshake } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { OpenMic, EventItem, Komika, EventTicket, Partner } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { LOGO_URL } from '@/lib/types';
import { OpenMicCard } from '@/components/cards/OpenMicCard';
import { EventCard } from '@/components/cards/EventCard';
import { KomikaCard } from '@/components/cards/KomikaCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { getOpenMicNumbers } from '@/lib/format';

interface Props {
  router: Router;
}

function AutoSlideRow({ children, className, intervalMs = 5000, highlightActive = false, highlightTone = 'blue' }: { children: ReactNode[]; className: string; intervalMs?: number; highlightActive?: boolean; highlightTone?: 'blue' | 'amber' }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    activeIndexRef.current = 0;
    setActiveIndex(0);
  }, [children.length]);

  useEffect(() => {
    const row = rowRef.current;
    if (!row || children.length < 2 || window.matchMedia('(min-width: 1024px)').matches || paused) return;
    const timer = window.setInterval(() => {
      const nextIndex = (activeIndexRef.current + 1) % children.length;
      activeIndexRef.current = nextIndex;
      const nextItem = row.children[nextIndex] as HTMLElement | undefined;
      if (!nextItem) return;
      if (highlightActive) setActiveIndex(nextIndex);
      row.scrollTo({ left: nextItem.offsetLeft, behavior: 'smooth' });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [children.length, highlightActive, intervalMs, paused]);

  return (
    <div ref={rowRef} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onTouchStart={() => setPaused(true)} onTouchEnd={() => setPaused(false)} className={className}>
      {children.map((child, index) => isValidElement(child) ? cloneElement(child as React.ReactElement<{ className?: string }>, { className: `${child.props.className ?? ''} ${highlightActive && index === activeIndex ? `relative z-10 rounded-[22px] transition-shadow duration-500 ${highlightTone === 'amber' ? 'shadow-[0_0_0_3px_rgba(245,158,11,0.9),0_0_24px_rgba(245,158,11,0.46)]' : 'shadow-[0_0_0_3px_rgba(59,130,246,0.85),0_0_24px_rgba(59,130,246,0.42)]'}` : ''}` }) : child)}
    </div>
  );
}

function PartnerMarqueeStrip({ partners, category }: { partners: Partner[]; category: 'sponsor' | 'support' | 'media_partner' }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const labels = { sponsor: 'Sponsor', support: 'Support', media_partner: 'Media Partner' } as const;
  const sizeMap = {
    sponsor: { logo: 'h-20 w-20 sm:h-24 sm:w-24', item: 'min-w-[170px] sm:min-w-[210px]', name: 'text-base' },
    support: { logo: 'h-14 w-14 sm:h-16 sm:w-16', item: 'min-w-[140px] sm:min-w-[170px]', name: 'text-sm' },
    media_partner: { logo: 'h-12 w-12 sm:h-14 sm:w-14', item: 'min-w-[130px] sm:min-w-[150px]', name: 'text-xs' },
  } as const;
  const leading = partners.length > 1 ? [...partners, ...partners] : partners;

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || leading.length < 2) return undefined;
    const timer = window.setInterval(() => {
      if (paused) return;
      shell.scrollLeft += 0.5;
      if (shell.scrollLeft >= shell.scrollWidth / 2) shell.scrollLeft = 0;
    }, 30);
    return () => window.clearInterval(timer);
  }, [leading.length, paused]);

  if (partners.length === 0) return null;

  return (
    <div className="rounded-[28px] border border-white/50 bg-white/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] backdrop-blur-sm sm:p-4">
      <div className="mb-3 flex items-center justify-center"><span className="rounded-full border border-white/50 bg-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-700 sm:text-[11px]">{labels[category]}</span></div>
      <div ref={shellRef} className="partner-marquee-shell home-partner-marquee-shell" onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerCancel={() => setPaused(false)}>
        <div className="partner-marquee-track home-partner-marquee-track">
        {leading.map((partner, index) => <div key={`${partner.id}-${category}-${index}`} className={`partner-marquee-item ${sizeMap[category].item}`}>
          <div className={`partner-marquee-logo ${sizeMap[category].logo}`}>{partner.logo_url ? <img src={partner.logo_url} alt={partner.name} className="h-full w-full object-contain" /> : <span className="text-[10px] font-black text-slate-600 sm:text-xs">{partner.name.slice(0, 2).toUpperCase()}</span>}</div>
          <p className={`partner-marquee-name ${sizeMap[category].name}`}>{partner.name}</p>
        </div>)}
        </div>
      </div>
    </div>
  );
}

function shuffleItems<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function HomePage({ router }: Props) {
  const revealRootRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [mics, setMics] = useState<OpenMic[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [komika, setKomika] = useState<Komika[]>([]);
  const [partnersByCategory, setPartnersByCategory] = useState<Record<'sponsor' | 'support' | 'media_partner', Partner[]>>({ sponsor: [], support: [], media_partner: [] });
  const [ticketPrices, setTicketPrices] = useState<Record<string, number>>({});
  const [confirmedCounts, setConfirmedCounts] = useState<Record<string, number>>({});
  const openMicNumbers = useMemo(() => getOpenMicNumbers(mics), [mics]);

  useEffect(() => {
    const root = revealRootRef.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-home-reveal]'));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || !('IntersectionObserver' in window)) {
      targets.forEach((target) => target.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: micData }, { data: eventData }, { data: komikaData }, { data: ticketData }, { data: partnerData }] = await Promise.all([
        supabase.from('open_mics').select('*').eq('published', true).eq('status', 'upcoming').gte('date', today).order('date', { ascending: true }),
        supabase.from('events').select('*').eq('published', true).eq('status', 'upcoming').gte('date', today).order('date', { ascending: true }).limit(3),
        supabase.from('komika').select('id, full_name, stage_name, slug, photo, bio, instagram_url, tiktok_url, youtube_url, specialties, featured_order, status, published, created_at, updated_at').eq('published', true).eq('status', 'active'),
        supabase.from('event_tickets').select('event_id, price').eq('status', 'active').order('price', { ascending: true }),
        supabase.from('partners').select('*').eq('is_published', true).order('sort_order', { ascending: true }).order('name', { ascending: true }),
      ]);

      const micsList = (micData as OpenMic[]) ?? [];
      const eventsList = (eventData as EventItem[]) ?? [];
      const komikaList = (komikaData as Komika[]) ?? [];
      const prices: Record<string, number> = {};

      (ticketData as EventTicket[] | null)?.forEach((ticket) => {
        const current = prices[ticket.event_id];
        if (current === undefined || ticket.price < current) {
          prices[ticket.event_id] = ticket.price;
        }
      });

      const randomKomika = shuffleItems(komikaList).slice(0, 15);

      const groupedPartners: Record<'sponsor' | 'support' | 'media_partner', Partner[]> = { sponsor: [], support: [], media_partner: [] };
      (partnerData as Partner[] | null)?.forEach((partner) => {
        groupedPartners[partner.category].push(partner);
      });

      setMics(micsList);
      setEvents(eventsList);
      setKomika(randomKomika);
      setPartnersByCategory(groupedPartners);
      setTicketPrices(prices);

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
    <div ref={revealRootRef} className="animate-fade-in">
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
            <p className="mt-4 max-w-2xl text-[13px] font-semibold leading-6 text-[#BFDBFE] sm:mt-5 sm:text-base sm:leading-7 lg:text-lg lg:leading-8">
              Menjadi ruang bertemunya komika, penikmat komedi, dan insan kreatif untuk berbagi tawa, mengembangkan potensi, serta membangun ekosistem stand up comedy di Cilegon.
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
        <section data-home-reveal className="home-reveal">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-4">
            <div className="min-w-0 flex-1 border-l-4 border-l-blue-700 pl-3 sm:pl-4"><SectionHeader title="Open Mic Terdekat" subtitle="Panggung terbuka untuk kamu tampil." /></div>
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
              <EmptyState title="Belum ada Open Mic yang tersedia." description="Pantau terus untuk panggung berikutnya." noSmokeArea />
            ) : (
              <AutoSlideRow highlightActive highlightTone="blue" className="home-stagger flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:pb-0">
                {mics.slice(0, 3).map((m) => (
                  <div key={m.id} className="min-w-[260px] max-w-[260px] shrink-0 snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none">
                    <OpenMicCard mic={m} openMicNumber={openMicNumbers.get(m.id)} confirmedCount={confirmedCounts[m.id] ?? 0} router={router} />
                  </div>
                ))}
              </AutoSlideRow>
            )}
          </div>
        </section>

        {/* EVENT MENDATANG */}
        <section data-home-reveal className="home-reveal">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-4">
            <div className="min-w-0 flex-1 border-l-4 border-l-amber-600 pl-3 sm:pl-4"><SectionHeader title="Event Mendatang" subtitle="Malam penuh tawa bersama komika terbaik." /></div>
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
              <EmptyState title="Belum ada event mendatang." noSmokeArea />
            ) : (
              <AutoSlideRow highlightActive highlightTone="amber" className="home-stagger flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:pb-0">
                {events.map((e) => (
                  <div key={e.id} className="min-w-[260px] max-w-[260px] shrink-0 snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none">
                    <EventCard event={e} router={router} price={ticketPrices[e.id] ?? e.ticket_price ?? 0} />
                  </div>
                ))}
              </AutoSlideRow>
            )}
          </div>
        </section>

        {/* KOMIKA */}
        <section data-home-reveal className="home-reveal">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-4">
            <div className="min-w-0 flex-1 border-l-4 border-l-blue-500 pl-3 sm:pl-4"><SectionHeader title="Komika" subtitle="Kenali talent Standupindo Cilegon." /></div>
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
              <AutoSlideRow intervalMs={2500} highlightActive className="home-stagger flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:pb-0">
                {komika.map((k) => (
                  <div key={k.id} className="h-fit min-w-[160px] max-w-[160px] shrink-0 self-start snap-start sm:min-w-[180px] lg:min-w-0 lg:max-w-none">
                    <KomikaCard komika={k} router={router} />
                  </div>
                ))}
              </AutoSlideRow>
            )}
          </div>
        </section>

        {/* PARTNERS */}
        {(partnersByCategory.sponsor.length > 0 || partnersByCategory.support.length > 0 || partnersByCategory.media_partner.length > 0) && (
          <section data-home-reveal className="home-reveal">
            <div className="flex items-end justify-between gap-4 rounded-2xl border border-slate-300 bg-white px-3.5 py-3.5 shadow-sm sm:px-4">
              <div className="min-w-0 flex-1 border-l-4 border-l-blue-500 pl-3 sm:pl-4"><SectionHeader title="Our Beloved Partner" subtitle="Mereka yang turut mendukung komitmen kami." /></div>
              <button onClick={() => router.navigate('/more/kerja-sama')} className="hidden items-center gap-1 text-sm font-semibold text-blue-700 hover:gap-2 transition-all sm:inline-flex">
                Lihat semua <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mx-auto mt-6 max-w-5xl space-y-4">
              {(['sponsor', 'support', 'media_partner'] as const).map((category) => (
                <PartnerMarqueeStrip key={category} partners={partnersByCategory[category]} category={category} />
              ))}
            </div>
          </section>
        )}

        {/* CTA COLLABORATION */}
        <section data-home-reveal className="home-reveal">
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
