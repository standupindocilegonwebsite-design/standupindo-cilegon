import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCheck, ClipboardList, Clock3, Mic, Users } from 'lucide-react';
import type { Router } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/PageHeader';
import { formatDate } from '@/lib/format';
import type { OpenMic } from '@/lib/types';

export function EvaluatorDashboardPage({ router }: { router: Router }) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<{ open_mic_id: string; open_mic?: OpenMic }[]>([]);
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
      setLoading(false);
    })();
  }, [user?.id]);

  const stats = useMemo(() => {
    const total = assignments.length;
    const today = new Date();
    const upcoming = assignments.filter((item) => item.open_mic && item.open_mic.date >= today.toISOString().slice(0, 10)).length;
    return { total, upcoming };
  }, [assignments]);

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
          ) : assignments.map((assignment) => {
            const mic = assignment.open_mic;
            if (!mic) return null;

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
                  <div className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-blue-700"><Users className="h-3.5 w-3.5" /> open</div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-xs font-semibold text-slate-500">Lanjutkan evaluasi</span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-700">Buka <ArrowRight className="h-4 w-4" /></span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
