import { useEffect, useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { EventItem, EventTicket } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { EventCard } from '@/components/cards/EventCard';
import { PageHeader } from '@/components/PageHeader';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { getEventStatus } from '@/lib/format';

export function EventPage({ router }: { router: Router }) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [ticketPrices, setTicketPrices] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: eventData }, { data: ticketData }] = await Promise.all([
        supabase.from('events').select('*').eq('published', true).order('date', { ascending: true }),
        supabase.from('event_tickets').select('event_id, price').order('price', { ascending: true }),
      ]);

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

  const filtered = useMemo(() => events.filter((e) => !search || e.title.toLowerCase().includes(search.toLowerCase())), [events, search]);
  const upcoming = filtered.filter((e) => getEventStatus(e.status, e.date) === 'upcoming');
  const completed = filtered.filter((e) => getEventStatus(e.status, e.date) === 'completed');

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Event" subtitle="Malam penuh tawa bersama komika terbaik Cilegon." />

      <div className="container-app py-6 space-y-8 sm:py-8 sm:space-y-10">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari event..." className="input-field !pl-11" aria-label="Cari event" />
        </div>

        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">Mendatang</h2>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-blue-700">{upcoming.length}</span>
          </div>
          {loading ? (
            <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0">
              <div className="min-w-[270px] max-w-[270px] snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none"><LoadingSkeleton count={1} /></div>
              <div className="min-w-[270px] max-w-[270px] snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none"><LoadingSkeleton count={1} /></div>
            </div>
          ) : upcoming.length === 0 ? (
            <EmptyState title="Belum ada event mendatang." />
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:pb-0">
              {upcoming.map((e) => (
                <div key={e.id} className="min-w-[270px] max-w-[270px] shrink-0 snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none">
                  <EventCard event={e} router={router} price={ticketPrices[e.id] ?? e.ticket_price ?? 0} />
                </div>
              ))}
            </div>
          )}
        </section>

        {completed.length > 0 && (
          <section className="border-t border-slate-200 pt-6 sm:pt-8">
            <h2 className="mb-4 text-xl font-bold text-slate-900">Selesai</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:pb-0">
              {completed.map((e) => (
                <div key={e.id} className="min-w-[270px] max-w-[270px] shrink-0 snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none">
                  <EventCard event={e} router={router} price={ticketPrices[e.id] ?? e.ticket_price ?? 0} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
