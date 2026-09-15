import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCheck, ChevronRight, ClipboardList, Mic } from 'lucide-react';
import type { Router } from '@/lib/router';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Evaluation, OpenMic, OpenMicRegistration } from '@/lib/types';

export function MemberEvaluationPage({ router }: { router: Router }) {
  const { user } = useAuth();
  const [records, setRecords] = useState<Array<{
    evaluation: Evaluation;
    openMic: OpenMic | null;
    performerRegistration: OpenMicRegistration | null;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    (async () => {
      const { data: komikaRow } = await supabase
        .from('komika')
        .select('id')
        .or(`user_id.eq.${user.id},id.eq.${user.id}`)
        .maybeSingle();

      const memberKomikaId = komikaRow?.id ?? null;
      if (!memberKomikaId) {
        setRecords([]);
        setLoading(false);
        return;
      }

      const { data: registrations } = await supabase
        .from('open_mic_registrations')
        .select('*')
        .eq('komika_id', memberKomikaId)
        .order('created_at', { ascending: false });

      const registrationRows = (registrations as OpenMicRegistration[]) ?? [];
      const registrationIds = registrationRows.map((row) => row.id);

      if (registrationIds.length === 0) {
        setRecords([]);
        setLoading(false);
        return;
      }

      const { data: evalRows } = await supabase
        .from('evaluations')
        .select('*')
        .in('performer_registration_id', registrationIds)
        .order('created_at', { ascending: false });

      const evaluations = (evalRows as Evaluation[]) ?? [];
      const openMicIds = [...new Set(evaluations.map((item) => item.open_mic_id))];
      let openMics: OpenMic[] = [];
      if (openMicIds.length > 0) {
        const { data: micData } = await supabase
          .from('open_mics')
          .select('*')
          .in('id', openMicIds);
        openMics = (micData as OpenMic[]) ?? [];
      }

      const mapped = evaluations.map((evaluation) => {
        const performerRegistration = registrationRows.find((row) => row.id === evaluation.performer_registration_id) ?? null;
        const openMic = openMics.find((row) => row.id === evaluation.open_mic_id) ?? null;
        return { evaluation, performerRegistration, openMic };
      });

      setRecords(mapped);
      setLoading(false);
    })();
  }, [user?.id]);

  const totalScore = useMemo(() => records.reduce((sum, item) => sum + (item.evaluation.material_score ?? 0) + (item.evaluation.punchline_score ?? 0) + (item.evaluation.delivery_score ?? 0) + (item.evaluation.timing_score ?? 0) + (item.evaluation.stage_presence_score ?? 0) + (item.evaluation.crowd_interaction_score ?? 0), 0), [records]);

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Evaluasi Saya" subtitle="Lihat evaluasi yang diberikan untuk performa kamu." />

      <div className="container-app py-6 sm:py-8">
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-blue-600"><ClipboardList className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-[0.12em]">Evaluasi</span></div>
            <p className="mt-2 text-3xl font-black text-slate-900">{records.length}</p>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-600"><CheckCheck className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-[0.12em]">Selesai</span></div>
            <p className="mt-2 text-3xl font-black text-slate-900">{records.filter((row) => row.evaluation.status === 'submitted').length}</p>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-amber-600"><Mic className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-[0.12em]">Skor total</span></div>
            <p className="mt-2 text-3xl font-black text-slate-900">{records.length > 0 ? totalScore.toFixed(1) : '0.0'}</p>
          </div>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="h-48 animate-pulse rounded-[28px] bg-slate-100" />
          ) : records.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">Belum ada evaluasi untuk performa kamu.</div>
          ) : records.map(({ evaluation, openMic, performerRegistration }) => (
            <div key={evaluation.id} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">{openMic?.title ?? 'Open Mic'}</p>
                  <h3 className="mt-1 text-xl font-black tracking-[-0.04em] text-slate-900">{performerRegistration?.stage_name || performerRegistration?.full_name || 'Performa kamu'}</h3>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${evaluation.status === 'submitted' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                  {evaluation.status}
                </span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ['Material', evaluation.material_score],
                  ['Punchline', evaluation.punchline_score],
                  ['Delivery', evaluation.delivery_score],
                  ['Timing', evaluation.timing_score],
                  ['Stage Presence', evaluation.stage_presence_score],
                  ['Crowd Interaction', evaluation.crowd_interaction_score],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
                    <div className="mt-1 text-lg font-black text-slate-900">{value ?? '-'}</div>
                  </div>
                ))}
              </div>

              {evaluation.strengths && (
                <div className="mt-4 rounded-2xl bg-blue-50 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700">Strengths</div>
                  <p className="mt-1 text-sm text-slate-700">{evaluation.strengths}</p>
                </div>
              )}

              {evaluation.improvements && (
                <div className="mt-3 rounded-2xl bg-amber-50 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">Improvement</div>
                  <p className="mt-1 text-sm text-slate-700">{evaluation.improvements}</p>
                </div>
              )}

              {evaluation.notes && (
                <div className="mt-3 rounded-2xl bg-slate-100 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">Notes</div>
                  <p className="mt-1 text-sm text-slate-700">{evaluation.notes}</p>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-500">{openMic ? new Date(openMic.date).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : 'Tanggal tidak tersedia'}</span>
                <button onClick={() => router.navigate('/member')} className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-700">
                  Kembali <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
