import { useState } from 'react';
import { Calendar, Clock, Users } from 'lucide-react';
import type { OpenMic } from '@/lib/types';
import type { Router } from '@/lib/router';
import { formatDate, getOpenMicStatus } from '@/lib/format';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationLink } from '@/components/ui/LocationLink';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { NoSmokeAreaNotice } from '@/components/ui/NoSmokeAreaNotice';

interface Props {
  mic: OpenMic;
  openMicNumber?: number;
  confirmedCount: number;
  lineup?: string[];
  router: Router;
  compact?: boolean;
}

export function OpenMicCard({ mic, openMicNumber, confirmedCount, lineup = [], router, compact = false }: Props) {
  const [lightbox, setLightbox] = useState(false);
  const filled = confirmedCount;
  const total = mic.capacity;
  const isFull = filled >= total;
  const currentStatus = getOpenMicStatus(mic.status, mic.date);
  const closed = mic.registration_status === 'closed' || currentStatus !== 'upcoming';
  const isCompleted = currentStatus === 'completed';

  if (compact) {
    return (
      <article
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a,button')) return;
          router.navigate(`/open-mic/${mic.slug}`);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            router.navigate(`/open-mic/${mic.slug}`);
          }
        }}
        className="group flex min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.08)] transition hover:border-blue-400 hover:shadow-[0_10px_24px_rgba(15,23,42,0.12)]"
        role="button"
        tabIndex={0}
      >
        <div className="relative h-auto min-h-[150px] w-24 shrink-0 self-stretch bg-slate-100 sm:w-28">
          {mic.poster ? (
            <img src={mic.poster} alt={`${mic.title} poster`} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <span className="flex h-full min-h-[150px] items-center justify-center text-slate-300"><Users className="h-8 w-8" /></span>
          )}
          <div className="absolute left-2 top-2"><StatusBadge status={currentStatus} /></div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-3.5">
          {openMicNumber !== undefined && <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-blue-700">Open Mic #{openMicNumber}</p>}
          <button onClick={() => router.navigate(`/open-mic/${mic.slug}`)} className="mt-0.5 text-left">
            <h3 className="line-clamp-2 text-sm font-extrabold leading-tight text-slate-900 transition group-hover:text-blue-700 sm:text-base">{mic.title}</h3>
          </button>
          <div className="mt-2 space-y-1 text-xs text-slate-600">
            <div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 shrink-0 text-blue-600" /><span className="truncate">{formatDate(mic.date)}</span></div>
            <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 shrink-0 text-blue-600" /><span className="truncate">{mic.time} WIB · {mic.venue}</span></div>
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 pt-2">
            <p className="truncate text-[11px] font-semibold text-slate-600">{isFull ? 'Slot penuh' : `${filled} Komika`}</p>
            <div className="flex shrink-0 gap-1.5">
              <button onClick={() => router.navigate(`/open-mic/${mic.slug}`)} className="btn-secondary !min-h-8 !rounded-lg !px-2 !py-1.5 text-[10px] font-bold">Detail</button>
              {currentStatus === 'upcoming' && !closed && !isFull && (
                <button onClick={() => router.navigate(`/open-mic/${mic.slug}/daftar`)} className="btn-primary !min-h-8 !rounded-lg !px-2 !py-1.5 text-[10px] font-bold">Daftar</button>
              )}
              {currentStatus === 'upcoming' && isFull && !closed && (
                <button disabled className="btn-secondary !min-h-8 !rounded-lg !border-red-200 !bg-red-50 !px-2 !py-1.5 text-[10px] font-bold !text-red-600">Penuh</button>
              )}
              {closed && currentStatus === 'upcoming' && (
                <button disabled className="btn-secondary !min-h-8 !rounded-lg !px-2 !py-1.5 text-[10px] font-bold !text-slate-400">Ditutup</button>
              )}
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <>
      <article
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a,button')) return;
          router.navigate(`/open-mic/${mic.slug}`);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            router.navigate(`/open-mic/${mic.slug}`);
          }
        }}
        className={`group cursor-pointer overflow-hidden ${isCompleted ? 'rounded-2xl border-[3px] border-slate-500 bg-white shadow-[0_14px_30px_rgba(15,23,42,0.2)] ring-1 ring-slate-300/80' : 'card card-hover flex flex-col border border-blue-300 border-t-4 border-t-blue-700 bg-white'}`}
        role="button"
        tabIndex={0}
      >
        <div className={isCompleted ? 'flex items-stretch' : ''}>
        <div className={`relative overflow-hidden bg-slate-100 ${isCompleted ? 'aspect-[16/10] w-[112px] shrink-0 border-r-2 border-slate-300 sm:w-[150px]' : 'aspect-[4/5]'}`}>
          {mic.poster ? (
            <button onClick={() => isCompleted ? router.navigate(`/open-mic/${mic.slug}`) : setLightbox(true)} aria-label={isCompleted ? `Buka detail ${mic.title}` : `Lihat poster ${mic.title}`} className="block h-full w-full">
              <img src={mic.poster} alt={`${mic.title} poster`} loading="lazy" className={`h-full w-full transition-transform duration-500 ${isCompleted ? 'object-cover grayscale group-hover:scale-105' : 'object-contain hover:scale-105'}`} />
            </button>
          ) : (
            <button onClick={() => router.navigate(`/open-mic/${mic.slug}`)} className="flex h-full w-full items-center justify-center text-slate-300"><Users className="h-8 w-8" /></button>
          )}
          <div className="absolute left-3 top-3">
            {isCompleted ? <span className="inline-flex items-center rounded-full bg-slate-800 px-3 py-1 text-xs font-extrabold text-white shadow-sm">Selesai</span> : <StatusBadge status={currentStatus} />}
          </div>
        </div>

        <div className={`flex min-w-0 flex-1 flex-col ${isCompleted ? 'p-3.5 sm:p-4' : 'p-4'}`}>
          <button onClick={() => router.navigate(`/open-mic/${mic.slug}`)} className="text-left">{openMicNumber !== undefined && <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Open Mic #{openMicNumber}</p>}<h3 className="line-clamp-2 text-base font-extrabold leading-tight text-slate-900 transition group-hover:text-blue-700 sm:text-lg">{mic.title}</h3></button>

          <div className="mt-2 space-y-1.5 text-sm text-slate-600">
            <div className="flex items-start gap-2"><Calendar className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /> <span>{formatDate(mic.date)}</span></div>
            <div className="flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /> <span>{mic.time} WIB</span></div>
            <LocationLink venue={mic.venue} location={mic.location} mapsUrl={mic.maps_url} className="mt-0.5 min-w-0" />
          </div>

          {isCompleted ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                router.navigate(`/open-mic/${mic.slug}#lineup`);
              }}
              aria-label={`Buka Arsip Lineup ${mic.title}`}
              className="mt-3 w-full border-t border-slate-300 pt-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Lineup</p>
              <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-700">{lineup.length > 0 ? lineup.join(' · ') : 'Belum ada data lineup'}</p>
            </button>
          ) : <p className="mt-3 text-sm font-semibold text-slate-700">{filled} Komika</p>}
          <div className={isCompleted ? 'mt-3' : 'mt-1'}>
            <NoSmokeAreaNotice compact={isCompleted} />
          </div>

          <div className={`flex gap-2 ${isCompleted ? 'mt-auto pt-3' : 'mt-4'}`}>
            <button onClick={() => router.navigate(`/open-mic/${mic.slug}`)} className={`${isCompleted ? 'btn-primary !rounded-lg !px-2.5 !py-2 text-[11px] sm:!text-xs' : 'btn-secondary !px-3 !py-2 text-[12px] sm:!text-sm'} flex-1 font-semibold`}>{isCompleted ? 'Detail' : 'Lihat Detail'}</button>
            {currentStatus === 'upcoming' && !closed && !isFull && (
              <button onClick={() => router.navigate(`/open-mic/${mic.slug}/daftar`)} className={`btn-primary flex-1 ${isCompleted ? '!rounded-lg !px-2.5 !py-2 text-[11px] sm:!text-xs' : '!px-3 !py-2 text-[12px] sm:!text-sm'} font-semibold shadow-[0_8px_18px_rgba(29,94,219,0.18)]`}>Daftar</button>
            )}
            {currentStatus === 'upcoming' && isFull && !closed && (
              <button disabled className="btn-secondary flex-1 !px-3 !py-2 text-[12px] font-semibold !text-red-600 !border-red-200 !bg-red-50 sm:!text-sm">Slot Penuh</button>
            )}
            {closed && currentStatus === 'upcoming' && (
              <button disabled className="btn-secondary flex-1 !px-3 !py-2 text-[12px] font-semibold !text-slate-400 sm:!text-sm">Ditutup</button>
            )}
          </div>
        </div>
        </div>
      </article>
      {mic.poster && !isCompleted && (
        <ImageLightbox src={mic.poster} alt={`${mic.title} poster`} open={lightbox} onClose={() => setLightbox(false)} />
      )}
    </>
  );
}
