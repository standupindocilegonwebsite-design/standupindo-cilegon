import { useState } from 'react';
import { Calendar, Clock, Users } from 'lucide-react';
import type { OpenMic } from '@/lib/types';
import type { Router } from '@/lib/router';
import { formatDate, getOpenMicStatus } from '@/lib/format';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationLink } from '@/components/ui/LocationLink';
import { ImageLightbox } from '@/components/ui/ImageLightbox';

interface Props {
  mic: OpenMic;
  confirmedCount: number;
  lineup?: string[];
  router: Router;
}

export function OpenMicCard({ mic, confirmedCount, lineup = [], router }: Props) {
  const [lightbox, setLightbox] = useState(false);
  const filled = confirmedCount;
  const total = mic.capacity;
  const isFull = filled >= total;
  const currentStatus = getOpenMicStatus(mic.status, mic.date);
  const closed = mic.registration_status === 'closed' || currentStatus !== 'upcoming';
  const isCompleted = currentStatus === 'completed';

  return (
    <>
      <article className={`group overflow-hidden ${isCompleted ? 'rounded-2xl border border-slate-200 bg-slate-50/70' : 'card card-hover flex flex-col'}`}>
        <div className={isCompleted ? 'flex items-stretch' : ''}>
        <div className={`relative overflow-hidden bg-slate-100 ${isCompleted ? 'aspect-[16/10] w-[112px] shrink-0 grayscale-[0.35] sm:w-[150px]' : 'aspect-[16/10]'}`}>
          {mic.poster ? (
            <button onClick={() => setLightbox(true)} aria-label={`Lihat poster ${mic.title}`} className="block h-full w-full">
              <img src={mic.poster} alt={`${mic.title} poster`} loading="lazy" className={`h-full w-full transition-transform duration-500 ${isCompleted ? 'object-cover group-hover:scale-105' : 'object-contain hover:scale-105'}`} />
            </button>
          ) : (
            <button onClick={() => router.navigate(`/open-mic/${mic.slug}`)} className="flex h-full w-full items-center justify-center text-slate-300"><Users className="h-8 w-8" /></button>
          )}
          <div className="absolute left-3 top-3">
            <StatusBadge status={currentStatus} />
          </div>
        </div>

        <div className={`flex min-w-0 flex-1 flex-col ${isCompleted ? 'p-3.5 sm:p-4' : 'p-4'}`}>
          <button onClick={() => router.navigate(`/open-mic/${mic.slug}`)} className="text-left"><h3 className="line-clamp-2 text-base font-extrabold leading-tight text-slate-900 transition group-hover:text-blue-700 sm:text-lg">{mic.title}</h3></button>

          <div className="mt-2 space-y-1.5 text-sm text-slate-500">
            <div className="flex items-start gap-2"><Calendar className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /> <span>{formatDate(mic.date)}</span></div>
            <div className="flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /> <span>{mic.time} WIB</span></div>
            <LocationLink venue={mic.venue} location={mic.location} mapsUrl={mic.maps_url} className="mt-0.5 min-w-0" />
          </div>

          {isCompleted ? (
            <div className="mt-3 border-t border-slate-200 pt-2.5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Lineup</p><p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-600">{lineup.length > 0 ? lineup.join(' · ') : 'Belum ada data lineup'}</p></div>
          ) : <p className="mt-3 text-sm font-semibold text-slate-700">{filled} Komika</p>}

          <div className={`flex gap-2 ${isCompleted ? 'mt-auto pt-3' : 'mt-4'}`}>
            <button onClick={() => router.navigate(`/open-mic/${mic.slug}`)} className={`btn-secondary flex-1 ${isCompleted ? '!rounded-lg !px-2.5 !py-2 text-[11px] sm:!text-xs' : '!px-3 !py-2 text-[12px] sm:!text-sm'} font-semibold`}>{isCompleted ? 'Detail' : 'Lihat Detail'}</button>
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
      {mic.poster && (
        <ImageLightbox src={mic.poster} alt={`${mic.title} poster`} open={lightbox} onClose={() => setLightbox(false)} />
      )}
    </>
  );
}
