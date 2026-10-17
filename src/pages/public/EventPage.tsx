import { useEffect, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { EventItem, EventTicket } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { EventCard } from '@/components/cards/EventCard';
import { PageHeader } from '@/components/PageHeader';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, getEventStatus } from '@/lib/format';

export function EventPage({ router }: { router: Router }) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [ticketPrices, setTicketPrices] = useState<Record<string, number>>({});
  const [upcomingSearch, setUpcomingSearch] = useState('');
  const [completedSearch, setCompletedSearch] = useState('');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    (async () => {
      const loadPublishedEvents = async () => {
        const pageSize = 1000;
        const allEvents: EventItem[] = [];

        for (let from = 0; ; from += pageSize) {
          const { data, error } = await supabase
            .from('events')
            .select('*')
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
      const prices: Record<string, number> = {};

      (ticketData as EventTicket[] | null)?.forEach((ticket) => {
        const current = prices[ticket.event_id];
        if (current === undefined || ticket.price < current) {
          prices[ticket.event_id] = ticket.price;
        }
      });

      setEvents(eventsList);
      setTicketPrices(prices);
      setLoading(false);
    })();
  }, []);

  const matchesSearch = (event: EventItem, query: string) => !query.trim() || `${event.title} ${event.venue} ${event.location} ${event.date} ${formatDate(event.date)}`.toLowerCase().includes(query.trim().toLowerCase());
  const upcoming = events.filter((e) => getEventStatus(e.status, e.date) === 'upcoming' && matchesSearch(e, upcomingSearch));
  const completed = events
    .filter((e) => getEventStatus(e.status, e.date) === 'completed')
    .filter((e) => matchesSearch(e, completedSearch))
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

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Event" subtitle="Malam penuh tawa bersama komika terbaik Cilegon." />

      <div className="container-app py-6 space-y-8 sm:py-8 sm:space-y-10">
        <section data-scroll-reveal className="scroll-reveal">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-white">Mendatang</h2>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-blue-700">{upcoming.length}</span>
          </div>
          <div className="relative mb-4"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={upcomingSearch} onChange={(event) => setUpcomingSearch(event.target.value)} placeholder="Cari event mendatang..." className="input-field !pl-11" aria-label="Cari event mendatang" /></div>
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
                  <EventCard event={e} router={router} price={ticketPrices[e.id] ?? null} />
                </div>
              ))}
            </div>
          )}
        </section>

        {hasCompletedEvents && (
          <section id="completed-events" data-scroll-reveal className="scroll-reveal scroll-mt-24 border-t border-white/20 pt-7 sm:pt-9">
            <div className="mb-5 flex flex-col gap-1.5 sm:mb-6">
              <div className="flex items-center gap-3">
                <span className="h-8 w-1 rounded-full bg-blue-700" />
                <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Event Selesai</h2>
                <span aria-label={`${completed.length} event selesai`} className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-blue-400 bg-blue-600 px-2 text-sm font-black text-white shadow-[0_4px_12px_rgba(37,99,235,0.35)]">{completed.length}</span>
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
          <span className="flex h-full items-center justify-center bg-gradient-to-br from-slate-800 to-blue-950 px-3 text-center text-sm font-bold text-white/80">
            Poster belum tersedia
          </span>
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
