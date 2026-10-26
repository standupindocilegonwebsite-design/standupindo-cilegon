import { useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ExternalLink, MapPin, Pencil } from 'lucide-react';
import type { EventLineupRole, MemberStageExperience } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { formatDate, getEventStatus, isStandupindoCilegonOrganizer, safeExternalUrl } from '@/lib/format';
import { MemberModal } from '@/components/member/MemberModal';
import { SlidingTabIndicator } from '@/components/ui/SlidingTabIndicator';

interface OfficialJourneyEntry {
  id: string;
  role_category: EventLineupRole;
  role_title: string | null;
  event: {
    title: string;
    slug: string;
    date: string;
    time: string | null;
    venue: string | null;
    location: string | null;
    description: string | null;
    poster: string | null;
    status: 'upcoming' | 'completed' | 'cancelled';
    published: boolean;
  };
}

function roleLabel(entry: OfficialJourneyEntry) {
  if (entry.role_category === 'other' && entry.role_title) return entry.role_title;
  const labels: Record<EventLineupRole, string> = {
    special_show: 'Special Show',
    guest_star: 'Guest Star',
    lineup: 'Lineup',
    judge: 'Juri',
    opener: 'Opener',
    mc_host: 'MC / Host',
    other: 'Lainnya',
  };
  return labels[entry.role_category];
}

function stageExperienceRoleLabel(role: MemberStageExperience['role']) {
  return role === 'Lineup / Penampil' ? 'Lineup' : role;
}

export function MemberStageJourneySummary({ komikaId, onManage }: { komikaId: string; onManage: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'internal' | 'external'>('internal');
  const journeyTabsRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<OfficialJourneyEntry | null>(null);
  const [eventAboutExpanded, setEventAboutExpanded] = useState(false);
  const [official, setOfficial] = useState<OfficialJourneyEntry[]>([]);
  const [external, setExternal] = useState<MemberStageExperience[]>([]);

  async function loadJourney() {
    setLoading(true);
    setError('');
    const [officialResult, externalResult] = await Promise.all([
      supabase.from('event_lineups')
        .select('id, role_category, role_title, event:events!inner(title, slug, date, time, venue, location, description, poster, status, published)')
        .eq('komika_id', komikaId)
        .eq('events.published', true),
      supabase.from('member_stage_experiences')
        .select('id, komika_id, event_date, event_name, event_type, role, custom_role, organizer, city, external_url, created_at, updated_at')
        .eq('komika_id', komikaId)
        .order('event_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);

    if (officialResult.error || externalResult.error) {
      console.error('Failed to load member stage journey summary', officialResult.error ?? externalResult.error);
      setError('Perjalanan panggung gagal dimuat. Coba muat ulang.');
      setLoaded(false);
    } else {
      const completed = ((officialResult.data ?? []) as unknown as OfficialJourneyEntry[])
        .filter((entry) => entry.event.published && getEventStatus(entry.event.status, entry.event.date) === 'completed')
        .sort((first, second) => second.event.date.localeCompare(first.event.date));
      setOfficial(completed);
      setExternal(((externalResult.data ?? []) as MemberStageExperience[])
        .filter((entry) => !isStandupindoCilegonOrganizer(entry.organizer)));
      setLoaded(true);
    }
    setLoading(false);
  }

  async function toggleExpanded() {
    const shouldExpand = !expanded;
    setExpanded(shouldExpand);
    if (shouldExpand && !loaded && !loading) await loadJourney();
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
      <div className="flex items-stretch">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => void toggleExpanded()}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400"
        >
          <span className="min-w-0">
            <span className="block text-sm font-extrabold text-slate-900">Perjalanan Panggung</span>
            <span className="mt-0.5 block text-xs text-slate-500">Riwayat internal dan eksternal</span>
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={onManage}
          aria-label="Tambah atau edit perjalanan panggung"
          title="Tambah atau edit perjalanan panggung"
          className="m-2 flex w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      {expanded && <div className="border-t border-slate-100 px-3 py-3 sm:px-4 sm:py-4">
        <div ref={journeyTabsRef} className="relative isolate mb-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Jenis perjalanan panggung">
          <SlidingTabIndicator trackRef={journeyTabsRef} activeId={activeTab} className="rounded-lg bg-blue-700 shadow-sm" />
          <button
            type="button"
            role="tab"
            data-sliding-tab="internal"
            aria-selected={activeTab === 'internal'}
            onClick={() => setActiveTab('internal')}
            className={`relative z-10 flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-center text-xs font-bold transition sm:gap-2 sm:px-3 sm:text-sm ${activeTab === 'internal' ? 'bg-transparent text-white shadow-none' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <span className="truncate">Panggung Internal</span>
            {loaded && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${activeTab === 'internal' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>{official.length}</span>}
          </button>
          <button
            type="button"
            role="tab"
            data-sliding-tab="external"
            aria-selected={activeTab === 'external'}
            onClick={() => setActiveTab('external')}
            className={`relative z-10 flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-center text-xs font-bold transition sm:gap-2 sm:px-3 sm:text-sm ${activeTab === 'external' ? 'bg-transparent text-white shadow-none' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <span className="truncate">Panggung Eksternal</span>
            {loaded && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${activeTab === 'external' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>{external.length}</span>}
          </button>
        </div>

        {loading ? <p className="py-5 text-center text-sm text-slate-500">Memuat perjalanan panggung...</p>
          : error ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p role="alert" className="text-sm font-medium text-amber-900">{error}</p>
            <button type="button" onClick={() => void loadJourney()} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100">Coba Lagi</button>
          </div>
            : activeTab === 'internal'
              ? official.length === 0 ? <p className="rounded-xl border border-dashed border-blue-200 bg-blue-50/50 px-3 py-5 text-center text-sm text-slate-500">Belum ada panggung internal yang selesai.</p>
                : <ul className="space-y-2.5">
                  {official.map((entry, index) => <li key={entry.id} className={`flex items-center gap-3 rounded-xl border border-blue-100 p-2.5 ${index % 2 === 0 ? 'bg-white' : 'bg-blue-50/70'}`}>
                    <button type="button" onClick={() => { setEventAboutExpanded(false); setSelectedEvent(entry); }} className="flex h-[4.5rem] w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-blue-100 bg-white shadow-sm" aria-label={`Lihat detail Event ${entry.event.title}`}>
                      {entry.event.poster
                        ? <img src={entry.event.poster} alt={`Poster ${entry.event.title}`} loading="lazy" className="h-full w-full object-cover" />
                        : <CalendarDays className="h-5 w-5 text-blue-500" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-slate-500">{formatDate(entry.event.date)}</p>
                      <button type="button" onClick={() => { setEventAboutExpanded(false); setSelectedEvent(entry); }} className="line-clamp-2 block text-left text-sm font-bold leading-snug text-slate-900 hover:text-blue-800">{entry.event.title}</button>
                      <p className="mt-0.5 text-xs text-slate-600">{roleLabel(entry)}</p>
                    </div>
                  </li>)}
                </ul>
              : external.length === 0 ? <p className="rounded-xl border border-dashed border-blue-200 bg-blue-50/50 px-3 py-5 text-center text-sm text-slate-500">Belum ada panggung eksternal tersimpan.</p>
                : <ul className="space-y-2.5">
                  {external.map((entry, index) => {
                    const url = safeExternalUrl(entry.external_url);
                    return <li key={entry.id} className={`flex items-start gap-2.5 rounded-xl border border-blue-100 p-3 ${index % 2 === 0 ? 'bg-white' : 'bg-blue-50/70'}`}>
                      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-slate-500">{formatDate(entry.event_date)}</p>
                        {url
                          ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-sm font-bold leading-snug text-slate-900 hover:text-blue-800">
                            <span className="truncate">{entry.event_name}</span><ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                          : <p className="text-sm font-bold leading-snug text-slate-900">{entry.event_name}</p>}
                        {entry.event_type && <p className="text-xs text-slate-600">{entry.event_type}</p>}
                        <p className="text-xs text-slate-600">{entry.role === 'Lainnya' ? entry.custom_role : stageExperienceRoleLabel(entry.role)}</p>
                        {(entry.organizer || entry.city) && <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500"><MapPin className="h-3 w-3 text-blue-600" />{[entry.organizer, entry.city].filter(Boolean).join(' · ')}</p>}
                      </div>
                    </li>;
                  })}
                </ul>
        }
      </div>}
      {selectedEvent && (
        <MemberModal
          open
          onClose={() => setSelectedEvent(null)}
          title={selectedEvent.event.title}
          titleEyebrow="Detail Event"
          size="md"
        >
          <div className="space-y-4">
            {selectedEvent.event.poster && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <img
                  src={selectedEvent.event.poster}
                  alt={`Poster ${selectedEvent.event.title}`}
                  className="mx-auto max-h-[min(48dvh,440px)] w-full object-contain"
                />
              </div>
            )}
            <div className="overflow-hidden rounded-xl border border-blue-100 bg-blue-50/50">
              <div className="space-y-2.5 p-3.5">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <CalendarDays className="h-4 w-4 shrink-0 text-blue-700" />
                <span>{formatDate(selectedEvent.event.date)}</span>
                {selectedEvent.event.time && <><span aria-hidden="true" className="text-slate-400">·</span><span>{selectedEvent.event.time} WIB</span></>}
              </p>
              {(selectedEvent.event.venue || selectedEvent.event.location) && (
                <p className="flex items-start gap-2 text-sm text-slate-700">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                  <span>{[selectedEvent.event.venue, selectedEvent.event.location].filter(Boolean).join(', ')}</span>
                </p>
              )}
              <p className="border-t border-blue-100 pt-2 text-sm font-semibold text-slate-800">
                <span className="text-slate-500">Peran Kamu :</span> {roleLabel(selectedEvent)}
              </p>
              </div>
              {selectedEvent.event.description && (
                <button
                  type="button"
                  aria-expanded={eventAboutExpanded}
                  aria-controls="member-event-about"
                  onClick={() => setEventAboutExpanded((expanded) => !expanded)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-blue-100 px-3.5 py-2.5 text-left text-sm font-bold text-slate-800 transition hover:bg-blue-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                >
                  <span>Tentang Event</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${eventAboutExpanded ? 'rotate-180' : ''}`} />
                </button>
              )}
              {selectedEvent.event.description && eventAboutExpanded && (
                  <p id="member-event-about" className="border-t border-blue-100 px-3.5 py-3 text-sm leading-6 text-slate-600 whitespace-pre-line">
                    {selectedEvent.event.description}
                  </p>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="btn-secondary justify-center"
              >
                Tutup
              </button>
              <a
                href={`/event/${encodeURIComponent(selectedEvent.event.slug)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary justify-center"
              >
                <ExternalLink className="h-4 w-4" /> Buka halaman Event
              </a>
            </div>
          </div>
        </MemberModal>
      )}
    </section>
  );
}
