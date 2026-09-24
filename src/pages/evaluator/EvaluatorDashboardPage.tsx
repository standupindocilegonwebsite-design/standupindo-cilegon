import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCheck, CheckCircle2, ClipboardList, Clock3, Mic, Search, Users, X } from 'lucide-react';
import type { Router } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/PageHeader';
import { formatDate } from '@/lib/format';
import type { OpenMic } from '@/lib/types';

export function EvaluatorDashboardPage({ router }: { router: Router }) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<{ open_mic_id: string; open_mic?: OpenMic }[]>([]);
  const [search, setSearch] = useState('');
  const [progressFilter, setProgressFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [visibleLimit, setVisibleLimit] = useState(10);
  const [komikaByMic, setKomikaByMic] = useState<Record<string, string>>({});
  const [progressByMic, setProgressByMic] = useState<Record<string, { evaluated: number; total: number }>>({});
  const [emptyReasonByMic, setEmptyReasonByMic] = useState<Record<string, 'no-attendee' | 'only-evaluator'>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    (async () => {
      const { data: assignmentRows } = await supabase
        .from('evaluator_assignments')
        .select('*')
        .eq('evaluator_user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      const rowList = assignmentRows ?? [];
      const micIds = rowList.map((row) => row.open_mic_id);
      const hasGlobalAssignment = rowList.some((row) => row.open_mic_id === null);

      let openMics: OpenMic[] = [];
      if (hasGlobalAssignment || micIds.length > 0) {
        const query = supabase.from('open_mics').select('*').order('date', { ascending: false });
        const { data: micData } = hasGlobalAssignment ? await query : await query.in('id', micIds.filter((id): id is string => Boolean(id)));
        openMics = (micData as OpenMic[]) ?? [];
      }

      const combined = rowList.flatMap((row) => row.open_mic_id === null
        ? openMics.map((openMic) => ({ ...row, open_mic: openMic }))
        : [{ ...row, open_mic: openMics.find((mic) => mic.id === row.open_mic_id) }]);
      const uniqueAssignments = Array.from(new Map(combined.filter((item) => item.open_mic).map((item) => [item.open_mic!.id, item])).values());

      setAssignments(uniqueAssignments);
      const assignedMicIds = uniqueAssignments.map((item) => item.open_mic!.id);
      if (assignedMicIds.length > 0) {
        const [{ data: registrationRows }, { data: evaluationRows }, { data: ownProfile }] = await Promise.all([
          supabase
          .from('open_mic_registrations')
          .select('id, open_mic_id, full_name, stage_name, community, komika_id')
          .in('open_mic_id', assignedMicIds)
          .eq('attendance_status', 'attended')
          .not('komika_id', 'is', null),
          supabase
            .from('evaluations')
            .select('open_mic_id, performer_registration_id')
            .eq('evaluator_user_id', user.id)
            .eq('status', 'submitted')
            .in('open_mic_id', assignedMicIds),
          supabase.from('komika').select('id').eq('user_id', user.id).maybeSingle(),
        ]);
        const eligibleRegistrations = (registrationRows ?? []).filter((row) => row.community?.toLowerCase().includes('standupindo cilegon') && row.komika_id !== ownProfile?.id);
        setEmptyReasonByMic(Object.fromEntries(assignedMicIds.map((id) => {
          const attendedRows = (registrationRows ?? []).filter((row) => row.open_mic_id === id);
          const onlyEvaluator = attendedRows.length > 0 && Boolean(ownProfile?.id) && attendedRows.every((row) => row.komika_id === ownProfile.id);
          return [id, onlyEvaluator ? 'only-evaluator' : 'no-attendee'];
        })));
        const eligibleRegistrationIdsByMic = eligibleRegistrations.reduce<Record<string, Set<string>>>((result, row) => {
          if (!result[row.open_mic_id]) result[row.open_mic_id] = new Set();
          result[row.open_mic_id].add(row.id);
          return result;
        }, {});
        const namesByMic = eligibleRegistrations.reduce<Record<string, string>>((result, row) => {
          const name = [row.stage_name, row.full_name, row.community].filter(Boolean).join(' ');
          result[row.open_mic_id] = `${result[row.open_mic_id] ?? ''} ${name}`.trim();
          return result;
        }, {});
        setKomikaByMic(namesByMic);
        const totalByMic = eligibleRegistrations.reduce<Record<string, number>>((result, row) => {
          result[row.open_mic_id] = (result[row.open_mic_id] ?? 0) + 1;
          return result;
        }, {});
        const evaluatedByMic = (evaluationRows ?? []).filter((row) => eligibleRegistrationIdsByMic[row.open_mic_id]?.has(row.performer_registration_id)).reduce<Record<string, number>>((result, row) => {
          result[row.open_mic_id] = (result[row.open_mic_id] ?? 0) + 1;
          return result;
        }, {});
        setProgressByMic(Object.fromEntries(assignedMicIds.map((id) => [id, { total: totalByMic[id] ?? 0, evaluated: evaluatedByMic[id] ?? 0 }])));
      }
      setLoading(false);
    })();
  }, [user?.id]);

  const stats = useMemo(() => {
    const total = assignments.length;
    const today = new Date();
    const upcoming = assignments.filter((item) => item.open_mic && item.open_mic.date >= today.toISOString().slice(0, 10)).length;
    return { total, upcoming };
  }, [assignments]);
  const filteredAssignments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assignments.filter(({ open_mic: mic }) => {
      if (!mic) return false;
      const progress = progressByMic[mic.id] ?? { evaluated: 0, total: 0 };
      const isCompleted = progress.total === 0 || progress.evaluated >= progress.total;
      if (progressFilter === 'pending' && isCompleted) return false;
      if (progressFilter === 'completed' && !isCompleted) return false;
      return !query || `${mic.title} ${mic.date} ${mic.time} ${mic.venue} ${mic.location} ${mic.status} ${komikaByMic[mic.id] ?? ''}`.toLowerCase().includes(query);
    });
  }, [assignments, komikaByMic, progressByMic, progressFilter, search]);

  useEffect(() => {
    setVisibleLimit(10);
  }, [progressFilter, search]);

  const orderedAssignments = useMemo(() => [...filteredAssignments].sort((a, b) => {
    const aProgress = progressByMic[a.open_mic?.id ?? ''] ?? { evaluated: 0, total: 0 };
    const bProgress = progressByMic[b.open_mic?.id ?? ''] ?? { evaluated: 0, total: 0 };
    const aDone = aProgress.total === 0 || aProgress.evaluated >= aProgress.total;
    const bDone = bProgress.total === 0 || bProgress.evaluated >= bProgress.total;
    return Number(aDone) - Number(bDone);
  }), [filteredAssignments, progressByMic]);
  const visibleAssignments = orderedAssignments.slice(0, visibleLimit);

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Evaluator Area" subtitle="Open Mic yang ditugaskan kepada kamu." />

      <div className="container-app py-6 sm:py-8">
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-[24px] sm:p-4">
            <div className="flex items-center gap-2 text-blue-600"><ClipboardList className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-[0.12em]">Assigned</span></div>
            <p className="mt-2 text-2xl font-black text-slate-900 sm:mt-3 sm:text-3xl">{stats.total}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-[24px] sm:p-4">
            <div className="flex items-center gap-2 text-amber-600"><Clock3 className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-[0.12em]">Upcoming</span></div>
            <p className="mt-2 text-2xl font-black text-slate-900 sm:mt-3 sm:text-3xl">{stats.upcoming}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-[24px] sm:p-4">
            <div className="flex items-center gap-2 text-emerald-600"><CheckCheck className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-[0.12em]">Progress</span></div>
            <p className="mt-2 truncate text-xl font-black text-slate-900 sm:mt-3 sm:text-3xl">{stats.total > 0 ? 'Active' : '0'}</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="h-40 animate-pulse rounded-[28px] bg-slate-100" />
          ) : assignments.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">Belum ada Open Mic yang ditugaskan kepada kamu.</div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="input-field w-full pl-10 pr-10"
                  placeholder="Cari Open Mic atau nama komika..."
                  aria-label="Cari Open Mic atau nama komika"
                />
                {search && <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Hapus pencarian"><X className="h-4 w-4" /></button>}
              </div>
              <div className="grid grid-cols-3 rounded-xl border border-slate-300 bg-white p-1">
                {([{ value: 'all', label: 'Semua' }, { value: 'pending', label: 'Belum selesai' }, { value: 'completed', label: 'Sudah selesai' }] as const).map((option) => (
                  <button key={option.value} type="button" onClick={() => setProgressFilter(option.value)} className={`min-w-0 rounded-lg px-2 py-2 text-xs font-bold transition ${progressFilter === option.value ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-blue-700'}`}>
                    {option.label}
                  </button>
                ))}
              </div>
              {orderedAssignments.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                  <Search className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="mt-2 text-sm font-bold text-slate-700">Tidak ada hasil yang cocok</p>
                  <p className="mt-1 text-xs text-slate-500">Coba cari berdasarkan judul Open Mic, tanggal, venue, atau nama komika.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs font-semibold text-slate-500">Menampilkan {visibleAssignments.length} dari {orderedAssignments.length} Open Mic</p>
                  {visibleAssignments.map((assignment) => {
            const mic = assignment.open_mic;
            if (!mic) return null;
            const progress = progressByMic[mic.id] ?? { evaluated: 0, total: 0 };
            const isCompleted = progress.total === 0 || progress.evaluated >= progress.total;
            const percentage = progress.total > 0 ? Math.min(100, Math.round((progress.evaluated / progress.total) * 100)) : 0;

            return (
              <button
                key={assignment.open_mic_id}
                onClick={() => router.navigate(`/evaluator/${mic.id}`)}
                className="block w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-[0_8px_22px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_14px_30px_rgba(59,130,246,0.1)] sm:rounded-[24px] sm:p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                      {mic.poster ? <img src={mic.poster} alt={`Poster ${mic.title}`} className="h-full w-full object-cover" /> : <Mic className="h-6 w-6 text-slate-300" />}
                    </div>
                    <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-600">Open Mic</p>
                    <h3 className="mt-1 truncate text-lg font-black tracking-[-0.03em] text-slate-900 sm:text-xl">{mic.title}</h3>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-600 sm:text-sm"><Mic className="h-3.5 w-3.5 text-slate-400" /> {formatDate(mic.date)}</div>
                    </div>
                  </div>
                  <div className={`flex shrink-0 items-center gap-1.5 text-xs font-bold ${isCompleted ? 'text-emerald-700' : 'text-blue-700'}`}>{isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />} {isCompleted ? 'selesai' : 'open'}</div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <span>{progress.total > 0 ? `${progress.evaluated}/${progress.total} dievaluasi` : emptyReasonByMic[mic.id] === 'only-evaluator' ? 'Tidak ada peserta lain yang perlu dievaluasi' : 'Belum ada peserta hadir'}</span>
                  {progress.total > 0 && <><span className="text-slate-300">·</span><span className={isCompleted ? 'text-emerald-600' : 'text-amber-600'}>{isCompleted ? 'Semua selesai' : `${progress.total - progress.evaluated} tersisa`}</span></>}
                </div>
                {progress.total > 0 && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all ${isCompleted ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${percentage}%` }} /></div>}
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-xs font-semibold text-slate-500">{isCompleted ? 'Lihat Evaluasi Selesai' : 'Lanjutkan evaluasi'}</span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-700">Buka <ArrowRight className="h-4 w-4" /></span>
                </div>
              </button>
            );
                  })}
                  {visibleAssignments.length < orderedAssignments.length && (
                    <button type="button" onClick={() => setVisibleLimit((current) => current + 10)} className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50">
                      Tampilkan 10 lagi
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
