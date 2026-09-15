import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCheck, ClipboardList, Mic } from 'lucide-react';
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
    evaluatorName: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedOpenMicId, setSelectedOpenMicId] = useState('all');

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoadError('');
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

      const [{ data: directEvalRows, error: directEvalError }, { data: linkedEvalRows, error: linkedEvalError }] = await Promise.all([
        supabase.from('evaluations').select('*').eq('performer_komika_id', memberKomikaId).order('created_at', { ascending: false }),
        registrationIds.length > 0
          ? supabase.from('evaluations').select('*').in('performer_registration_id', registrationIds).order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (directEvalError || linkedEvalError) {
        setLoadError('Evaluasi belum dapat dimuat. Silakan coba lagi atau hubungi admin.');
        setRecords([]);
        setLoading(false);
        return;
      }

      const evaluationMap = new Map<string, Evaluation>();
      ([...(directEvalRows ?? []), ...(linkedEvalRows ?? [])] as Evaluation[]).forEach((evaluation) => evaluationMap.set(evaluation.id, evaluation));
      const evaluations = Array.from(evaluationMap.values()).sort((first, second) => second.created_at.localeCompare(first.created_at));
      const openMicIds = [...new Set(evaluations.map((item) => item.open_mic_id))];
      const evaluatorIds = [...new Set(evaluations.map((item) => item.evaluator_user_id))];
      let openMics: OpenMic[] = [];
      let evaluatorNames = new Map<string, string>();
      if (openMicIds.length > 0) {
        const { data: micData } = await supabase
          .from('open_mics')
          .select('*')
          .in('id', openMicIds);
        openMics = (micData as OpenMic[]) ?? [];
      }
      if (evaluatorIds.length > 0) {
        const { data: evaluatorProfiles } = await supabase.from('komika').select('user_id, stage_name, full_name').in('user_id', evaluatorIds);
        evaluatorNames = new Map((evaluatorProfiles ?? []).map((profile) => [profile.user_id, profile.stage_name || profile.full_name || 'Evaluator']));
      }

      const mapped = evaluations.map((evaluation) => {
        const performerRegistration = registrationRows.find((row) => row.id === evaluation.performer_registration_id) ?? null;
        const openMic = openMics.find((row) => row.id === evaluation.open_mic_id) ?? null;
        return { evaluation, performerRegistration, openMic, evaluatorName: evaluatorNames.get(evaluation.evaluator_user_id) ?? 'Evaluator' };
      });

      setRecords(mapped);
      setLoading(false);
    })();
  }, [user?.id]);

  const totalScore = useMemo(() => records.reduce((sum, item) => sum + (item.evaluation.material_score ?? 0) + (item.evaluation.punchline_score ?? 0) + (item.evaluation.delivery_score ?? 0) + (item.evaluation.timing_score ?? 0) + (item.evaluation.stage_presence_score ?? 0) + (item.evaluation.crowd_interaction_score ?? 0), 0), [records]);
  const visibleRecords = useMemo(() => selectedOpenMicId === 'all' ? records : records.filter((item) => item.evaluation.open_mic_id === selectedOpenMicId), [records, selectedOpenMicId]);
  const openMicOptions = useMemo(() => records.filter((item, index, all) => item.openMic && all.findIndex((candidate) => candidate.evaluation.open_mic_id === item.evaluation.open_mic_id) === index), [records]);

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Evaluasi Saya" subtitle="Lihat evaluasi yang diberikan untuk performa kamu." />

      <div className="container-app py-6 sm:py-8">
        <div className="mb-4 grid grid-cols-3 gap-2.5 sm:gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-[24px] sm:p-4">
            <div className="flex items-center gap-2 text-blue-600"><ClipboardList className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-[0.12em]">Evaluasi</span></div>
            <p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">{records.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-[24px] sm:p-4">
            <div className="flex items-center gap-2 text-emerald-600"><CheckCheck className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-[0.12em]">Selesai</span></div>
            <p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">{records.filter((row) => row.evaluation.status === 'submitted').length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-[24px] sm:p-4">
            <div className="flex items-center gap-2 text-amber-600"><Mic className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-[0.12em]">Skor total</span></div>
            <p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">{records.length > 0 ? totalScore.toFixed(1) : '0.0'}</p>
          </div>
        </div>

        {records.length > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <Mic className="h-4 w-4 shrink-0 text-blue-600" />
            <select value={selectedOpenMicId} onChange={(event) => setSelectedOpenMicId(event.target.value)} className="input-field !min-h-10 !py-2 text-sm font-bold" aria-label="Filter evaluasi berdasarkan Open Mic">
              <option value="all">Semua Open Mic</option>
              {openMicOptions.map((item) => <option key={item.evaluation.open_mic_id} value={item.evaluation.open_mic_id}>{item.openMic?.title ?? 'Open Mic'}</option>)}
            </select>
          </div>
        )}

        <div className="space-y-3">
          {loading ? (
            <div className="h-48 animate-pulse rounded-[28px] bg-slate-100" />
          ) : loadError ? (
            <div className="rounded-[28px] border border-red-200 bg-red-50 p-8 text-center text-sm font-semibold text-red-700">{loadError}</div>
          ) : records.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">Belum ada evaluasi untuk performa kamu.</div>
          ) : visibleRecords.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">Belum ada evaluasi untuk Open Mic ini.</div>
          ) : visibleRecords.map(({ evaluation, openMic, performerRegistration, evaluatorName }, index) => {
            const showOpenMic = index === 0 || visibleRecords[index - 1].evaluation.open_mic_id !== evaluation.open_mic_id;
            const evaluatorCount = visibleRecords.filter((item) => item.evaluation.open_mic_id === evaluation.open_mic_id).length;
            return (
            <div key={evaluation.id} className="space-y-2">
              {showOpenMic && <details className="group rounded-2xl border border-blue-200 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
                <summary className="flex cursor-pointer list-none items-center gap-3 p-3 sm:p-4">
                  <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">{openMic?.poster ? <img src={openMic.poster} alt={`Poster ${openMic.title}`} className="h-full w-full object-cover" /> : <Mic className="h-5 w-5 text-slate-300" />}</div>
                  <div className="min-w-0 flex-1"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Open Mic Dihadiri</p><h3 className="truncate text-lg font-black text-slate-900">{openMic?.title ?? 'Open Mic'}</h3><p className="mt-1 truncate text-xs font-semibold text-slate-500">{openMic?.venue ?? 'Lokasi tidak tersedia'} · {openMic ? new Date(openMic.date).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : 'Tanggal tidak tersedia'}</p></div>
                  <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold text-blue-700">{evaluatorCount} evaluator</span>
                </summary>
                <div className="border-t border-slate-100 px-4 py-3 text-xs font-semibold text-slate-500">Buka nama evaluator di bawah untuk melihat detail penilaian.</div>
              </details>}
              <details className="group rounded-2xl border border-slate-200 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
              <summary className="cursor-pointer list-none p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">Evaluator</p>
                    <h3 className="mt-1 truncate text-xl font-black tracking-[-0.04em] text-slate-900">{evaluatorName}</h3>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500"><span className="text-slate-800">{openMic?.title ?? 'Open Mic'}</span> · {performerRegistration?.stage_name || performerRegistration?.full_name || 'Performa kamu'}</p>
                  </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${evaluation.status === 'submitted' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                  {evaluation.status}
                </span>
                </div>
              </summary>

              <div className="border-t border-slate-100 px-4 pb-4 sm:px-5 sm:pb-5">
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                {[
                  ['Materi', evaluation.material_score],
                  ['Punchline', evaluation.punchline_score],
                  ['Penyampaian', evaluation.delivery_score],
                  ['Timing', evaluation.timing_score],
                  ['Penguasaan Panggung', evaluation.stage_presence_score],
                  ['Interaksi Penonton', evaluation.crowd_interaction_score],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200 sm:rounded-2xl sm:p-3">
                    <div className="text-[9px] font-extrabold uppercase leading-4 tracking-[0.08em] text-slate-600 sm:text-[10px] sm:tracking-[0.12em]">{label}</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{value ?? '-'}</div>
                  </div>
                ))}
              </div>

              {(evaluation.strengths || evaluation.improvements || evaluation.notes) && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {evaluation.strengths && <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3"><div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-blue-800">Kekuatan</div><p className="mt-1.5 text-sm font-medium leading-5 text-slate-800">{evaluation.strengths}</p></div>}
                  {evaluation.improvements && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3"><div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-amber-800">Pengembangan</div><p className="mt-1.5 text-sm font-medium leading-5 text-slate-800">{evaluation.improvements}</p></div>}
                  {evaluation.notes && <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 sm:col-span-2"><div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-700">Catatan</div><p className="mt-1.5 text-sm font-medium leading-5 text-slate-800">{evaluation.notes}</p></div>}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-500">{openMic ? new Date(openMic.date).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : 'Tanggal tidak tersedia'}</span>
                <button onClick={() => window.history.length > 1 ? window.history.back() : router.navigate('/member')} className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-700">
                  Kembali <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              </div>
              </details>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
