import { useState } from 'react';
import { ArrowRight, Calendar, Clock, Ticket } from 'lucide-react';
import type { EventItem } from '@/lib/types';
import type { Router } from '@/lib/router';
import { formatDate, formatPrice, getEventStatus } from '@/lib/format';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationLink } from '@/components/ui/LocationLink';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { NoSmokeAreaNotice } from '@/components/ui/NoSmokeAreaNotice';

export function EventCard({ event, router, price }: { event: EventItem; router: Router; price?: number | null }) {
  const [lightbox, setLightbox] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const currentStatus = getEventStatus(event.status, event.date);
  const displayPrice = price ?? event.ticket_price ?? 0;
  const isCompleted = currentStatus === 'completed';
  return (
    <>
      <article
        onClick={(clickEvent) => {
          if ((clickEvent.target as HTMLElement).closest('a,button')) return;
          router.navigate(`/event/${event.slug}`);
        }}
        onKeyDown={(keyEvent) => {
          if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
            keyEvent.preventDefault();
            router.navigate(`/event/${event.slug}`);
          }
        }}
        className={`group cursor-pointer overflow-hidden ${isCompleted ? 'rounded-2xl border-2 border-slate-500 bg-slate-50 shadow-[0_8px_20px_rgba(15,23,42,0.12)]' : 'card card-hover rounded-[22px] border-2 border-amber-400 border-t-4 border-t-amber-700 bg-white shadow-[0_0_0_1px_rgba(245,158,11,0.18),0_10px_26px_rgba(245,158,11,0.2)]'}`}
        role="button"
        tabIndex={0}
      >
        <div className={isCompleted ? 'flex items-stretch' : ''}>
        <div className={`relative overflow-hidden bg-slate-100 ${isCompleted ? 'aspect-[16/10] w-[112px] shrink-0 sm:w-[150px]' : 'aspect-[4/5]'}`}>
          {event.poster && !posterFailed ? (
            <button onClick={() => setLightbox(true)} aria-label={`Lihat poster ${event.title}`} className="block h-full w-full">
              <img
                src={event.poster}
                alt={`${event.title} poster`}
                onError={() => setPosterFailed(true)}
                className={`h-full w-full transition-transform duration-500 ${isCompleted ? 'object-cover grayscale group-hover:scale-105' : 'aspect-[4/5] object-contain group-hover:scale-[1.03]'}`}
              />
            </button>
          ) : (
            <button onClick={() => router.navigate(`/event/${event.slug}`)} className={`flex w-full items-center justify-center bg-slate-100 text-sm font-semibold text-slate-400 ${isCompleted ? 'h-full' : 'aspect-[4/5]'}`}>
              Poster belum tersedia
            </button>
          )}
          <div className="absolute left-3 top-3">
            <StatusBadge status={currentStatus} />
          </div>
        </div>

        <div className={isCompleted ? 'flex min-w-0 flex-1 flex-col p-3.5 sm:p-4' : 'p-4'}>
          <h3 className="line-clamp-2 text-lg font-extrabold tracking-[-0.02em] text-slate-900">{event.title}</h3>

          <div className="mt-2 space-y-1.5 text-sm text-slate-600">
            <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-blue-600" /> {formatDate(event.date)}</div>
            <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-blue-600" /> {event.time} WIB</div>
            <LocationLink venue={event.venue} location={event.location} mapsUrl={event.maps_url} className="mt-0.5" />
            {!isCompleted && <div className="flex items-center gap-2"><Ticket className="h-4 w-4 text-blue-600" /> <span className="font-bold text-slate-900">{formatPrice(displayPrice)}</span></div>}
          </div>
          <div className="mt-3">
            <NoSmokeAreaNotice />
          </div>

          {!isCompleted && event.description && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-500">{event.description}</p>}

          <div className={`${isCompleted ? 'mt-auto pt-3' : 'mt-4 border-t border-slate-100 pt-3'}`}>
            <button onClick={() => router.navigate(`/event/${event.slug}`)} className={`w-full !justify-center !px-3 !py-2.5 text-[12px] font-bold shadow-[0_6px_14px_rgba(29,78,216,0.2)] transition hover:-translate-y-0.5 sm:!text-sm ${isCompleted ? 'btn-primary !rounded-lg !border-slate-800 !bg-slate-800 !text-white hover:!bg-slate-700' : 'btn-primary !rounded-xl'}`}>
              Lihat Event <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        </div>
      </article>
      {event.poster && !posterFailed && (
        <ImageLightbox src={event.poster} alt={`${event.title} poster`} open={lightbox} onClose={() => setLightbox(false)} />
      )}
    </>
  );
}
