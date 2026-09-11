import { useState } from 'react';
import { Calendar, Clock, Ticket } from 'lucide-react';
import type { EventItem } from '@/lib/types';
import type { Router } from '@/lib/router';
import { formatDate, formatPrice, getEventStatus } from '@/lib/format';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationLink } from '@/components/ui/LocationLink';
import { ImageLightbox } from '@/components/ui/ImageLightbox';

export function EventCard({ event, router, price }: { event: EventItem; router: Router; price?: number | null }) {
  const [lightbox, setLightbox] = useState(false);
  const currentStatus = getEventStatus(event.status, event.date);
  const displayPrice = price ?? event.ticket_price ?? 0;
  return (
    <>
      <article className="card card-hover group overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
        <div className="relative overflow-hidden bg-slate-100">
          {event.poster ? (
            <button onClick={() => setLightbox(true)} aria-label={`Lihat poster ${event.title}`} className="block h-full w-full">
              <img src={event.poster} alt={`${event.title} poster`} loading="lazy" className="aspect-[16/10] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
            </button>
          ) : (
            <button onClick={() => router.navigate(`/event/${event.slug}`)} className="block aspect-[16/10] w-full bg-slate-200" />
          )}
          <div className="absolute left-3 top-3">
            <StatusBadge status={currentStatus} />
          </div>
        </div>

        <div className="p-4">
          <h3 className="text-lg font-extrabold tracking-[-0.02em] text-slate-900">{event.title}</h3>

          <div className="mt-3 space-y-1.5 text-sm text-slate-500">
            <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-blue-600" /> {formatDate(event.date)}</div>
            <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-blue-600" /> {event.time} WIB</div>
            <LocationLink venue={event.venue} location={event.location} mapsUrl={event.maps_url} className="mt-0.5" />
            <div className="flex items-center gap-2"><Ticket className="h-4 w-4 text-blue-600" /> <span className="font-bold text-slate-900">{formatPrice(displayPrice)}</span></div>
          </div>

          {event.description && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-500">{event.description}</p>}

          <div className="mt-4 border-t border-slate-100 pt-3">
            <button onClick={() => router.navigate(`/event/${event.slug}`)} className="btn-secondary w-full !justify-center !px-3 !py-2 text-[12px] font-semibold sm:!text-sm">
              Lihat Event
            </button>
          </div>
        </div>
      </article>
      {event.poster && (
        <ImageLightbox src={event.poster} alt={`${event.title} poster`} open={lightbox} onClose={() => setLightbox(false)} />
      )}
    </>
  );
}
