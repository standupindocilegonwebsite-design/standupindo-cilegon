import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
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
      const [{ data: eventData, error: eventError }, { data: ticketData }] = await Promise.all([
        supabase.from('events').select('*').eq('published', true).order('date', { ascending: true }),
        supabase.from('event_tickets').select('event_id, price').order('price', { ascending: true }),
      ]);

      setLoadError(Boolean(eventError));
      const eventsList = (eventData as EventItem[]) ?? [];
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
      return (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.id.localeCompare(a.id);
    })
    .slice(0, completedSearch.trim() ? undefined : 5);
  const hasCompletedEvents = events.some((event) => getEventStatus(event.status, event.date) === 'completed');

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Event" subtitle="Malam penuh tawa bersama komika terbaik Cilegon." />

      <div className="container-app py-6 space-y-8 sm:py-8 sm:space-y-10">
        <section data-scroll-reveal className="scroll-reveal">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">Mendatang</h2>
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
            <div className="flex touch-pan-x gap-4 overflow-x-auto overscroll-x-contain pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:pb-0">
              {upcoming.map((e) => (
                <div key={e.id} className="min-w-[270px] max-w-[270px] shrink-0 snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none">
                  <EventCard event={e} router={router} price={ticketPrices[e.id] ?? e.ticket_price ?? 0} />
                </div>
              ))}
            </div>
          )}
        </section>

        {hasCompletedEvents && (
          <section data-scroll-reveal className="scroll-reveal border-t border-slate-200 pt-6 sm:pt-8">
            <div className="mb-4 flex items-center gap-3"><span className="h-8 w-1 rounded-full bg-slate-400" /><h2 className="text-xl font-extrabold text-slate-900">Selesai</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{completed.length}</span></div>
            <div className="relative mb-4"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={completedSearch} onChange={(event) => setCompletedSearch(event.target.value)} placeholder="Cari riwayat event..." className="input-field !pl-11" aria-label="Cari riwayat event" /></div>
            {completed.length === 0 ? <EmptyState title="Riwayat event tidak ditemukan." /> : <div className="grid gap-3 lg:grid-cols-2">
              {completed.map((e) => (
                <div key={e.id}>
                  <EventCard event={e} router={router} price={ticketPrices[e.id] ?? e.ticket_price ?? 0} />
                </div>
              ))}
            </div>}
          </section>
        )}
      </div>
    </div>
  );
}
