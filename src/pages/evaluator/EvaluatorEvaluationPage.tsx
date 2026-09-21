import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronRight, Save, Search, Sparkles, UserRound, X } from 'lucide-react';
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

const DEMO_FORM = {
  material_score: '8.5',
  punchline_score: '8.0',
  delivery_score: '8.2',
  timing_score: '7.8',
  stage_presence_score: '8.6',
  crowd_interaction_score: '8.1',
  strengths: 'Materi terasa personal, alur cerita jelas, dan punchline mendapat respons penonton yang baik.',
  improvements: 'Bisa memberi jeda sedikit lebih panjang sebelum punchline agar efek komedinya lebih kuat.',
  notes: 'Performa solid dan percaya diri. Pertahankan energi pembawaan serta eksplorasi variasi callback pada materi berikutnya.',
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
  const [performerSearch, setPerformerSearch] = useState('');
  const [performerPickerOpen, setPerformerPickerOpen] = useState(false);
  const [performerFolder, setPerformerFolder] = useState<'pending' | 'completed'>('pending');
  const [evaluationStatuses, setEvaluationStatuses] = useState<Record<string, Evaluation['status']>>({});
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    (async () => {
      const [{ data: micData }, { data: performerData }, { data: assignmentData }, { data: ownProfile }] = await Promise.all([
        supabase.from('open_mics').select('*').eq('id', openMicId).maybeSingle(),
        supabase
          .from('open_mic_registrations')
          .select('*')
          .eq('open_mic_id', openMicId)
          .eq('attendance_status', 'attended')
          .not('komika_id', 'is', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('evaluator_assignments')
          .select('*')
          .or(`open_mic_id.eq.${openMicId},open_mic_id.is.null`)
          .eq('evaluator_user_id', user.id)
          .eq('status', 'active')
          .maybeSingle(),
        supabase.from('komika').select('id').eq('user_id', user.id).maybeSingle(),
      ]);

      const hasAccess = Boolean(assignmentData);
      if (!hasAccess) {
        router.navigate('/evaluator');
        return;
      }

      setMic(micData as OpenMic | null);
      const performerList = (performerData as OpenMicRegistration[]) ?? [];
      const safeList = performerList.filter((row) => row.id !== undefined)
        .filter((row) => row.komika_id !== ownProfile?.id)
        .filter((row) => row.id !== user.id)
        .filter((row) => Boolean(row.komika_id))
        .filter((row) => row.community?.toLowerCase().includes('standupindo cilegon'));
      setPerformers(safeList);
      const { data: evaluationRows } = await supabase.from('evaluations').select('performer_registration_id, status').eq('open_mic_id', openMicId).eq('evaluator_user_id', user.id).in('performer_registration_id', safeList.map((row) => row.id));
      const nextStatuses = Object.fromEntries(((evaluationRows ?? []) as Array<{ performer_registration_id: string; status: Evaluation['status'] }>).map((row) => [row.performer_registration_id, row.status]));
      setEvaluationStatuses(nextStatuses);
      setSelectedPerformerId(safeList.find((row) => nextStatuses[row.id] !== 'submitted')?.id ?? null);

      setLoading(false);
    })();
  }, [openMicId, router, user?.id]);

  useEffect(() => {
    if (!user?.id || !selectedPerformerId) return;
    (async () => {
      setForm(EMPTY_FORM);
      const { data } = await supabase.from('evaluations').select('*').eq('open_mic_id', openMicId).eq('evaluator_user_id', user.id).eq('performer_registration_id', selectedPerformerId).maybeSingle();
      const row = data as Evaluation | null;
      if (row) setForm({ material_score: row.material_score?.toString() ?? '', punchline_score: row.punchline_score?.toString() ?? '', delivery_score: row.delivery_score?.toString() ?? '', timing_score: row.timing_score?.toString() ?? '', stage_presence_score: row.stage_presence_score?.toString() ?? '', crowd_interaction_score: row.crowd_interaction_score?.toString() ?? '', strengths: row.strengths ?? '', improvements: row.improvements ?? '', notes: row.notes ?? '' });
    })();
  }, [openMicId, selectedPerformerId, user?.id]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const selectedPerformer = useMemo(() => performers.find((performer) => performer.id === selectedPerformerId) ?? performers[0] ?? null, [performers, selectedPerformerId]);
  const filteredPerformers = useMemo(() => performers.filter((performer) => `${performer.stage_name} ${performer.full_name} ${performer.community ?? ''}`.toLowerCase().includes(performerSearch.trim().toLowerCase())), [performers, performerSearch]);
  const folderPerformers = filteredPerformers.filter((performer) => performerFolder === 'completed' ? evaluationStatuses[performer.id] === 'submitted' : evaluationStatuses[performer.id] !== 'submitted');
  const pendingCount = performers.filter((performer) => evaluationStatuses[performer.id] !== 'submitted').length;
  const completedCount = performers.filter((performer) => evaluationStatuses[performer.id] === 'submitted').length;

  function fillDemoForm() {
    setForm(DEMO_FORM);
  }

  async function handleSave(nextStatus: 'draft' | 'submitted') {
    if (!user?.id || !selectedPerformer) return;

    const scoreFields = [
      ['Materi', form.material_score],
      ['Punchline', form.punchline_score],
      ['Delivery', form.delivery_score],
      ['Timing', form.timing_score],
      ['Penguasaan Panggung', form.stage_presence_score],
      ['Interaksi Penonton', form.crowd_interaction_score],
    ];
    const invalidScore = scoreFields.find(([, value]) => value.trim() && (Number.isNaN(Number(value)) || Number(value) < 0 || Number(value) > 10));
    if (invalidScore) {
      setFormError(`${invalidScore[0]} harus diisi antara 0 sampai 10.`);
      return;
    }
    setFormError('');

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
      setNotice({ type: 'error', message: `Gagal menyimpan evaluasi: ${result.error.message}` });
      return;
    }

    setEvaluationStatuses((current) => ({ ...current, [selectedPerformer.id]: nextStatus }));
    setNotice({ type: 'success', message: nextStatus === 'submitted' ? 'Evaluasi berhasil dikirim.' : 'Draft evaluasi berhasil disimpan.' });
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
          <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-3 sm:rounded-[24px] sm:p-4">
            <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-blue-100">
              {mic?.poster ? <img src={mic.poster} alt={`Poster ${mic.title}`} className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5 text-blue-300" />}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Open Mic Terpilih</p>
              <p className="truncate text-base font-extrabold text-slate-900 sm:text-lg">{mic?.title ?? 'Open Mic'}</p>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600"><UserRound className="h-5 w-5" /></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Daftar performer</p>
                <h3 className="text-lg font-extrabold text-slate-900">Pemilihan performer</h3>
              </div>
            </div>

            <div className="relative mt-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={selectedPerformer ? selectedPerformer.stage_name : performerSearch} onChange={(event) => { setSelectedPerformerId(null); setPerformerSearch(event.target.value); setPerformerPickerOpen(true); }} onFocus={() => setPerformerPickerOpen(true)} className="input-field !pr-10 !pl-10" placeholder="Cari performer atau komunitas..." autoComplete="off" aria-label="Cari performer" />
                <button type="button" onClick={() => setPerformerPickerOpen((value) => !value)} className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Buka daftar performer"><ChevronRight className={`h-4 w-4 transition-transform ${performerPickerOpen ? 'rotate-90 text-blue-600' : ''}`} /></button>
              </div>
              {performerPickerOpen && <>
                <button type="button" className="fixed inset-0 z-20 cursor-default" onClick={() => setPerformerPickerOpen(false)} aria-label="Tutup daftar performer" />
                <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-blue-100 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
                  {folderPerformers.length > 0 && <PerformerOptions title={performerFolder === 'completed' ? 'Sudah dievaluasi · Preview' : 'Belum dievaluasi'} performers={folderPerformers} selectedId={selectedPerformer?.id ?? null} evaluationStatuses={evaluationStatuses} onSelect={(id) => { setSelectedPerformerId(id); setPerformerSearch(''); setPerformerPickerOpen(false); }} />}
                  {folderPerformers.length === 0 && <p className="px-3 py-3 text-sm text-slate-500">{performerFolder === 'completed' ? 'Belum ada evaluasi terkirim.' : 'Semua performer sudah dievaluasi.'}</p>}
                </div>
              </>}
            </div>
            <div className="mt-3 flex gap-2 rounded-xl bg-slate-100 p-1">
              <button type="button" onClick={() => { setPerformerFolder('pending'); setSelectedPerformerId(performers.find((performer) => evaluationStatuses[performer.id] !== 'submitted')?.id ?? null); }} className={`flex-1 rounded-lg px-3 py-2 text-xs font-extrabold transition ${performerFolder === 'pending' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Belum dievaluasi <span className="ml-1">{pendingCount}</span></button>
              <button type="button" onClick={() => { setPerformerFolder('completed'); setSelectedPerformerId(performers.find((performer) => evaluationStatuses[performer.id] === 'submitted')?.id ?? null); }} className={`flex-1 rounded-lg px-3 py-2 text-xs font-extrabold transition ${performerFolder === 'completed' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Sudah dievaluasi <span className="ml-1">{completedCount}</span></button>
            </div>
          </div>

          {selectedPerformer ? (
            <div className="rounded-[28px] border border-blue-100 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{evaluationStatuses[selectedPerformer.id] === 'submitted' ? 'Preview Evaluasi' : 'Evaluasi'}</p>
                  <h4 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-900">{selectedPerformer.stage_name || selectedPerformer.full_name}</h4>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{selectedPerformer.community || 'Komunitas belum diisi'}</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {evaluationStatuses[selectedPerformer.id] !== 'submitted' && (
                    <button type="button" onClick={fillDemoForm} className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100" title="Isi semua field dengan contoh dummy">
                      <Sparkles className="h-3.5 w-3.5" /> Isi Contoh
                    </button>
                  )}
                  <div className="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">Performer Tampil</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                {[
                  ['material_score', 'Materi'],
                  ['punchline_score', 'Punchline'],
                  ['delivery_score', 'Delivery'],
                  ['timing_score', 'Timing'],
                  ['stage_presence_score', 'Penguasaan Panggung'],
                  ['crowd_interaction_score', 'Interaksi Penonton'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="label-field" htmlFor={key}>{label}</label>
                    <input id={key} type="number" min={0} max={10} step="0.1" value={form[key as keyof typeof form]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} disabled={evaluationStatuses[selectedPerformer.id] === 'submitted'} className="input-field disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600" placeholder="0-10" />
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label-field" htmlFor="strengths">Kekuatan</label>
                  <textarea id="strengths" value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} disabled={evaluationStatuses[selectedPerformer.id] === 'submitted'} rows={3} className="input-field !min-h-[96px] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600" />
                </div>
                <div>
                  <label className="label-field" htmlFor="improvements">Pengembangan</label>
                  <textarea id="improvements" value={form.improvements} onChange={(e) => setForm({ ...form, improvements: e.target.value })} disabled={evaluationStatuses[selectedPerformer.id] === 'submitted'} rows={3} className="input-field !min-h-[96px] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label-field" htmlFor="notes">Catatan</label>
                  <textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} disabled={evaluationStatuses[selectedPerformer.id] === 'submitted'} rows={4} className="input-field !min-h-[120px] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600" />
                </div>
              </div>

              {evaluationStatuses[selectedPerformer.id] !== 'submitted' && <div className="mt-5 flex flex-wrap gap-3">
                {formError && <p className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{formError}</p>}
                <button type="button" onClick={() => void handleSave('draft')} disabled={saving} className="btn-secondary">
                  {saving ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" /> Menyimpan...</> : <><Save className="h-4 w-4" /> Simpan Draft</>}
                </button>
                <button type="button" onClick={() => void handleSave('submitted')} disabled={saving} className="btn-primary">
                  {saving ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Mengirim...</> : <><CheckCircle2 className="h-4 w-4" /> Kirim Evaluasi</>}
                </button>
              </div>}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm sm:rounded-[28px] sm:p-8">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><UserRound className="h-6 w-6" /></div>
              <p className="mt-3 text-sm font-bold text-slate-700">Belum ada performer yang bisa dievaluasi</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">Hanya anggota Standupindo Cilegon yang sudah ditandai tampil yang dapat dievaluasi.</p>
            </div>
          )}
        </div>
      </div>
      {notice && (
        <div className="fixed inset-x-4 bottom-4 z-[220] sm:left-auto sm:right-5 sm:max-w-md" role="status" aria-live="polite">
          <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-[0_16px_36px_rgba(15,23,42,0.18)] backdrop-blur-md ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-600 text-white' : 'border-red-200 bg-red-600 text-white'}`}>
            {notice.type === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />}
            <p className="min-w-0 flex-1 text-sm font-semibold leading-5">{notice.message}</p>
            <button type="button" onClick={() => setNotice(null)} className="rounded-lg p-1 text-white/80 transition hover:bg-white/15 hover:text-white" aria-label="Tutup notifikasi"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function PerformerOptions({ title, performers, selectedId, evaluationStatuses, onSelect }: { title: string; performers: OpenMicRegistration[]; selectedId: string | null; evaluationStatuses: Record<string, Evaluation['status']>; onSelect: (id: string) => void }) {
  return (
    <div className="p-1">
      <p className="px-2.5 py-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">{title}</p>
      {performers.map((performer) => <button key={performer.id} type="button" onClick={() => onSelect(performer.id)} className="flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-blue-50"><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{performer.stage_name || performer.full_name}</span><span className="block truncate text-xs font-medium text-slate-500">{performer.community || 'Komunitas belum diisi'}</span></span><span className="flex shrink-0 items-center gap-2">{evaluationStatuses[performer.id] && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label={evaluationStatuses[performer.id] === 'submitted' ? 'Sudah dikirim' : 'Draft tersimpan'} />} {selectedId === performer.id && <CheckCircle2 className="h-4 w-4 text-blue-600" />}</span></button>)}
    </div>
  );
}
