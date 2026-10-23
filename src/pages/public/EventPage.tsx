import { useEffect, useRef, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import { useHistoryEntryState, useRestoreScrollPosition, type Router } from '@/lib/router';
import type { EventItem, EventLineupEntry, EventTicket } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { EventCard } from '@/components/cards/EventCard';
import { EventPosterFallback } from '@/components/cards/EventPosterFallback';
import { PageHeader } from '@/components/PageHeader';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, getEventStatus } from '@/lib/format';

type EventSearchLineupEntry = Pick<EventLineupEntry, 'event_id' | 'performer_name' | 'role_category' | 'role_title'> & {
  komika?: { stage_name: string } | { stage_name: string }[] | null;
};

export function EventPage({ router }: { router: Router }) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [lineupSearchText, setLineupSearchText] = useState<Record<string, string>>({});
  const [lineupSearchError, setLineupSearchError] = useState(false);
  const [ticketPrices, setTicketPrices] = useState<Record<string, number>>({});
  const [upcomingSearch, setUpcomingSearch] = useHistoryEntryState('event-upcoming-search', '');
  const [completedSearch, setCompletedSearch] = useHistoryEntryState('event-completed-search', '');
  const [loadError, setLoadError] = useState(false);
  const [notificationTargetError, setNotificationTargetError] = useState('');
  const handledNotificationParticipantId = useRef<string | null>(null);
  const navigateRef = useRef(router.navigate);
  navigateRef.current = router.navigate;
  const notificationParticipantId = router.query.get('notificationParticipantId');

  useEffect(() => {
    if (!notificationParticipantId || handledNotificationParticipantId.current === notificationParticipantId) return;
    handledNotificationParticipantId.current = notificationParticipantId;
    let active = true;
    void (async () => {
      const { data, error } = await supabase.from('event_participants')
        .select('id, events(slug)')
        .eq('id', notificationParticipantId)
        .maybeSingle();
      if (!active) return;
      const eventSlug = (data?.events as { slug?: string } | null)?.slug;
      if (error || !eventSlug) {
        if (error) console.error('Failed to resolve linked member event notification', error);
        setNotificationTargetError('Pendaftaran event dari notifikasi sudah tidak tersedia atau tidak dapat diakses oleh akun ini.');
        return;
      }
      navigateRef.current(`/event/${encodeURIComponent(eventSlug)}?notificationParticipantId=${encodeURIComponent(notificationParticipantId)}`);
    })();
    return () => { active = false; };
  }, [notificationParticipantId]);

  useEffect(() => {
    (async () => {
      const loadPublishedEvents = async () => {
        const pageSize = 1000;
        const allEvents: EventItem[] = [];

        for (let from = 0; ; from += pageSize) {
          const { data, error } = await supabase
            .from('events')
            .select('id, title, slug, poster, date, time, venue, location, maps_url, description, status, registration_status, published, ticket_sales_mode, created_at')
            .eq('published', true)
            .order('date', { ascending: true })
            .range(from, from + pageSize - 1);

          if (error) return { data: [] as EventItem[], error };

          const page = (data as EventItem[] | null) ?? [];
          allEvents.push(...page);
          if (page.length < pageSize) return { data: allEvents, error: null };
        }
      };

      const [{ data: eventData, error: eventError }, { data: ticketData }] = await Promise.all([
        loadPublishedEvents(),
        supabase.from('event_tickets').select('event_id, price').eq('status', 'active').eq('available_public', true).order('price', { ascending: true }),
      ]);

      setLoadError(Boolean(eventError));
      const eventsList = eventData;
      const searchableEventIds = eventsList
        .filter((event) => ['upcoming', 'completed'].includes(getEventStatus(event.status, event.date)))
        .map((event) => event.id);
      const prices: Record<string, number> = {};

      (ticketData as EventTicket[] | null)?.forEach((ticket) => {
        const current = prices[ticket.event_id];
        if (current === undefined || ticket.price < current) {
          prices[ticket.event_id] = ticket.price;
        }
      });

      if (searchableEventIds.length > 0) {
        const pageSize = 1000;
        const allLineupEntries: EventSearchLineupEntry[] = [];
        let lineupLoadFailed = false;

        for (let from = 0; ; from += pageSize) {
          const { data, error } = await supabase
            .from('event_lineups')
            .select('event_id, performer_name, role_category, role_title, komika:komika_id(stage_name)')
            .in('event_id', searchableEventIds)
            .range(from, from + pageSize - 1);

          if (error) {
            console.error('Failed to load event lineup search data', error);
            lineupLoadFailed = true;
            break;
          }

          const page = (data as unknown as EventSearchLineupEntry[] | null) ?? [];
          allLineupEntries.push(...page);
          if (page.length < pageSize) break;
        }

        if (lineupLoadFailed) {
          setLineupSearchError(true);
        } else {
          const searchTextByEvent: Record<string, string[]> = {};
          allLineupEntries.forEach((entry) => {
            const linkedMembers = Array.isArray(entry.komika) ? entry.komika : entry.komika ? [entry.komika] : [];
            const text = [
              entry.performer_name,
              ...linkedMembers.map((member) => member.stage_name),
              entry.role_category,
              entry.role_title,
            ].filter(Boolean).join(' ');
            (searchTextByEvent[entry.event_id] ??= []).push(text);
          });
          setLineupSearchText(
            Object.fromEntries(Object.entries(searchTextByEvent).map(([eventId, entries]) => [eventId, entries.join(' ')])),
          );
        }
      }

      setEvents(eventsList);
      setTicketPrices(prices);
      setLoading(false);
    })();
  }, []);

  const matchesEventSearch = (event: EventItem, query: string) => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return true;
    const date = new Date(`${event.date}T00:00:00`);
    const shortDate = Number.isNaN(date.getTime())
      ? ''
      : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
    const searchableText = [
      event.title,
      event.venue,
      event.location,
      event.date,
      formatDate(event.date),
      shortDate,
      event.time,
      event.date.slice(0, 4),
      lineupSearchText[event.id],
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').toLocaleLowerCase();
    return searchableText.includes(normalizedQuery);
  };
  const upcoming = events.filter((e) => getEventStatus(e.status, e.date) === 'upcoming' && matchesEventSearch(e, upcomingSearch));
  const completed = events
    .filter((e) => getEventStatus(e.status, e.date) === 'completed')
    .filter((e) => matchesEventSearch(e, completedSearch))
    .sort((a, b) => {
      const dateOrder = b.date.localeCompare(a.date);
      if (dateOrder !== 0) return dateOrder;
      const timeOrder = (b.time ?? '').localeCompare(a.time ?? '');
      if (timeOrder !== 0) return timeOrder;
      return (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.id.localeCompare(a.id);
    });
  const hasCompletedEvents = events.some((event) => getEventStatus(event.status, event.date) === 'completed');

  useEffect(() => {
    if (loading || window.location.hash !== '#completed-events' || !hasCompletedEvents) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById('completed-events');
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY - 96;
      window.scrollTo(0, Math.max(0, top));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hasCompletedEvents, loading]);

  useRestoreScrollPosition(router, !loading);

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Event" subtitle="Malam penuh tawa bersama komika terbaik Cilegon." />

      <div className="container-app py-6 space-y-8 sm:py-8 sm:space-y-10">
        {notificationParticipantId && notificationTargetError && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{notificationTargetError}</p>}
        <section data-scroll-reveal className="scroll-reveal">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-white">Mendatang</h2>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-blue-700">{upcoming.length}</span>
          </div>
          <div className="relative mb-4"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={upcomingSearch} onChange={(event) => setUpcomingSearch(event.target.value)} placeholder="Cari event mendatang..." className="input-field !pl-11" aria-label="Cari event mendatang" /></div>
          {lineupSearchError && <p role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Data pengisi acara belum dapat dimuat, sehingga pencarian nama komika mungkin tidak lengkap.</p>}
          {loading ? (
            <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0">
              <div className="min-w-[270px] max-w-[270px] snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none"><LoadingSkeleton count={1} /></div>
              <div className="min-w-[270px] max-w-[270px] snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none"><LoadingSkeleton count={1} /></div>
            </div>
          ) : loadError ? (
            <EmptyState title="Event belum dapat dimuat." description="Silakan coba lagi beberapa saat." />
          ) : upcoming.length === 0 ? (
            <EmptyState title="Belum ada event mendatang." noSmokeArea />
          ) : (
            <div className="flex gap-4 overflow-x-auto overscroll-x-contain pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:pb-0">
              {upcoming.map((e) => (
                <div key={e.id} className="min-w-[270px] max-w-[270px] shrink-0 snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none">
                  <EventCard event={e} router={router} price={ticketPrices[e.id] ?? (e.ticket_sales_mode === 'free' ? 0 : null)} />
                </div>
              ))}
            </div>
          )}
        </section>

        {hasCompletedEvents && (
          <section id="completed-events" data-scroll-reveal className="scroll-reveal scroll-mt-24 border-t border-white/20 pt-7 sm:pt-9">
            <div className="mb-5 flex flex-col gap-1.5 sm:mb-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-8 w-1 shrink-0 rounded-full bg-blue-700" />
                  <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Event Selesai</h2>
                </div>
                <span aria-label={`${completed.length} event selesai`} className="flex shrink-0 flex-col items-center text-white drop-shadow-[0_2px_10px_rgba(59,130,246,0.5)]">
                  <AnimatedEventCount value={completed.length} />
                  <span className="mt-1 text-[10px] font-extrabold uppercase leading-none tracking-[0.18em] sm:text-xs">EVENT</span>
                </span>
              </div>
              <p className="pl-4 text-sm text-slate-300">Kenangan dari panggung yang pernah kita ramaikan.</p>
            </div>
            <div className="relative mb-5 max-w-xl">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="search" value={completedSearch} onChange={(event) => setCompletedSearch(event.target.value)} placeholder="Cari riwayat event..." className="input-field !pl-11" aria-label="Cari riwayat event" />
            </div>
            {completed.length === 0 ? <EmptyState title="Riwayat event tidak ditemukan." /> : (
              <div className="grid min-w-0 grid-cols-2 items-start gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-4 xl:grid-cols-5">
                {completed.map((event) => (
                  <CompletedEventCard key={event.id} event={event} router={router} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function AnimatedEventCount({ value }: { value: number }) {
  const [count, setCount] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) {
      setCount(value);
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      hasAnimated.current = true;
      setCount(value);
      return;
    }

    const duration = 2000;
    const startedAt = performance.now();
    let frame = 0;
    const updateCount = (now: number) => {
      hasAnimated.current = true;
      const progress = Math.min((now - startedAt) / duration, 1);
      const easedProgress = progress ** 3 * (progress * (progress * 6 - 15) + 10);
      setCount(Math.round(value * easedProgress));
      if (progress < 1) frame = window.requestAnimationFrame(updateCount);
    };
    frame = window.requestAnimationFrame(updateCount);

    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return <span className="text-4xl font-black leading-none tabular-nums sm:text-5xl">{count}</span>;
}

function CompletedEventCard({ event, router }: { event: EventItem; router: Router }) {
  const [posterFailed, setPosterFailed] = useState(false);
  const location = [event.venue, event.location].filter(Boolean).join(' · ');
  const eventDate = new Date(`${event.date}T00:00:00`);
  const shortDate = Number.isNaN(eventDate.getTime())
    ? event.date || 'Tanggal belum tersedia'
    : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(eventDate).toUpperCase();

  return (
    <button
      type="button"
      onClick={() => router.navigate(`/event/${event.slug}`)}
      aria-label={`Lihat detail ${event.title}`}
      className="group w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4"
    >
      <span
        className="relative block w-full overflow-hidden rounded-none bg-slate-200 shadow-[0_8px_20px_rgba(15,23,42,0.14)] ring-1 ring-slate-900/10 transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_16px_30px_rgba(15,23,42,0.22)] group-hover:ring-blue-700/30"
        style={{ aspectRatio: '4 / 5' }}
      >
        {event.poster && !posterFailed ? (
          <img
            src={event.poster}
            alt={`Poster ${event.title}`}
            onError={() => setPosterFailed(true)}
            className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <EventPosterFallback />
        )}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-slate-950/40 to-transparent opacity-70" />
      </span>
      <span className="mt-1.5 block overflow-hidden text-base font-black uppercase leading-5 tracking-normal text-white transition-colors group-hover:text-blue-200 sm:text-lg sm:leading-6">
        <span className="line-clamp-2">{event.title}</span>
      </span>
      <span className="mt-0.5 block h-4 truncate text-[9px] font-extrabold tracking-normal text-amber-300 sm:text-[10px]">
        {shortDate}
      </span>
      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] font-medium leading-5 text-slate-200 sm:text-xs">
        <MapPin className="h-3 w-3 shrink-0 text-amber-300" />
        <span className="truncate">{location || 'Lokasi belum tersedia'}</span>
      </span>
    </button>
  );
}
