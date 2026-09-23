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

export function OpenMicPage({ router }: { router: Router }) {
  const [loading, setLoading] = useState(true);
  const [mics, setMics] = useState<OpenMic[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [lineups, setLineups] = useState<Record<string, string[]>>({});
  const [upcomingSearch, setUpcomingSearch] = useState('');
  const [completedSearch, setCompletedSearch] = useState('');
  const openMicNumbers = useMemo(() => getOpenMicNumbers(mics), [mics]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('open_mics')
        .select('*')
        .eq('published', true)
        .order('date', { ascending: true });
      const list = (data as OpenMic[]) ?? [];
      setMics(list);

      if (list.length > 0) {
        const ids = list.map((m) => m.id);
        const { data: regs } = await supabase
          .from('open_mic_registrations')
          .select('open_mic_id, stage_name, attendance_status')
          .in('open_mic_id', ids)
          .eq('status', 'confirmed')
          .neq('attendance_status', 'absent')
          .order('created_at', { ascending: true });
        const c: Record<string, number> = {};
        const names: Record<string, string[]> = {};
        (regs ?? []).forEach((r: { open_mic_id: string; stage_name: string; attendance_status: string }) => {
          const event = list.find((mic) => mic.id === r.open_mic_id);
          const isArchive = event && (event.status === 'completed' || event.date < new Date().toISOString().slice(0, 10));
          if (isArchive ? r.attendance_status !== 'attended' : r.attendance_status === 'absent') return;
          c[r.open_mic_id] = (c[r.open_mic_id] ?? 0) + 1;
          names[r.open_mic_id] = [...(names[r.open_mic_id] ?? []), r.stage_name];
        });
        setCounts(c);
        setLineups(names);
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
            <div className="flex touch-pan-x gap-4 overflow-x-auto overscroll-x-contain pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:pb-0">
              {upcoming.map((m) => <div key={m.id} className="min-w-[270px] max-w-[270px] shrink-0 snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none"><OpenMicCard mic={m} openMicNumber={openMicNumbers.get(m.id)} confirmedCount={counts[m.id] ?? 0} lineup={lineups[m.id]} router={router} /></div>)}
            </div>
          )}
        </section>

        <section data-scroll-reveal className="scroll-reveal is-visible border-t border-slate-200 pt-6 sm:pt-8">
          <div className="mb-4 flex items-center gap-3"><span className="h-8 w-1 rounded-full bg-slate-400" /><h2 className="text-xl font-extrabold text-slate-900">Selesai</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{completed.length}</span></div>
          <div className="relative mb-4"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={completedSearch} onChange={(event) => setCompletedSearch(event.target.value)} placeholder="Cari riwayat Open Mic..." className="input-field !pl-11" aria-label="Cari riwayat Open Mic" /></div>
          {completed.length === 0 ? (
            <EmptyState title="Belum ada Open Mic yang selesai." description="Riwayat Open Mic akan muncul di sini setelah acaranya selesai." noSmokeArea />
          ) : (
            <div className="flex touch-pan-x gap-4 overflow-x-auto overscroll-x-contain pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:pb-0">
              {completed.map((m) => <div key={m.id} className="min-w-[270px] max-w-[270px] shrink-0 snap-start sm:min-w-[300px] lg:min-w-0 lg:max-w-none"><OpenMicCard mic={m} openMicNumber={openMicNumbers.get(m.id)} confirmedCount={counts[m.id] ?? 0} lineup={lineups[m.id]} router={router} /></div>)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
