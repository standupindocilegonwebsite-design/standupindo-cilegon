import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Clock3, ExternalLink, Info, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCcsDate, formatCcsTime, getCcsMapsUrl, getCcsOccurrenceDate, getCcsRecurrenceLabel, isUpcomingCcsSchedule } from '@/lib/ccs';
import type { CcsSchedule } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';

export function CcsScheduleHighlights({ compact = false }: { compact?: boolean }) {
  const [schedules, setSchedules] = useState<CcsSchedule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mapsSchedule, setMapsSchedule] = useState<CcsSchedule | null>(null);
  const [showCcsInfo, setShowCcsInfo] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase
        .from('ccs_schedules')
        .select('id, title, event_date, start_time, venue, maps_url, poster_url, is_published, created_at, updated_at')
        .eq('is_published', true)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true, nullsFirst: false })
        .limit(1);

      if (!active) return;
      if (error) {
        console.error('Jadwal CCS gagal dimuat.', error);
      } else {
        setSchedules(((data ?? []) as CcsSchedule[]).filter((schedule) => isUpcomingCcsSchedule(schedule)).slice(0, 3));
      }
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!loaded || schedules.length === 0) return null;

  return (
    <section className={compact ? 'rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_5px_16px_rgba(15,23,42,0.06)]' : 'w-full'}>
      {compact ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold uppercase text-slate-900">Jadwal Cilegon Comedy Sharing</h2>
          </div>
          <span className="shrink-0 rounded-full bg-blue-100 px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-blue-800">CCS</span>
        </div>
      ) : null}
      <div className={compact ? 'grid gap-2' : 'grid gap-4'}>
        {schedules.map((schedule) => {
          const mapsUrl = getCcsMapsUrl(schedule);
          const time = formatCcsTime(schedule.start_time);
          if (compact) {
            return (
              <button key={schedule.id} type="button" onClick={() => setMapsSchedule(schedule)} aria-label={`Lihat lokasi ${schedule.title} di Maps`} className="grid min-h-[84px] w-full grid-cols-[88px_minmax(0,1fr)_16px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-left transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                {schedule.poster_url ? (
                  <span className="h-[78px] w-[88px] overflow-hidden rounded-md bg-white">
                    <img src={schedule.poster_url} alt={`Poster ${schedule.title}`} width={800} height={1000} loading="lazy" className="h-full w-full object-cover" />
                  </span>
                ) : (
                  <div className="flex h-[78px] w-[88px] shrink-0 items-center justify-center rounded-md bg-[#092455] text-[10px] font-extrabold text-white">CCS</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-extrabold leading-tight text-slate-900">{schedule.title}</p>
                  <p className="mt-1 text-xs font-bold text-blue-700">{getCcsRecurrenceLabel(schedule)}</p>
                  <div className="mt-1 space-y-0.5 text-[11px] font-medium leading-tight text-slate-600">
                    <p className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-blue-600" />{formatCcsDate(getCcsOccurrenceDate(schedule))}{time && <><span className="text-slate-400">·</span><Clock3 className="h-3.5 w-3.5 shrink-0 text-blue-600" />{time}</>}</p>
                    {schedule.venue && <p className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0 text-blue-600" /><span className="truncate">{schedule.venue}</span></p>}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-blue-600" />
              </button>
            );
          }
          return (
            <div key={schedule.id} className="group/ccs relative isolate min-w-0 px-1 pb-1">
              <span aria-hidden="true" className="pointer-events-none absolute inset-1 translate-x-2 translate-y-2 rounded-2xl bg-gradient-to-br from-sky-400 via-blue-600 to-blue-900 shadow-[0_10px_20px_rgba(29,78,216,0.3)] transition-transform duration-300 group-hover/ccs:translate-x-2.5 group-hover/ccs:translate-y-2.5" />
              <article className="relative z-10 overflow-hidden rounded-2xl bg-white shadow-[0_14px_30px_rgba(11,31,68,0.2)]">
              <div className="relative flex min-w-0 items-center justify-between gap-3 bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 px-4 py-3.5 text-white sm:px-5 lg:justify-center lg:px-10 lg:py-5">
                <div className="min-w-0 lg:text-center">
                  <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-blue-200 sm:text-[10px]">Standupindo Cilegon</p>
                  <h2 className="mt-0.5 break-words text-xs font-black leading-snug sm:text-sm lg:text-2xl lg:tracking-normal">Jadwal Cilegon Comedy Sharing</h2>
                </div>
                <span className="shrink-0 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.14em] text-white sm:px-3 sm:text-[10px] lg:absolute lg:right-6">CCS</span>
              </div>
              <div className={schedule.poster_url ? 'lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]' : ''}>
              {schedule.poster_url && (
                <div className="overflow-hidden bg-slate-50 lg:flex lg:min-h-[480px] lg:items-center lg:justify-center lg:p-5">
                  <img src={schedule.poster_url} alt={`Poster ${schedule.title}`} width={800} height={1000} loading="lazy" className="block h-auto w-full lg:max-h-[600px] lg:object-contain" />
                </div>
              )}
              <div className="space-y-2.5 bg-white p-3.5 sm:p-4 lg:flex lg:flex-col lg:justify-center lg:space-y-4 lg:px-6 lg:py-8 xl:px-8">
                <div className="relative flex items-start gap-2 overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/90 via-white to-slate-50 px-3 py-2.5 shadow-[0_3px_10px_rgba(11,31,68,0.04)]">
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-500 to-blue-800" />
                  <div className="min-w-0 flex-1 pl-1">
                    <h3 className="text-base font-black leading-snug text-slate-950">{schedule.title}</h3>
                    <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-blue-800 ring-1 ring-blue-100">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                      {getCcsRecurrenceLabel(schedule)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCcsInfo(true)}
                    aria-label="Informasi kegiatan Cilegon Comedy Sharing"
                    className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-blue-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <Info className="h-[18px] w-[18px]" />
                  </button>
                </div>
                <div className={`grid ${time ? 'grid-cols-2' : 'grid-cols-1'} divide-x divide-blue-200 rounded-xl border border-blue-100 bg-blue-50/80`}>
                  <div className="flex min-w-0 items-center gap-2 px-2.5 py-2 sm:px-3">
                    <CalendarDays className="h-4 w-4 shrink-0 text-blue-700" />
                    <span className="min-w-0">
                      <span className="block text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Tanggal</span>
                      <span className="block text-xs font-extrabold leading-snug text-[#0B1F44] sm:text-sm">{formatCcsDate(getCcsOccurrenceDate(schedule))}</span>
                    </span>
                  </div>
                  {time && (
                    <div className="flex min-w-0 items-center gap-2 px-2.5 py-2 sm:px-3">
                      <Clock3 className="h-4 w-4 shrink-0 text-blue-700" />
                      <span className="min-w-0">
                        <span className="block text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Waktu</span>
                        <span className="block text-xs font-extrabold leading-snug text-[#0B1F44] sm:text-sm">{time}</span>
                      </span>
                    </div>
                  )}
                </div>
                {schedule.venue && (
                  mapsUrl ? (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="group/location flex min-h-11 max-w-full items-center gap-2.5 rounded-xl bg-blue-700 px-3 py-2 text-white shadow-[0_5px_14px_rgba(29,78,216,0.2)] transition hover:-translate-y-0.5 hover:bg-blue-800 hover:shadow-[0_8px_18px_rgba(29,78,216,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/15"><MapPin className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold leading-tight">{schedule.venue}</span>
                        <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-blue-100">Buka lokasi di Maps</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover/location:translate-x-0.5" />
                    </a>
                  ) : (
                    <p className="flex items-start gap-2 text-sm font-bold text-slate-800">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                      <span>{schedule.venue}</span>
                    </p>
                  )
                )}
              </div>
              </div>
              </article>
            </div>
          );
        })}
      </div>
      {showCcsInfo && (
        <Modal
          open
          onClose={() => setShowCcsInfo(false)}
          title="Apa Saja yang Dilakukan dalam CCS?"
          titleEyebrow="Tentang CCS"
          size="lg"
          headerClassName="!bg-gradient-to-br !from-blue-700 !via-blue-800 !to-blue-900 !px-4 !pb-3 !pt-3 sm:!px-6 sm:!pb-4 sm:!pt-4"
          titleClassName="!text-lg !font-black !text-white sm:!text-xl"
          titleEyebrowClassName="!mb-1 !text-blue-200"
          closeButtonClassName="!bg-white/15 !text-white hover:!bg-white/25 hover:!text-white"
          panelClassName="!max-w-xl"
        >
          <div className="grid grid-cols-1 gap-2">
            {[
              ['Bedah Materi', 'Mengulas materi komedi dan mengembangkan punchline.'],
              ['Brainstorming Ide', 'Menggali keresahan dan pengalaman sehari-hari menjadi ide komedi.'],
              ['Sharing Komedi', 'Berbagi pengalaman manggung, teknik menulis, dan delivery.'],
              ['Uji Materi', 'Mencoba materi di depan sesama komika untuk mendapat masukan.'],
              ['Evaluasi Bersama', 'Saling memberi kritik dan saran yang membangun.'],
              ['Comedy Buddy (Combud)', 'Partner komedi untuk bertukar ide, latihan, mengembangkan materi, dan saling mendukung.'],
            ].map(([title, description], index) => (
              <div key={title} className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-700 text-[10px] font-extrabold text-white">{index + 1}</span>
                  <div className="min-w-0">
                    <h4 className="text-xs font-extrabold leading-snug text-slate-900 sm:text-sm">{title}</h4>
                    <p className="mt-0.5 text-[10px] font-medium leading-snug text-slate-600 sm:text-xs">{description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {mapsSchedule && (
        <Modal open onClose={() => setMapsSchedule(null)} title="Lokasi CCS" titleEyebrow="Jadwal" size="sm" panelClassName="!rounded-2xl !border-slate-200">
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700"><MapPin className="h-5 w-5" /></span>
                <div className="min-w-0 pt-0.5">
                  <h4 className="text-sm font-extrabold leading-tight text-slate-900">{mapsSchedule.venue || 'Tempat belum ditentukan'}</h4>
                  <p className="mt-1 text-xs font-medium text-slate-500">{mapsSchedule.title}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3 text-xs font-semibold text-slate-600">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1"><CalendarDays className="h-3.5 w-3.5 text-blue-600" />{formatCcsDate(getCcsOccurrenceDate(mapsSchedule))}</span>
                {mapsSchedule.start_time && <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1"><Clock3 className="h-3.5 w-3.5 text-blue-600" />{formatCcsTime(mapsSchedule.start_time)}</span>}
                <span className="inline-flex items-center rounded-md bg-white px-2 py-1 text-blue-700">{getCcsRecurrenceLabel(mapsSchedule)}</span>
              </div>
            </div>
            {getCcsMapsUrl(mapsSchedule) ? (
              <a href={getCcsMapsUrl(mapsSchedule)!} target="_blank" rel="noopener noreferrer" onClick={() => setMapsSchedule(null)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                Buka lokasi di Google Maps <ExternalLink className="h-4 w-4" />
              </a>
            ) : (
              <p className="rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">Link Maps untuk lokasi ini belum tersedia.</p>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
