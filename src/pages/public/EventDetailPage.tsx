import { useEffect, useState } from 'react';
import { Calendar, Clock, ExternalLink, MessageCircle, Ticket } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { EventItem, EventTicket, SiteSettings } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SocialIconButton } from '@/components/ui/SocialIconButton';
import { LocationLink } from '@/components/ui/LocationLink';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { ShareButton } from '@/components/ui/ShareButton';
import { formatDate, formatPrice, getEventStatus, waLink } from '@/lib/format';

interface Props {
  router: Router;
  slug: string;
  settings: SiteSettings;
}

function setOgTags(title: string, description: string, image: string, url: string) {
  const set = (prop: string, val: string) => {
    let el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
    if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el); }
    el.setAttribute('content', val);
  };
  set('og:title', title);
  set('og:description', description);
  set('og:image', image);
  set('og:url', url);
}

export function EventDetailPage({ router, slug, settings }: Props) {
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<EventItem | null>(null);
  const [tickets, setTickets] = useState<EventTicket[]>([]);
  const [lineup, setLineup] = useState<{ id: string; stage_name: string; community: string | null; instagram: string | null }[]>([]);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('events').select('*').eq('slug', slug).eq('published', true).maybeSingle();
      const ev = data as EventItem | null;
      setEvent(ev);

      if (ev) {
        const { data: ticketData } = await supabase.from('event_tickets').select('*').eq('event_id', ev.id).order('sort_order', { ascending: true }).order('price', { ascending: true });
        setTickets((ticketData as EventTicket[]) ?? []);

        const { data: participantData } = await supabase
          .from('event_participants')
          .select('id, stage_name, community, instagram')
          .eq('event_id', ev.id)
          .eq('status', 'approved')
          .order('created_at', { ascending: true });
        setLineup((participantData as { id: string; stage_name: string; community: string | null; instagram: string | null }[]) ?? []);

        const pageUrl = `${window.location.origin}/event/${ev.slug}`;
        setOgTags(
          `${ev.title} — Standupindo Cilegon`,
          `Yuk hadir di ${ev.title} bersama Standupindo Cilegon.`,
          ev.poster ?? `${window.location.origin}/assets/images/Standupindo_CIlegon_Logo.jpeg`,
          pageUrl,
        );
      }
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} />
        <div className="container-app py-8"><LoadingSkeleton count={1} /></div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title="Event tidak ditemukan" />
        <div className="container-app py-8"><EmptyState title="Event tidak ditemukan" /></div>
      </div>
    );
  }

  const waMessage = event.whatsapp_message ?? `Halo Admin Standupindo Cilegon, saya ingin membeli tiket ${event.title}.`;
  const buyTicketNumber = event.whatsapp_number || settings.whatsapp_ticket || settings.whatsapp_admin;
  const cheapestTicketPrice = tickets.length > 0 ? tickets.reduce((lowest, ticket) => ticket.price < lowest.price ? ticket : lowest, tickets[0]).price : (event.ticket_price ?? 0);
  const pageUrl = `${window.location.origin}/event/${event.slug}`;
  const currentStatus = getEventStatus(event.status, event.date);

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title={event.title} />

      <div className="container-app py-8 space-y-10">
        {/* Poster + meta */}
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-2xl bg-slate-100 shadow-soft">
              {event.poster ? (
                <button onClick={() => setLightbox(true)} aria-label={`Lihat poster ${event.title}`} className="block w-full">
                  <img src={event.poster} alt={`${event.title} poster`} className="aspect-[4/3] w-full object-contain transition-transform duration-500 hover:scale-105" />
                </button>
              ) : (
                <div className="aspect-[4/3] w-full" />
              )}
            </div>
          </div>
          <div className="lg:col-span-3 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge status={currentStatus} />
              <ShareButton
                title={`${event.title} — Standupindo Cilegon`}
                text={`Yuk hadir di ${event.title} bersama Standupindo Cilegon.`}
                url={pageUrl}
                image={event.poster}
              />
            </div>
            <div className="space-y-2.5 text-sm text-slate-600">
              <div className="flex items-center gap-2.5"><Calendar className="h-5 w-5 text-blue-600" /> {formatDate(event.date)}</div>
              <div className="flex items-center gap-2.5"><Clock className="h-5 w-5 text-blue-600" /> {event.time} WIB</div>
              <LocationLink venue={event.venue} location={event.location} mapsUrl={event.maps_url} className="items-center gap-2.5" />
              <div className="flex items-center gap-2.5"><Ticket className="h-5 w-5 text-blue-600" /> <span className="font-bold text-slate-900">{formatPrice(cheapestTicketPrice)}</span></div>
            </div>

            {currentStatus === 'upcoming' && (
              <div className="space-y-2">
                {tickets.length === 0 && <a href={waLink(buyTicketNumber, waMessage)} target="_blank" rel="noopener noreferrer" className="btn-primary w-full !py-3.5 text-base">
                  <MessageCircle className="h-5 w-5" /> Beli Tiket via WhatsApp
                </a>}
                {event.registration_status === 'open' && <button onClick={() => router.navigate(`/event/${event.slug}/daftar`)} className="btn-secondary w-full !py-3.5 text-base">Daftar sebagai Peserta</button>}
              </div>
            )}
          </div>
        </div>

        {/* About */}
        {event.description && (
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">About Event</h2>
            <p className="text-sm leading-relaxed text-slate-600 sm:text-base whitespace-pre-line">{event.description}</p>
          </section>
        )}

        {/* Lineup */}
        {lineup.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-4">Lineup</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {lineup.map((k) => (
                <div key={k.id} className="card flex items-center gap-3 p-4">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100">
                    <div className="flex h-full w-full items-center justify-center bg-blue-100 text-lg font-bold text-blue-700">{k.stage_name.charAt(0)}</div>
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-slate-900">{k.stage_name}</h3>
                    {k.community && <p className="mt-0.5 truncate text-xs text-slate-500">{k.community}</p>}
                    <div className="mt-1.5"><SocialIconButton instagram={k.instagram} size="sm" /></div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tickets */}
        <section className="border-t border-slate-200 pt-8 sm:pt-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Akses acara</p>
              <h2 className="mt-1 text-xl font-extrabold text-slate-900 sm:text-2xl">Pilih tiket</h2>
            </div>
            {tickets.length > 0 && <span className="text-right text-xs font-semibold text-slate-500">{tickets.length} pilihan tersedia</span>}
          </div>
          {tickets.length === 0 ? (
            <EmptyState title="Informasi tiket segera hadir." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
              {tickets.map((t) => {
                const ticketWaMsg = `Halo Admin Standupindo Cilegon, saya mau membeli tiket [${t.name}] untuk event ${event.title}. Bagaimana cara pembeliannya?`;
                const hasUrl = t.ticket_url && /^https?:\/\//i.test(t.ticket_url);
                return (
                  <div key={t.id} className="grid gap-4 border-b border-slate-100 p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6 sm:p-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Ticket className="h-4 w-4" /></div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900">{t.name}</h3>
                        {t.description && <p className="mt-1 text-xs leading-5 text-slate-500">{t.description}</p>}
                      </div>
                    </div>
                    <span className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-right">{formatPrice(t.price)}</span>
                    {currentStatus === 'upcoming' && (
                      hasUrl ? (
                        <a href={t.ticket_url!} target="_blank" rel="noopener noreferrer" aria-label={`Beli tiket ${t.name} melalui link ticketing`} title="Beli melalui link ticketing" className="btn-primary !min-h-10 !rounded-xl !px-4 !py-2.5 text-sm">
                          <ExternalLink className="h-4 w-4" /> <span>Beli</span>
                        </a>
                      ) : (
                        <a href={waLink(buyTicketNumber, ticketWaMsg)} target="_blank" rel="noopener noreferrer" aria-label={`Beli tiket ${t.name} melalui WhatsApp`} title="Beli melalui WhatsApp" className="btn-primary !min-h-10 !rounded-xl !px-4 !py-2.5 text-sm">
                          <MessageCircle className="h-4 w-4" /> <span>Beli</span>
                        </a>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {event.poster && (
        <ImageLightbox src={event.poster} alt={`${event.title} poster`} open={lightbox} onClose={() => setLightbox(false)} />
      )}
    </div>
  );
}
