import { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Building2, CalendarDays, CheckCircle2, Clock3, Globe2, MapPin, Mic, Plus, Trash2, XCircle } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { MemberOpenMicHistorySubmission, OpenMic } from '@/lib/types';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';
import { CommunityCombobox } from '@/components/ui/CommunityCombobox';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { Modal } from '@/components/ui/Modal';

type FormState = { title: string; organizer_name: string; event_date: string; event_time: string; venue: string; city: string; notes: string; proof_url: string };
type PageMode = 'overview' | 'choices' | 'mc-kind' | 'internal-mics' | 'performance-form' | 'mc-external-form';

const emptyForm: FormState = { title: '', organizer_name: '', event_date: '', event_time: '', venue: '', city: '', notes: '', proof_url: '' };

function SubmissionCard({ item, deleting, onDelete, showType = false }: { item: MemberOpenMicHistorySubmission; deleting: boolean; onDelete: (item: MemberOpenMicHistorySubmission) => void; showType?: boolean }) {
  const [proofOpen, setProofOpen] = useState(false);
  const isMcEntry = item.activity_type === 'mc_internal' || item.activity_type === 'mc_external';
  const status = item.status === 'approved'
    ? { label: 'Disetujui', icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-700' }
    : item.status === 'rejected'
      ? { label: 'Ditolak', icon: XCircle, className: 'bg-red-50 text-red-700' }
      : { label: isMcEntry ? 'Menunggu Verifikasi' : 'Menunggu review', icon: Clock3, className: 'bg-amber-50 text-amber-700' };
  const Icon = status.icon;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-extrabold text-slate-900">{item.title}</h4>
          <p className="mt-0.5 text-xs text-slate-500">{item.organizer_name}{showType && ` · ${item.activity_type === 'mc_internal' ? 'MC Internal' : 'MC Eksternal'}`}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${status.className}`}><Icon className="h-3.5 w-3.5" />{status.label}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatDate(item.event_date)}{item.event_time ? ` · ${item.event_time}` : ''}</span>
        <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{item.venue}{item.city ? `, ${item.city}` : ''}</span>
      </div>
      {item.admin_note && item.status === 'rejected' && <p className="mt-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-700">{item.admin_note}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        {item.proof_url && <button type="button" onClick={() => setProofOpen(true)} className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:underline">Lihat bukti</button>}
        {item.status === 'rejected' && <button type="button" disabled={deleting} onClick={() => onDelete(item)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60" aria-label={deleting ? 'Menghapus pengajuan' : 'Hapus pengajuan'} title={deleting ? 'Menghapus pengajuan' : 'Hapus pengajuan'}><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
      {item.proof_url && <ImageLightbox src={item.proof_url} alt={`Bukti aktivitas ${item.title}`} open={proofOpen} onClose={() => setProofOpen(false)} closeAriaLabel="Tutup bukti aktivitas" />}
    </div>
  );
}

export function MemberOpenMicHistoryPage({ router }: { router: Router }) {
  const { user } = useAuth();
  const [komikaId, setKomikaId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<MemberOpenMicHistorySubmission[]>([]);
  const [internalOpenMics, setInternalOpenMics] = useState<OpenMic[]>([]);
  const [mode, setMode] = useState<PageMode>(router.query.get('add') === '1' ? 'choices' : 'overview');
  const [modeHistory, setModeHistory] = useState<PageMode[]>([]);
  const [mcExternalAlsoPerformed, setMcExternalAlsoPerformed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function navigateMode(nextMode: PageMode) {
    setModeHistory((history) => [...history, mode]);
    setMode(nextMode);
  }

  async function loadHistory() {
    if (!user?.id) return;
    const { data: profile } = await supabase.from('komika').select('id').or(`user_id.eq.${user.id},id.eq.${user.id}`).maybeSingle();
    const id = profile?.id ?? null;
    setKomikaId(id);
    if (!id) return;
    const { data: submissionData, error: submissionError } = await supabase.from('member_open_mic_history_submissions').select('*').eq('komika_id', id).order('event_date', { ascending: false });
    if (submissionError) setError('Riwayat belum dapat dimuat. Coba segarkan halaman beberapa saat lagi.');
    setSubmissions((submissionData as MemberOpenMicHistorySubmission[]) ?? []);
    const { data: openMicData, error: openMicError } = await supabase.from('open_mics').select('*').neq('status', 'cancelled').order('date', { ascending: false });
    if (openMicError) setError('Daftar Open Mic internal gagal dimuat.');
    setInternalOpenMics((openMicData as OpenMic[]) ?? []);
  }

  useEffect(() => { void loadHistory(); }, [user?.id]);

  const mcSubmissions = submissions.filter((item) => item.activity_type === 'mc_internal' || item.activity_type === 'mc_external');
  const performerSubmissions = submissions.filter((item) => !item.activity_type || item.activity_type === 'performance');
  const performerStatusSubmissions = performerSubmissions.filter((item) => item.status !== 'approved');
  const jakartaDateParts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const jakartaToday = `${jakartaDateParts.find((part) => part.type === 'year')?.value}-${jakartaDateParts.find((part) => part.type === 'month')?.value}-${jakartaDateParts.find((part) => part.type === 'day')?.value}`;
  const completedOpenMics = internalOpenMics.filter((item) => item.status === 'completed' || item.date < jakartaToday);

  function updateForm(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function goBack() {
    setError('');
    setMode(modeHistory[modeHistory.length - 1] ?? 'overview');
    setModeHistory((history) => history.slice(0, -1));
  }

  async function submitHistory(event: React.FormEvent, activityType: 'performance' | 'mc_external') {
    event.preventDefault();
    if (!user?.id || !komikaId) {
      setError('Profil komika belum tersedia. Lengkapi profil sebelum mengirim riwayat.');
      return;
    }
    const title = form.title.trim();
    const organizerName = form.organizer_name.trim();
    const venue = form.venue.trim();
    if (!title || !organizerName || !form.event_date || !venue || (activityType === 'performance' && !form.city.trim()) || !form.proof_url) {
      setError(activityType === 'performance' ? 'Semua field wajib diisi kecuali catatan.' : 'Nama acara, penyelenggara, tanggal, lokasi, dan bukti dokumentasi wajib diisi.');
      return;
    }
    const sameEvent = (item: MemberOpenMicHistorySubmission) => item.title.trim().toLowerCase() === title.toLowerCase()
      && item.event_date === form.event_date
      && item.venue.trim().toLowerCase() === venue.toLowerCase();
    const existingActivity = submissions.some((item) => (item.activity_type ?? 'performance') === activityType && sameEvent(item));
    const existingPerformance = submissions.some((item) => (item.activity_type ?? 'performance') === 'performance' && sameEvent(item));
    const creatingBothRoles = activityType === 'mc_external' && mcExternalAlsoPerformed && !existingActivity && !existingPerformance;
    const addPerformanceToExistingMc = activityType === 'mc_external' && mcExternalAlsoPerformed && existingActivity && !existingPerformance;
    if (existingActivity && !addPerformanceToExistingMc) {
      setError('Riwayat dengan judul, tanggal, dan venue yang sama sudah pernah dikirim.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    const submissionBase = {
      user_id: user.id,
      komika_id: komikaId,
      title,
      organizer_name: organizerName,
      event_date: form.event_date,
      event_time: form.event_time.trim() || null,
      venue,
      city: form.city.trim() || null,
      notes: form.notes.trim() || null,
      proof_url: form.proof_url.trim() || null,
      status: 'pending',
    };
    const submissionsToCreate: Array<typeof submissionBase & { activity_type: 'performance' | 'mc_external' }> = addPerformanceToExistingMc
      ? []
      : [{ ...submissionBase, activity_type: activityType }];
    if (activityType === 'mc_external' && mcExternalAlsoPerformed && !existingPerformance) {
      submissionsToCreate.push({ ...submissionBase, activity_type: 'performance' });
    }
    const { error: saveError } = await supabase.from('member_open_mic_history_submissions').insert(submissionsToCreate);
    setSaving(false);
    if (saveError) {
      setError(saveError.code === '23505' ? 'Riwayat dengan judul, tanggal, dan venue yang sama sudah pernah dikirim.' : 'Riwayat gagal dikirim. Coba lagi beberapa saat.');
      return;
    }
    setForm(emptyForm);
    setMcExternalAlsoPerformed(false);
    setModeHistory([]);
    setMode('overview');
    setSuccess(addPerformanceToExistingMc
      ? 'Riwayat tampil Open Mic berhasil ditambahkan dan menunggu review admin.'
      : creatingBothRoles
        ? 'Riwayat MC dan tampil berhasil dikirim untuk verifikasi masing-masing.'
        : activityType === 'mc_external' && mcExternalAlsoPerformed
          ? 'Riwayat MC berhasil dikirim; riwayat tampil untuk acara ini sudah tercatat.'
        : activityType === 'mc_external'
          ? 'Riwayat MC berhasil dikirim dan menunggu verifikasi admin.'
          : 'Riwayat berhasil dikirim dan menunggu review admin.');
    await loadHistory();
  }

  async function submitInternalMc(openMic: OpenMic) {
    if (!user?.id || !komikaId) {
      setError('Profil komika belum tersedia. Lengkapi profil sebelum mengirim riwayat.');
      return;
    }
    if (mcSubmissions.some((item) => item.activity_type === 'mc_internal' && item.internal_open_mic_id === openMic.id)) {
      setError('Pengajuan MC untuk Open Mic ini sudah pernah dikirim.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    const { error: saveError } = await supabase.from('member_open_mic_history_submissions').insert({
      user_id: user.id,
      komika_id: komikaId,
      activity_type: 'mc_internal',
      internal_open_mic_id: openMic.id,
      title: openMic.title,
      organizer_name: 'Standupindo Cilegon',
      event_date: openMic.date,
      event_time: openMic.time,
      venue: openMic.venue,
      city: openMic.location,
      status: 'pending',
    });
    setSaving(false);
    if (saveError) {
      setError(saveError.code === '23505' ? 'Pengajuan MC untuk Open Mic ini sudah pernah dikirim.' : 'Pengajuan MC gagal dikirim. Coba lagi beberapa saat.');
      return;
    }
    setModeHistory([]);
    setMode('overview');
    setSuccess('Riwayat MC berhasil dikirim dan menunggu verifikasi admin.');
    await loadHistory();
  }

  async function deleteRejectedSubmission(item: MemberOpenMicHistorySubmission) {
    if (item.status !== 'rejected' || !window.confirm(`Hapus pengajuan "${item.title}"?`)) return;
    setDeletingId(item.id);
    setError('');
    setSuccess('');
    const { error: deleteError } = await supabase.from('member_open_mic_history_submissions').delete().eq('id', item.id).eq('user_id', user?.id ?? '');
    setDeletingId(null);
    if (deleteError) {
      setError('Pengajuan gagal dihapus. Coba lagi beberapa saat.');
      return;
    }
    setSuccess('Pengajuan ditolak berhasil dihapus.');
    await loadHistory();
  }

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Riwayat Open Mic" subtitle="Catat pengalaman tampil Open Mic dan pengalaman menjadi MC." />
      <div className="container-app py-6 sm:py-8">
        {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        {success && <div role="status" className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>}
        <div className="mx-auto max-w-2xl space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-lg font-extrabold text-slate-900">Aktivitas Open Mic</h2><p className="mt-0.5 text-xs text-slate-500">Riwayat tampil dan pengalaman MC tercatat terpisah.</p></div>
            {mode === 'overview'
              ? <button type="button" onClick={() => { setModeHistory([]); navigateMode('choices'); setError(''); }} aria-label="Tambahkan riwayat" title="Tambahkan riwayat" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"><Plus className="h-5 w-5" /></button>
              : <button type="button" onClick={goBack} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600"><ArrowLeft className="h-4 w-4" /> Kembali</button>}
          </div>
          {mode === 'internal-mics' && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-base font-extrabold text-slate-900">Pilih Open Mic Internal yang Selesai</h3><div className="mt-3 space-y-2">{completedOpenMics.map((openMic) => { const alreadySubmitted = mcSubmissions.some((item) => item.activity_type === 'mc_internal' && item.internal_open_mic_id === openMic.id); return <button key={openMic.id} type="button" disabled={saving || alreadySubmitted} onClick={() => void submitInternalMc(openMic)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-3.5 py-3.5 text-left transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900">{openMic.title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{formatDate(openMic.date)}{openMic.time ? ` · ${openMic.time}` : ''} · {openMic.venue}{openMic.location ? ` · ${openMic.location}` : ''}</span></span><span className="shrink-0 text-xs font-bold text-blue-700">{alreadySubmitted ? 'Sudah diajukan' : saving ? 'Mengirim...' : 'Ajukan'}</span></button>; })}{completedOpenMics.length === 0 && <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">Belum ada Open Mic internal yang selesai.</p>}</div></section>}
          {(mode === 'performance-form' || mode === 'mc-external-form') && <form onSubmit={(event) => void submitHistory(event, mode === 'mc-external-form' ? 'mc_external' : 'performance')} className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_12px_28px_rgba(37,99,235,0.08)]">
              <div className="bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 px-4 py-4 text-white sm:px-5">
                <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg ring-1 ring-white/25">🎤</span><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-100">{mode === 'mc-external-form' ? 'Riwayat MC Eksternal' : 'Riwayat Panggung'}</p><h2 className="mt-0.5 text-lg font-black">{mode === 'mc-external-form' ? 'Tambah Riwayat MC' : 'Tambah Riwayat Open Mic'}</h2><p className="mt-1 text-xs leading-5 text-blue-50">{mode === 'mc-external-form' ? 'Catat acara eksternal tempat kamu menjadi MC.' : 'Catat penampilan di komunitas atau penyelenggara lain.'}</p></div></div>
              </div>
              <div className="p-4 sm:p-5">
                <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-800">
                  <span className="mt-0.5 shrink-0">ⓘ</span>
                  <p><span className="font-extrabold">Catatan penting:</span> {mode === 'mc-external-form' ? 'Riwayat MC hanya menambah pengalaman MC dan tidak dihitung sebagai penampilan komika.' : 'Riwayat Open Mic di luar komunitas ini hanya dicatat sebagai jam terbang dan riwayat tampil setelah disetujui Admin. Data ini tidak masuk Evaluator, evaluasi, skor, ranking, atau penilaian.'}</p>
                </div>
                <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-slate-700">{mode === 'mc-external-form' ? 'Nama acara/Open Mic' : 'Judul acara'}<input required value={form.title} onChange={(event) => updateForm('title', event.target.value)} className="input-field mt-1 !py-2.5 text-sm" /></label>
              <label className="block text-xs font-semibold text-slate-700">{mode === 'mc-external-form' ? 'Komunitas/Penyelenggara' : 'Komunitas'}<CommunityCombobox id="history-community" value={form.organizer_name} onChange={(event) => updateForm('organizer_name', event.target.value)} required placeholder="Pilih atau ketik komunitas" /></label>
              <div className="grid gap-2.5 sm:grid-cols-2"><label className="block text-xs font-semibold text-slate-700">Tanggal<input required type="date" value={form.event_date} onChange={(event) => updateForm('event_date', event.target.value)} className="input-field mt-1 !py-2.5 text-sm" /></label><label className="block text-xs font-semibold text-slate-700">Waktu <span className="font-normal text-slate-400">(opsional)</span><input type="time" value={form.event_time} onChange={(event) => updateForm('event_time', event.target.value)} className="input-field mt-1 !py-2.5 text-sm" /></label></div>
              <label className="block text-xs font-semibold text-slate-700">{mode === 'mc-external-form' ? 'Tempat/Lokasi' : 'Venue'}<input required value={form.venue} onChange={(event) => updateForm('venue', event.target.value)} className="input-field mt-1 !py-2.5 text-sm" /></label>
              {mode === 'performance-form' && <label className="block text-xs font-semibold text-slate-700">Kota<input required value={form.city} onChange={(event) => updateForm('city', event.target.value)} className="input-field mt-1 !py-2.5 text-sm" /></label>}
              <ImageUpload label={mode === 'mc-external-form' ? 'Foto bukti dokumentasi' : 'Foto bukti penampilan'} folder="open-mic-history" value={form.proof_url} onChange={(url) => updateForm('proof_url', url)} required compact processingProfile="history-proof" skipCrop />
              {mode === 'mc-external-form' && <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs leading-5 text-violet-900"><input type="checkbox" checked={mcExternalAlsoPerformed} onChange={(event) => setMcExternalAlsoPerformed(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-violet-700" /><span><span className="block font-extrabold">Saya juga tampil sebagai komika di acara ini</span><span className="block text-violet-700">Pengajuan tampil dan MC akan masuk review masing-masing; data tampil tetap dihitung terpisah.</span></span></label>}
              <label className="block text-xs font-semibold text-slate-700">Catatan <span className="font-normal text-slate-400">(opsional)</span><textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} rows={2} className="input-field mt-1 text-sm" /></label>
              <button disabled={saving} type="submit" className="w-full rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-60">{saving ? 'Mengirim...' : 'Kirim untuk verifikasi'}</button>
              </div></div>
            </form>}
          {mcSubmissions.length > 0 && <section className="rounded-2xl border border-violet-100 bg-violet-50/50 p-3 sm:p-4"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-extrabold text-slate-900">Riwayat MC</h2><span className="text-[10px] font-semibold text-violet-700">{mcSubmissions.filter((item) => item.status === 'approved').length} disetujui</span></div><p className="mt-1 text-[11px] text-slate-500">Pengalaman menjadi MC dicatat terpisah dari jumlah tampil sebagai komika.</p><div className="mt-3 space-y-2">{mcSubmissions.map((item) => <SubmissionCard key={item.id} item={item} deleting={deletingId === item.id} onDelete={deleteRejectedSubmission} showType />)}</div></section>}
          {performerStatusSubmissions.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-extrabold text-slate-900">Riwayat Open Mic Eksternal</h2><span className="text-[10px] font-semibold text-slate-400">Jam terbang · bukan evaluasi</span></div><div className="mt-3 space-y-2">{performerStatusSubmissions.map((item) => <SubmissionCard key={item.id} item={item} deleting={deletingId === item.id} onDelete={deleteRejectedSubmission} />)}</div></section>}
        </div>
      </div>
      <Modal
        open={mode === 'choices' || mode === 'mc-kind'}
        onClose={() => { setModeHistory([]); setMode('overview'); setError(''); }}
        title={mode === 'mc-kind' ? 'Tambahkan Riwayat MC' : 'Tambahkan Riwayat'}
        size="sm"
      >
        <div className="space-y-2">
          {mode === 'choices' ? (
            <>
              <p className="mb-3 text-xs leading-5 text-slate-500">Pilih jenis pengalaman yang ingin kamu tambahkan.</p>
              <button
                type="button"
                onClick={() => { navigateMode('mc-kind'); setError(''); }}
                className="flex w-full items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-3.5 text-left transition hover:border-violet-300 hover:bg-violet-100"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white"><Mic className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="mb-1 block text-[10px] font-extrabold tracking-[0.12em] text-violet-700">BERTUGAS SEBAGAI MC</span><span className="block text-sm font-extrabold leading-5 text-violet-950">Riwayat MC</span><span className="mt-1 block text-xs leading-5 text-violet-800">Catat pengalaman menjadi MC Open Mic.</span></span>
              </button>
              <button
                type="button"
                onClick={() => { navigateMode('performance-form'); setError(''); }}
                className="flex w-full items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-3.5 text-left transition hover:border-blue-300 hover:bg-blue-100"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Mic className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="mb-1 block text-[10px] font-extrabold tracking-[0.12em] text-blue-700">TAMPIL SEBAGAI KOMIKA</span><span className="block text-sm font-extrabold leading-5 text-blue-950">Open Mic Eksternal</span><span className="mt-1 block text-xs leading-5 text-blue-800">Catat pengalaman tampil di komunitas lain.</span></span>
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={goBack} className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Kembali ke pilihan riwayat</button>
              <p className="mb-3 text-xs leading-5 text-slate-500">Pilih apakah Open Mic yang kamu pandu diselenggarakan internal atau eksternal.</p>
              <button
                type="button"
                onClick={() => { navigateMode('internal-mics'); setError(''); }}
                className="flex w-full items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-3.5 text-left transition hover:border-blue-300 hover:bg-blue-100"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Building2 className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="mb-1 block text-[10px] font-extrabold tracking-[0.12em] text-blue-700">ACARA STANDUPINDO CILEGON</span><span className="block text-sm font-extrabold leading-5 text-blue-950">Open Mic Internal</span><span className="mt-1 block text-xs leading-5 text-blue-800">Pilih acara yang sudah selesai dari daftar.</span></span>
              </button>
              <button
                type="button"
                onClick={() => { navigateMode('mc-external-form'); setMcExternalAlsoPerformed(false); setError(''); }}
                className="flex w-full items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-3.5 text-left transition hover:border-violet-300 hover:bg-violet-100"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white"><Globe2 className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="mb-1 block text-[10px] font-extrabold tracking-[0.12em] text-violet-700">ACARA KOMUNITAS LAIN</span><span className="block text-sm font-extrabold leading-5 text-violet-950">Open Mic Eksternal</span><span className="mt-1 block text-xs leading-5 text-violet-800">Isi detail acara dan bukti dokumentasi.</span></span>
              </button>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
