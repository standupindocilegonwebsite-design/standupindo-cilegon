import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, MapPin, Mic, Search, Trophy } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { MemberOpenMicHistorySubmission, OpenMic, OpenMicRegistration } from '@/lib/types';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';

type PerformanceHistoryItem = {
  id: string;
  source: 'internal' | 'external';
  title: string;
  date: string;
  venue: string;
  city: string | null;
};

export function MemberPerformanceHistoryPage({ router }: { router: Router }) {
  const { user } = useAuth();
  const [items, setItems] = useState<PerformanceHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | PerformanceHistoryItem['source']>('all');

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError('');
      const { data: komikaRow } = await supabase
        .from('komika')
        .select('id')
        .or(`user_id.eq.${user.id},id.eq.${user.id}`)
        .maybeSingle();

      const komikaId = komikaRow?.id ?? null;
      if (!komikaId) {
        setItems([]);
        setLoading(false);
        return;
      }

      const [{ data: registrationData, error: registrationError }, { data: externalData, error: externalError }] = await Promise.all([
        supabase.from('open_mic_registrations').select('*').eq('komika_id', komikaId).eq('attendance_status', 'attended'),
        supabase.from('member_open_mic_history_submissions').select('*').eq('komika_id', komikaId).eq('status', 'approved'),
      ]);

      if (registrationError || externalError) {
        setError('Riwayat tampil belum dapat dimuat. Coba lagi beberapa saat.');
        setItems([]);
        setLoading(false);
        return;
      }

      const registrations = (registrationData as OpenMicRegistration[]) ?? [];
      const externalSubmissions = (externalData as MemberOpenMicHistorySubmission[]) ?? [];
      const openMicIds = registrations.map((registration) => registration.open_mic_id);
      const { data: openMicData, error: openMicError } = openMicIds.length > 0
        ? await supabase.from('open_mics').select('*').in('id', openMicIds)
        : { data: [], error: null };

      if (openMicError) {
        setError('Detail Open Mic belum dapat dimuat. Coba lagi beberapa saat.');
        setItems([]);
        setLoading(false);
        return;
      }

      const openMics = (openMicData as OpenMic[]) ?? [];
      const openMicById = new Map(openMics.map((openMic) => [openMic.id, openMic]));
      const internalItems = registrations.map((registration) => {
        const openMic = openMicById.get(registration.open_mic_id);
        return {
          id: `internal-${registration.id}`,
          source: 'internal' as const,
          title: openMic?.title ?? 'Open Mic Internal',
          date: openMic?.date ?? registration.created_at,
          venue: openMic?.venue ?? 'Lokasi tidak tersedia',
          city: openMic?.location ?? null,
        };
      });
      const externalItems = externalSubmissions.map((submission) => ({
        id: `external-${submission.id}`,
        source: 'external' as const,
        title: submission.title,
        date: submission.event_date,
        venue: submission.venue,
        city: submission.city,
      }));

      setItems([...internalItems, ...externalItems]);
      setLoading(false);
    })();
  }, [user?.id]);

  const sortedItems = useMemo(() => [...items].sort((first, second) => second.date.localeCompare(first.date)), [items]);
  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sortedItems.filter((item) => {
      const matchesSource = sourceFilter === 'all' || item.source === sourceFilter;
      const matchesSearch = !query || `${item.title} ${item.venue} ${item.city ?? ''} ${item.source}`.toLowerCase().includes(query);
      return matchesSource && matchesSearch;
    });
  }, [search, sourceFilter, sortedItems]);

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Riwayat Open Mic Ku" subtitle="Catatan penampilan kamu di internal maupun eksternal." />
      <div className="container-app py-6 sm:py-8">
        {error && <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
        {loading ? (
          <div className="h-48 animate-pulse rounded-[28px] bg-slate-100" />
        ) : items.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <Trophy className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 font-bold text-slate-700">Belum ada riwayat tampil</p>
            <p className="mt-1 text-sm text-slate-500">Penampilan yang sudah hadir atau disetujui akan muncul di sini.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-field pl-10 text-sm font-medium text-slate-800 placeholder:text-slate-500" placeholder="Cari judul, venue, atau kota..." aria-label="Cari riwayat Open Mic" />
            </div>
            <div className="grid grid-cols-3 rounded-xl border border-slate-300 bg-white p-1" aria-label="Filter sumber riwayat">
              {(['all', 'internal', 'external'] as const).map((source) => <button key={source} type="button" onClick={() => setSourceFilter(source)} className={`rounded-lg px-2 py-2 text-xs font-bold transition ${sourceFilter === source ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>{source === 'all' ? 'Semua' : source === 'internal' ? 'Internal' : 'Eksternal'}</button>)}
            </div>
            <div className="flex items-center justify-between gap-3 px-0.5">
              <p className="text-sm font-bold text-slate-800">{visibleItems.length} dari {sortedItems.length} penampilan</p>
              <p className="text-xs font-semibold text-slate-600">Terbaru lebih dulu</p>
            </div>
            {visibleItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-medium text-slate-600">Riwayat yang kamu cari tidak ditemukan.</div>
            ) : (['internal', 'external'] as const).map((source) => {
              const groupItems = visibleItems.filter((item) => item.source === source);
              if (groupItems.length === 0) return null;
              const isInternal = source === 'internal';
              return <section key={source} className="space-y-2.5">
                <div className="flex items-center justify-between gap-3 px-0.5">
                  <div className="flex items-center gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-lg ${isInternal ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}><Mic className="h-3.5 w-3.5" /></span><h2 className="text-sm font-extrabold text-slate-900">{isInternal ? 'Internal' : 'Eksternal'}</h2></div>
                  <span className="text-xs font-bold text-slate-600">{groupItems.length} penampilan</span>
                </div>
                {groupItems.map((item) => <article key={item.id} className="rounded-2xl border border-slate-300 bg-white p-3.5 shadow-[0_6px_16px_rgba(15,23,42,0.05)] sm:p-4">
                  <div className="flex items-start justify-between gap-3"><h3 className="min-w-0 break-words text-sm font-black text-slate-950 sm:text-base">{item.title}</h3><Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /></div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-semibold text-slate-600"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-slate-500" />{formatDate(item.date)}</span><span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-500" />{item.venue}{item.city ? `, ${item.city}` : ''}</span></div>
                </article>)}
              </section>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
