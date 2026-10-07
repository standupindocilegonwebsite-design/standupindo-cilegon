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
  const displayPrice = price === undefined ? event.ticket_price ?? 0 : price;
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
        className={`group w-full min-w-0 max-w-full cursor-pointer overflow-hidden ${isCompleted ? 'rounded-2xl border-2 border-slate-400 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]' : 'card card-hover rounded-[22px] border-2 border-amber-400 border-t-4 border-t-amber-700 bg-white shadow-[0_0_0_1px_rgba(245,158,11,0.18),0_10px_26px_rgba(245,158,11,0.2)]'}`}
        role="button"
        tabIndex={0}
      >
        <div className={isCompleted ? 'flex w-full min-w-0 items-stretch' : ''}>
        <div className={`relative overflow-hidden bg-slate-100 ${isCompleted ? 'aspect-[4/5] w-[30%] min-w-[88px] max-w-[150px] shrink-0 sm:aspect-[16/10] sm:w-[34%]' : 'aspect-[4/5] bg-slate-900'}`}>
          {event.poster && !posterFailed ? (
            <button
              onClick={() => isCompleted ? router.navigate(`/event/${event.slug}`) : setLightbox(true)}
              aria-label={isCompleted ? `Lihat Event ${event.title}` : `Lihat poster ${event.title}`}
              className="absolute inset-0 z-0 block h-full w-full"
            >
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
          {!isCompleted && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent px-3 pb-3 pt-20 sm:px-4 sm:pb-4 sm:pt-24">
              <p className="mb-2 w-fit rounded-sm bg-blue-600 px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white sm:text-xs">Event</p>
              <h3 className="mb-2 line-clamp-2 break-words text-left text-base font-extrabold leading-5 text-white sm:text-lg sm:leading-6">{event.title}</h3>
              <div className="space-y-1.5 text-left text-xs font-semibold leading-4 text-white sm:text-sm">
                <div className="flex w-fit max-w-full min-w-0 items-center gap-2 rounded-md border border-white/20 bg-slate-950/55 px-2 py-1 backdrop-blur-sm">
                  <Calendar className="h-4 w-4 shrink-0 text-sky-200" />
                  <span className="truncate drop-shadow-sm">{formatDate(event.date)}</span>
                </div>
                <div className="flex w-fit max-w-full min-w-0 items-center gap-2 rounded-md border border-white/20 bg-slate-950/55 px-2 py-1 backdrop-blur-sm">
                  <Clock className="h-4 w-4 shrink-0 text-sky-200" />
                  <span className="truncate drop-shadow-sm">{event.time} WIB</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={isCompleted ? 'flex min-w-0 flex-1 flex-col overflow-hidden p-3 sm:p-4' : 'p-3 sm:p-4'}>
          {isCompleted && <>
            <p className="mb-2 w-fit rounded-sm bg-blue-600 px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white sm:text-xs">Event</p>
            <h3 className="line-clamp-2 break-words text-base font-extrabold tracking-[-0.02em] text-slate-900 sm:text-lg">{event.title}</h3>
          </>}

          {isCompleted && <div className="mt-2 space-y-1.5 text-sm text-slate-600">
            <div className="flex min-w-0 items-center gap-2"><Calendar className="h-4 w-4 shrink-0 text-blue-600" /><span className="min-w-0 truncate">{formatDate(event.date)}</span></div>
            <div className="flex min-w-0 items-center gap-2"><Clock className="h-4 w-4 shrink-0 text-blue-600" /><span className="min-w-0 truncate">{event.time} WIB</span></div>
            <LocationLink venue={event.venue} location={event.location} mapsUrl={event.maps_url} className="mt-0.5 w-full min-w-0" />
          </div>}
          {!isCompleted && <LocationLink venue={event.venue} location={event.location} mapsUrl={event.maps_url} className="mb-2 w-full min-w-0" />}
          {!isCompleted ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {displayPrice !== null && (
                <div className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5">
                  <Ticket className="h-4 w-4 shrink-0 text-blue-700" />
                  <span className="text-sm font-extrabold leading-none text-slate-950">{formatPrice(displayPrice)}</span>
                </div>
              )}
              <NoSmokeAreaNotice />
            </div>
          ) : (
            <div className="mt-3">
              <NoSmokeAreaNotice compact />
            </div>
          )}

          {!isCompleted && event.description && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-500">{event.description}</p>}

          <div className={`${isCompleted ? 'mt-auto pt-3' : 'mt-2 border-t border-slate-100 pt-2'}`}>
            <button onClick={() => router.navigate(`/event/${event.slug}`)} className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-extrabold text-white shadow-[0_7px_16px_rgba(29,78,216,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(29,78,216,0.36)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:text-sm ${isCompleted ? '!rounded-lg bg-slate-800 hover:bg-slate-700' : 'bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-800 hover:to-blue-700'}`}>
              Lihat Event <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        </div>
      </article>
      {event.poster && !posterFailed && !isCompleted && (
        <ImageLightbox src={event.poster} alt={`${event.title} poster`} open={lightbox} onClose={() => setLightbox(false)} />
      )}
    </>
  );
}
