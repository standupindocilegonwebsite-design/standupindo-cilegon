import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Save, ShieldAlert, UserRound } from 'lucide-react';
import type { Router } from '@/lib/router';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Evaluation, OpenMic, OpenMicRegistration } from '@/lib/types';

const EMPTY_FORM = {
  material_score: '',
  punchline_score: '',
  delivery_score: '',
  timing_score: '',
  stage_presence_score: '',
  crowd_interaction_score: '',
  strengths: '',
  improvements: '',
  notes: '',
};

function clampScore(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.min(10, parsed));
}

export function EvaluatorEvaluationPage({ router, openMicId }: { router: Router; openMicId: string }) {
  const { user } = useAuth();
  const [mic, setMic] = useState<OpenMic | null>(null);
  const [performers, setPerformers] = useState<OpenMicRegistration[]>([]);
  const [selectedPerformerId, setSelectedPerformerId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    (async () => {
      const [{ data: micData }, { data: performerData }, { data: assignmentData }] = await Promise.all([
        supabase.from('open_mics').select('*').eq('id', openMicId).maybeSingle(),
        supabase
          .from('open_mic_registrations')
          .select('*')
          .eq('open_mic_id', openMicId)
          .eq('attendance_status', 'attended')
          .order('created_at', { ascending: false }),
        supabase
          .from('evaluator_assignments')
          .select('*')
          .eq('open_mic_id', openMicId)
          .eq('evaluator_user_id', user.id)
          .eq('status', 'active')
          .maybeSingle(),
      ]);

      const hasAccess = Boolean(assignmentData);
      if (!hasAccess) {
        router.navigate('/evaluator');
        return;
      }

      setMic(micData as OpenMic | null);
      const performerList = (performerData as OpenMicRegistration[]) ?? [];
      const safeList = performerList.filter((row) => row.id !== undefined)
        .filter((row) => row.id !== user.id);
      setPerformers(safeList);
      setSelectedPerformerId(safeList[0]?.id ?? null);

      if (safeList[0]) {
        const { data: existing } = await supabase
          .from('evaluations')
          .select('*')
          .eq('open_mic_id', openMicId)
          .eq('evaluator_user_id', user.id)
          .eq('performer_registration_id', safeList[0].id)
          .maybeSingle();

        const row = existing as Evaluation | null;
        if (row) {
          setForm({
            material_score: row.material_score?.toString() ?? '',
            punchline_score: row.punchline_score?.toString() ?? '',
            delivery_score: row.delivery_score?.toString() ?? '',
            timing_score: row.timing_score?.toString() ?? '',
            stage_presence_score: row.stage_presence_score?.toString() ?? '',
            crowd_interaction_score: row.crowd_interaction_score?.toString() ?? '',
            strengths: row.strengths ?? '',
            improvements: row.improvements ?? '',
            notes: row.notes ?? '',
          });
        }
      }

      setLoading(false);
    })();
  }, [openMicId, router, user?.id]);

  const selectedPerformer = useMemo(() => performers.find((performer) => performer.id === selectedPerformerId) ?? performers[0] ?? null, [performers, selectedPerformerId]);

  async function handleSave(nextStatus: 'draft' | 'submitted') {
    if (!user?.id || !selectedPerformer) return;

    setSaving(true);

    const payload = {
      open_mic_id: openMicId,
      evaluator_user_id: user.id,
      performer_registration_id: selectedPerformer.id,
      performer_komika_id: selectedPerformer.komika_id,
      material_score: clampScore(form.material_score),
      punchline_score: clampScore(form.punchline_score),
      delivery_score: clampScore(form.delivery_score),
      timing_score: clampScore(form.timing_score),
      stage_presence_score: clampScore(form.stage_presence_score),
      crowd_interaction_score: clampScore(form.crowd_interaction_score),
      strengths: form.strengths.trim() || null,
      improvements: form.improvements.trim() || null,
      notes: form.notes.trim() || null,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from('evaluations')
      .select('id')
      .eq('open_mic_id', openMicId)
      .eq('evaluator_user_id', user.id)
      .eq('performer_registration_id', selectedPerformer.id)
      .maybeSingle();

    let result;
    if (existing?.id) {
      result = await supabase.from('evaluations').update(payload).eq('id', existing.id);
    } else {
      result = await supabase.from('evaluations').insert(payload);
    }

    setSaving(false);
    if (result.error) {
      window.alert('Gagal menyimpan evaluasi: ' + result.error.message);
      return;
    }

    window.alert(nextStatus === 'submitted' ? 'Evaluasi berhasil dikirim.' : 'Draft evaluasi berhasil disimpan.');
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title="Evaluasi Performer" subtitle="Memuat daftar performer yang tampil." />
        <div className="container-app py-8"><div className="h-64 animate-pulse rounded-[28px] bg-slate-100" /></div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title={mic?.title ?? 'Evaluasi Performer'} subtitle="Evaluasi hanya untuk performer yang benar-benar tampil." />

      <div className="container-app py-6 sm:py-8">
        <div className="mx-auto max-w-4xl space-y-5">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600"><UserRound className="h-5 w-5" /></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Performer list</p>
                <h3 className="text-lg font-extrabold text-slate-900">Pemilihan performer</h3>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {performers.map((performer) => (
                <button
                  key={performer.id}
                  type="button"
                  onClick={() => setSelectedPerformerId(performer.id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${selectedPerformer?.id === performer.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  {performer.stage_name || performer.full_name}
                </button>
              ))}
            </div>
          </div>

          {selectedPerformer ? (
            <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Evaluasi</p>
                  <h4 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-900">{selectedPerformer.stage_name || selectedPerformer.full_name}</h4>
                </div>
                <div className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">Performer Tampil</div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ['material_score', 'Material'],
                  ['punchline_score', 'Punchline'],
                  ['delivery_score', 'Delivery'],
                  ['timing_score', 'Timing'],
                  ['stage_presence_score', 'Stage Presence'],
                  ['crowd_interaction_score', 'Crowd Interaction'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="label-field" htmlFor={key}>{label}</label>
                    <input id={key} type="number" min={0} max={10} step="0.1" value={form[key as keyof typeof form]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="input-field" placeholder="0-10" />
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="label-field" htmlFor="strengths">Strengths</label>
                  <textarea id="strengths" value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} rows={3} className="input-field !min-h-[96px]" />
                </div>
                <div>
                  <label className="label-field" htmlFor="improvements">Improvements</label>
                  <textarea id="improvements" value={form.improvements} onChange={(e) => setForm({ ...form, improvements: e.target.value })} rows={3} className="input-field !min-h-[96px]" />
                </div>
                <div>
                  <label className="label-field" htmlFor="notes">Notes</label>
                  <textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} className="input-field !min-h-[120px]" />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={() => void handleSave('draft')} disabled={saving} className="btn-secondary">
                  {saving ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" /> Menyimpan...</> : <><Save className="h-4 w-4" /> Save Draft</>}
                </button>
                <button type="button" onClick={() => void handleSave('submitted')} disabled={saving} className="btn-primary">
                  {saving ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Mengirim...</> : <><CheckCircle2 className="h-4 w-4" /> Submit Evaluation</>}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              Tidak ada performer yang tampil pada Open Mic ini.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
