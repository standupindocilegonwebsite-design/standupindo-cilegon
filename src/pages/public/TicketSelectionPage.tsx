import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Clock3, ExternalLink, MapPin, Ticket } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { EventItem, EventTicket } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { formatDate, formatPrice, getEventStatus } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';

interface Props {
  router: Router;
  slug: string;
}

interface TicketAvailability {
  ticket_id: string;
  sold_out: boolean;
  temporarily_unavailable: boolean;
}

export function TicketSelectionPage({ router, slug }: Props) {
  const [event, setEvent] = useState<EventItem | null>(null);
  const [tickets, setTickets] = useState<EventTicket[]>([]);
  const [ticketAvailability, setTicketAvailability] = useState<Map<string, TicketAvailability>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('slug', slug)
        .eq('published', true)
        .maybeSingle();
      const eventRow = eventData as EventItem | null;
      if (!active) return;
      if (eventError) {
        setLoadError('Informasi event gagal dimuat. Coba segarkan halaman.');
        setLoading(false);
        return;
      }
      setEvent(eventRow);

      if (eventRow && getEventStatus(eventRow.status, eventRow.date) === 'upcoming') {
        const { data: ticketData, error: ticketError } = await supabase
          .from('event_tickets')
          .select('*')
          .eq('event_id', eventRow.id)
          .eq('status', 'active')
          .eq('available_public', true)
          .order('sort_order', { ascending: true })
          .order('price', { ascending: true });
        if (ticketError) {
          if (active) setLoadError('Daftar tiket publik gagal dimuat. Coba segarkan halaman.');
          if (active) setLoading(false);
          return;
        }
        const publicTickets = (ticketData as EventTicket[]) ?? [];
        if (publicTickets.length > 0) {
          const { data: availabilityData, error: availabilityError } = await supabase.functions.invoke<{
            availability?: TicketAvailability[];
            error?: string;
          }>('ticketing-public', { body: { action: 'ticket-availability', event_id: eventRow.id } });
          if (availabilityError || availabilityData?.error || !Array.isArray(availabilityData?.availability)) {
            if (active) setLoadError(availabilityError?.message ?? availabilityData?.error ?? 'Ketersediaan tiket gagal diperiksa. Coba segarkan halaman.');
            if (active) setLoading(false);
            return;
          }
          const availability = availabilityData.availability;
          if (publicTickets.some((ticket) => !availability.some((item) => item.ticket_id === ticket.id))) {
            if (active) setLoadError('Ketersediaan tiket gagal diperiksa. Coba segarkan halaman.');
            if (active) setLoading(false);
            return;
          }
          if (active) {
            setTickets(publicTickets);
            setTicketAvailability(new Map(availability.map((item) => [item.ticket_id, item])));
          }
        }
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [slug]);

  const backToEvent = `/event/${slug}`;
  const pageTitle = loading ? 'Akses Acara' : event?.title ?? 'Event tidak ditemukan';
  const availableTickets = tickets.filter((ticket) => !ticketAvailability.get(ticket.id)?.sold_out);

  if (loading) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title="Akses Acara" backTo={backToEvent} />
        <div className="container-app py-8"><LoadingSkeleton count={2} /></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title="Akses Acara" subtitle={event?.title} backTo={backToEvent} />
        <div className="container-app py-8"><p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{loadError}</p></div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title="Event tidak ditemukan" backTo={backToEvent} />
        <div className="container-app py-8"><EmptyState title="Event tidak ditemukan." /></div>
      </div>
    );
  }

  if (getEventStatus(event.status, event.date) !== 'upcoming') {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title={pageTitle} subtitle="Akses Acara" backTo={backToEvent} />
        <div className="container-app py-8"><EmptyState title="Event ini sudah tidak menerima pemesanan tiket." /></div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Akses Acara" subtitle={event.title} backTo={backToEvent} />
      <div className="container-app space-y-6 py-6 sm:py-8">
        <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.05)]">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-blue-50/80 to-white px-4 py-4 sm:gap-4 sm:px-5">
            {event.poster ? (
              <img src={event.poster} alt={`Poster ${event.title}`} className="h-24 w-[4.5rem] shrink-0 rounded-xl border border-white object-contain shadow-sm sm:h-28 sm:w-20" />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><CalendarDays className="h-6 w-6" /></span>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Event yang dipilih</p>
              <h2 className="mt-1 line-clamp-2 font-extrabold leading-snug text-slate-900 sm:text-lg">{event.title}</h2>
              <p className="mt-2 flex flex-col gap-1.5 text-xs font-medium text-slate-600 sm:flex-row sm:flex-wrap sm:gap-x-3">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-blue-600" />{formatDate(event.date)}</span>
                <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 shrink-0 text-blue-600" />{event.time} WIB</span>
                <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0 text-blue-600" /><span className="line-clamp-2">{event.venue}{event.location ? `, ${event.location}` : ''}</span></span>
              </p>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Akses Acara</p>
              <h2 className="mt-1 text-xl font-extrabold text-slate-900">Pilih Tiket</h2>
            </div>
            {tickets.length === 0 ? (
              <EmptyState title={event.ticket_price <= 0 ? 'Acara ini gratis dan tidak memerlukan tiket.' : 'Tiket publik belum tersedia.'} />
            ) : availableTickets.length === 0 ? (
              <EmptyState title="Semua tiket publik untuk acara ini sudah habis terjual." />
            ) : (
              <div className="grid gap-3 sm:gap-4">
                {availableTickets.map((ticket) => {
                  const externalTicketUrl = ticket.ticket_url && /^https?:\/\//i.test(ticket.ticket_url)
                    ? ticket.ticket_url
                    : null;
                  const temporarilyUnavailable = ticketAvailability.get(ticket.id)?.temporarily_unavailable ?? false;
                  return (
                    <article key={ticket.id} className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.045)] transition hover:border-blue-200 hover:shadow-[0_10px_24px_rgba(37,99,235,0.1)]">
                      <div className="flex items-start gap-3 bg-gradient-to-r from-blue-50/80 via-white to-white p-4 sm:items-center sm:gap-4 sm:p-5">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-[0_5px_12px_rgba(37,99,235,0.22)]"><Ticket className="h-5 w-5" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-blue-700">Kategori Tiket</p>
                          <h3 className="mt-0.5 break-words text-base font-extrabold text-slate-900 sm:text-lg">{ticket.name}</h3>
                          {ticket.description && <p className="mt-1.5 whitespace-pre-line text-xs leading-5 text-slate-600 sm:text-sm">{ticket.description}</p>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3.5 sm:px-5">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Harga tiket</p>
                          <p className="mt-0.5 text-xl font-black tracking-tight text-slate-900">{formatPrice(ticket.price)}</p>
                        </div>
                        {temporarilyUnavailable ? (
                          <p role="status" className="max-w-xs text-right text-xs font-semibold leading-5 text-amber-800">
                            Sudah ada pesanan untuk tiket ini. Sedang menunggu pembayaran atau verifikasi admin; pemesanan sementara ditutup.
                          </p>
                        ) : externalTicketUrl ? (
                          <a href={externalTicketUrl} target="_blank" rel="noopener noreferrer" className="btn-primary !min-h-11 !rounded-xl !px-4 !py-2.5 text-sm">
                            <ExternalLink className="h-4 w-4" /> Beli
                          </a>
                        ) : (
                          <button type="button" onClick={() => router.navigate(`/event/${event.slug}/tiket/${ticket.id}`)} className="btn-primary !min-h-11 !rounded-xl !px-4 !py-2.5 text-sm">
                            Pilih <ArrowRight className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
