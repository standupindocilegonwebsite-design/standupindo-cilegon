import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCheck, ClipboardList, Clock3, Mic, Users } from 'lucide-react';
import type { Router } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/PageHeader';
import { formatDate } from '@/lib/format';
import type { OpenMic, OpenMicRegistration } from '@/lib/types';

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

      let openMics: OpenMic[] = [];
      if (micIds.length > 0) {
        const { data: micData } = await supabase
          .from('open_mics')
          .select('*')
          .in('id', micIds)
          .order('date', { ascending: false });
        openMics = (micData as OpenMic[]) ?? [];
      }

      const combined = rowList.map((row) => ({
        ...row,
        open_mic: openMics.find((mic) => mic.id === row.open_mic_id),
      }));

      setAssignments(combined);
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
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-blue-600"><ClipboardList className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-[0.12em]">Assigned</span></div>
            <p className="mt-3 text-3xl font-black text-slate-900">{stats.total}</p>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-amber-600"><Clock3 className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-[0.12em]">Upcoming</span></div>
            <p className="mt-3 text-3xl font-black text-slate-900">{stats.upcoming}</p>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-600"><CheckCheck className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-[0.12em]">Progress</span></div>
            <p className="mt-3 text-3xl font-black text-slate-900">{stats.total > 0 ? 'Active' : '0'}</p>
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
                className="block w-full rounded-[28px] border border-slate-200 bg-white p-4 text-left shadow-[0_10px_28px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_14px_30px_rgba(59,130,246,0.1)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-600">Open Mic</p>
                    <h3 className="mt-2 text-xl font-black tracking-[-0.04em] text-slate-900">{mic.title}</h3>
                    <div className="mt-2 flex items-center gap-2 text-sm text-slate-600"><Mic className="h-4 w-4 text-slate-400" /> {formatDate(mic.date)}</div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-bold text-blue-700"><Users className="h-4 w-4" /> open</div>
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
