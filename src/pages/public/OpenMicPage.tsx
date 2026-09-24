import { useEffect, useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { OpenMic } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { OpenMicCard } from '@/components/cards/OpenMicCard';
import { PageHeader } from '@/components/PageHeader';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, getOpenMicNumbers } from '@/lib/format';

type PerformerSummary = {
  id: string;
  slug: string | null;
  fullName: string;
  stageName: string;
  instagram: string | null;
  community: string | null;
  totalAppearances: number;
  appearances: Array<{
    id: string;
    title: string;
    openMicNumber: number | undefined;
    venue: string;
    date: string;
    stageName: string;
    community: string | null;
  }>;
};

type PerformerRegistration = {
  open_mic_id: string;
  komika_id: string | null;
  full_name?: string | null;
  stage_name: string;
  community: string | null;
  instagram: string | null;
  attendance_status: string;
};

function normalizePerformerValue(value: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function OpenMicPage({ router }: { router: Router }) {
  const [loading, setLoading] = useState(true);
  const [mics, setMics] = useState<OpenMic[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [lineups, setLineups] = useState<Record<string, string[]>>({});
  const [performerSummaries, setPerformerSummaries] = useState<PerformerSummary[]>([]);
  const [selectedPerformerId, setSelectedPerformerId] = useState<string | null>(null);
  const [upcomingSearch, setUpcomingSearch] = useState('');
  const [completedSearch, setCompletedSearch] = useState('');
  const openMicNumbers = useMemo(() => getOpenMicNumbers(mics), [mics]);

  useEffect(() => {
    (async () => {
      const [{ data }, { data: komikaData }] = await Promise.all([
        supabase
          .from('open_mics')
          .select('*')
          .eq('published', true)
          .order('date', { ascending: true }),
        supabase
          .from('komika')
          .select('id, full_name, stage_name, slug, instagram_url, status, published')
          .eq('published', true)
          .eq('status', 'active'),
      ]);
      const list = (data as OpenMic[]) ?? [];
      setMics(list);
      const komikaList = (komikaData ?? []) as Array<{ id: string; full_name: string; stage_name: string; slug: string; instagram_url: string | null }>;

      if (list.length > 0) {
        const ids = list.map((m) => m.id);
        const { data: regs } = await supabase
          .from('open_mic_registrations')
          .select('open_mic_id, komika_id, stage_name, community, instagram, attendance_status')
          .in('open_mic_id', ids)
          .eq('status', 'confirmed')
          .neq('attendance_status', 'absent')
          .order('created_at', { ascending: true });
        const c: Record<string, number> = {};
        const names: Record<string, string[]> = {};
        const appearanceRows = ((regs ?? []) as PerformerRegistration[]).filter((r) => {
          const event = list.find((mic) => mic.id === r.open_mic_id);
          const isArchive = event && (event.status === 'completed' || event.date < new Date().toISOString().slice(0, 10));
          return Boolean(event && isArchive && r.attendance_status === 'attended');
        });
        (regs ?? []).forEach((r: { open_mic_id: string; stage_name: string; attendance_status: string }) => {
          const event = list.find((mic) => mic.id === r.open_mic_id);
          const isArchive = event && (event.status === 'completed' || event.date < new Date().toISOString().slice(0, 10));
          if (isArchive ? r.attendance_status !== 'attended' : r.attendance_status === 'absent') return;
          c[r.open_mic_id] = (c[r.open_mic_id] ?? 0) + 1;
          names[r.open_mic_id] = [...(names[r.open_mic_id] ?? []), r.stage_name];
        });
        setCounts(c);
        setLineups(names);

        const profileById = new Map(komikaList.map((profile) => [profile.id, profile]));
        const openMicNumbersForHistory = getOpenMicNumbers(list);
        const summaryByIdentity = new Map<string, PerformerSummary & { latestDate: string }>();
        appearanceRows.forEach((row) => {
          const profile = row.komika_id ? profileById.get(row.komika_id) : undefined;
          const identityKey = profile
            ? `komika:${profile.id}`
            : `public:${normalizePerformerValue(row.stage_name)}|${normalizePerformerValue(row.instagram)}`;
          const event = list.find((mic) => mic.id === row.open_mic_id);
          const eventDate = event?.date ?? '';
          const current = summaryByIdentity.get(identityKey);
          if (current) {
            current.totalAppearances += 1;
            current.appearances.push({ id: row.open_mic_id, title: event?.title ?? 'Open Mic', openMicNumber: openMicNumbersForHistory.get(row.open_mic_id), venue: event?.venue ?? 'Lokasi tidak tersedia', date: eventDate, stageName: row.stage_name, community: row.community });
            if (eventDate > current.latestDate) {
              current.latestDate = eventDate;
              current.community = row.community;
              if (!profile) {
                  current.fullName = row.stage_name;
                  current.stageName = row.stage_name;
                  current.instagram = row.instagram;
              }
            }
            return;
          }
          summaryByIdentity.set(identityKey, {
            id: identityKey,
            slug: profile?.slug ?? null,
            fullName: profile?.full_name ?? row.stage_name,
            stageName: profile?.stage_name ?? row.stage_name,
            instagram: profile?.instagram_url ?? row.instagram,
            community: row.community,
            totalAppearances: 1,
            appearances: [{ id: row.open_mic_id, title: event?.title ?? 'Open Mic', openMicNumber: openMicNumbersForHistory.get(row.open_mic_id), venue: event?.venue ?? 'Lokasi tidak tersedia', date: eventDate, stageName: row.stage_name, community: row.community }],
            latestDate: eventDate,
          });
        });
        summaryByIdentity.forEach((summary) => summary.appearances.sort((first, second) => second.date.localeCompare(first.date)));
        setPerformerSummaries([...summaryByIdentity.values()]);
      }
      setLoading(false);
    })();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const matchesSearch = (mic: OpenMic, query: string) => !query.trim() || `${mic.title} ${mic.venue} ${mic.location} ${mic.date} ${formatDate(mic.date)}`.toLowerCase().includes(query.trim().toLowerCase());

  const upcoming = mics.filter((m) => (m.status === 'upcoming' && m.date >= today) && matchesSearch(m, upcomingSearch));
  const completed = mics
    .filter((m) => m.status === 'completed' || m.date < today)
    .filter((m) => matchesSearch(m, completedSearch))
    .sort((a, b) => {
      const dateOrder = b.date.localeCompare(a.date);
      if (dateOrder !== 0) return dateOrder;
      return (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.id.localeCompare(a.id);
    })
    .slice(0, completedSearch.trim() ? undefined : 5);
  const matchingPerformers = performerSummaries.filter((performer) => {
    const query = completedSearch.trim().toLowerCase();
    return query && `${performer.fullName} ${performer.stageName} ${performer.instagram ?? ''} ${performer.community ?? ''}`.toLowerCase().includes(query);
  });

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Open Mic" subtitle="Temukan panggungmu." />

      <div className="container-app space-y-8 py-8">
        <section data-scroll-reveal className="scroll-reveal is-visible">
          <div className="mb-4 flex items-center gap-3"><span className="h-8 w-1 rounded-full bg-blue-600" /><h2 className="text-xl font-extrabold text-slate-900">Mendatang</h2><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{upcoming.length}</span></div>
          <div className="relative mb-4"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={upcomingSearch} onChange={(event) => setUpcomingSearch(event.target.value)} placeholder="Cari Open Mic mendatang..." className="input-field !pl-11" aria-label="Cari Open Mic mendatang" /></div>
          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><LoadingSkeleton count={3} /></div>
          ) : upcoming.length === 0 ? (
            <EmptyState title="Belum ada Open Mic mendatang." description="Pantau terus untuk panggung berikutnya." noSmokeArea />
          ) : (
            <div className="flex gap-4 overflow-x-auto overscroll-x-contain pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:pb-0">
              {upcoming.map((m) => <div key={m.id} className="min-w-[270px] max-w-[270px] shrink-0 snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none"><OpenMicCard mic={m} openMicNumber={openMicNumbers.get(m.id)} confirmedCount={counts[m.id] ?? 0} lineup={lineups[m.id]} router={router} /></div>)}
            </div>
          )}
        </section>

        <section data-scroll-reveal className="scroll-reveal is-visible border-t border-slate-200 pt-6 sm:pt-8">
          <div className="mb-4 flex items-center gap-3"><span className="h-8 w-1 rounded-full bg-slate-400" /><h2 className="text-xl font-extrabold text-slate-900">Selesai</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{completed.length}</span></div>
          <div className="relative mb-4"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={completedSearch} onChange={(event) => setCompletedSearch(event.target.value)} placeholder="Cari judul Open Mic, nama komika, panggung, komunitas..." className="input-field !pl-11" aria-label="Cari judul Open Mic, nama komika, panggung, atau komunitas" /></div>
          {matchingPerformers.length > 0 && <div className="mb-5 space-y-2.5">
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-700">Komika yang pernah tampil</h3><span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-extrabold text-slate-700">{matchingPerformers.length} hasil</span></div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {matchingPerformers.map((performer) => <div key={performer.id} className="space-y-2">
                  <button type="button" onClick={() => setSelectedPerformerId((current) => current === performer.id ? null : performer.id)} aria-expanded={selectedPerformerId === performer.id} className={`w-full rounded-xl border px-3.5 py-3 text-left shadow-sm transition ${selectedPerformerId === performer.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50'}`}>
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-base font-extrabold leading-tight text-slate-950">{performer.fullName}</p><div className="mt-1 flex items-baseline gap-2"><span className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-500">Panggung</span><span className="truncate text-sm font-bold text-slate-700">{performer.stageName}</span></div></div><span className="shrink-0 rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.05em] text-white">{performer.totalAppearances} X TAMPIL</span></div>
                    <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-600"><span>{performer.community ?? 'Komunitas belum dicatat'}</span>{performer.instagram && <><span className="text-slate-300">·</span><span>{performer.instagram}</span></>}</div>
                </button>
                  {selectedPerformerId === performer.id && <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-600">Riwayat tampil</p><span className="text-xs font-black uppercase tracking-[0.08em] text-blue-700">{performer.totalAppearances} OPEN MIC</span></div>
                    <div className="space-y-1.5">{performer.appearances.map((appearance) => <div key={appearance.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs shadow-sm"><div className="min-w-0"><p className="truncate font-extrabold text-slate-900">{appearance.openMicNumber ? `Open Mic #${appearance.openMicNumber} · ` : ''}{appearance.title}</p><p className="mt-0.5 truncate font-semibold text-slate-600">{appearance.stageName} · {appearance.community ?? 'Komunitas belum dicatat'}</p></div><span className="shrink-0 text-right font-bold leading-5 text-slate-600">{formatDate(appearance.date)}<br />{appearance.venue}</span></div>)}</div>
                </div>}
              </div>)}
            </div>
          </div>}
          {completed.length === 0 ? (
            <EmptyState title="Belum ada Open Mic yang selesai." description="Riwayat Open Mic akan muncul di sini setelah acaranya selesai." noSmokeArea />
          ) : (
            <div className="flex gap-4 overflow-x-auto overscroll-x-contain pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:pb-0">
              {completed.map((m) => <div key={m.id} className="min-w-[270px] max-w-[270px] shrink-0 snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none"><OpenMicCard mic={m} openMicNumber={openMicNumbers.get(m.id)} confirmedCount={counts[m.id] ?? 0} lineup={lineups[m.id]} router={router} /></div>)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
