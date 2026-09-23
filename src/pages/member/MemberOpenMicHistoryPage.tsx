import { useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, ExternalLink, MapPin, Trash2, XCircle } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { MemberOpenMicHistorySubmission } from '@/lib/types';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';
import { CommunityCombobox } from '@/components/ui/CommunityCombobox';
import { ImageUpload } from '@/components/ui/ImageUpload';

type FormState = { title: string; organizer_name: string; event_date: string; venue: string; city: string; notes: string; proof_url: string };

const emptyForm: FormState = { title: '', organizer_name: '', event_date: '', venue: '', city: '', notes: '', proof_url: '' };

function SubmissionCard({ item, deleting, onDelete }: { item: MemberOpenMicHistorySubmission; deleting: boolean; onDelete: (item: MemberOpenMicHistorySubmission) => void }) {
  const status = item.status === 'approved'
    ? { label: 'Disetujui', icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-700' }
    : item.status === 'rejected'
      ? { label: 'Ditolak', icon: XCircle, className: 'bg-red-50 text-red-700' }
      : { label: 'Menunggu review', icon: Clock3, className: 'bg-amber-50 text-amber-700' };
  const Icon = status.icon;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-extrabold text-slate-900">{item.title}</h4>
          <p className="mt-0.5 text-xs text-slate-500">{item.organizer_name}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${status.className}`}><Icon className="h-3.5 w-3.5" />{status.label}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatDate(item.event_date)}</span>
        <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{item.venue}{item.city ? `, ${item.city}` : ''}</span>
      </div>
      {item.admin_note && item.status === 'rejected' && <p className="mt-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-700">{item.admin_note}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        {item.proof_url && <a href={item.proof_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:underline">Lihat bukti <ExternalLink className="h-3 w-3" /></a>}
        {item.status === 'rejected' && <button type="button" disabled={deleting} onClick={() => onDelete(item)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60" aria-label={deleting ? 'Menghapus pengajuan' : 'Hapus pengajuan'} title={deleting ? 'Menghapus pengajuan' : 'Hapus pengajuan'}><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
    </div>
  );
}

export function MemberOpenMicHistoryPage({ router }: { router: Router }) {
  const { user } = useAuth();
  const [komikaId, setKomikaId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<MemberOpenMicHistorySubmission[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadHistory() {
    if (!user?.id) return;
    const { data: profile } = await supabase.from('komika').select('id').or(`user_id.eq.${user.id},id.eq.${user.id}`).maybeSingle();
    const id = profile?.id ?? null;
    setKomikaId(id);
    if (!id) return;
    const { data: submissionData, error: submissionError } = await supabase.from('member_open_mic_history_submissions').select('*').eq('komika_id', id).order('event_date', { ascending: false });
    if (submissionError) setError('Riwayat belum dapat dimuat. Coba segarkan halaman beberapa saat lagi.');
    setSubmissions((submissionData as MemberOpenMicHistorySubmission[]) ?? []);
  }

  useEffect(() => { void loadHistory(); }, [user?.id]);

  const pendingSubmissions = submissions.filter((item) => item.status === 'pending');
  const rejectedSubmissions = submissions.filter((item) => item.status === 'rejected');

  function updateForm(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitHistory(event: React.FormEvent) {
    event.preventDefault();
    if (!user?.id || !komikaId) {
      setError('Profil komika belum tersedia. Lengkapi profil sebelum mengirim riwayat.');
      return;
    }
    const title = form.title.trim();
    const organizerName = form.organizer_name.trim();
    const venue = form.venue.trim();
    if (!title || !organizerName || !form.event_date || !venue || !form.city.trim() || !form.proof_url) {
      setError('Semua field wajib diisi kecuali catatan.');
      return;
    }
    const duplicate = submissions.some((item) => item.title.trim().toLowerCase() === title.toLowerCase() && item.event_date === form.event_date && item.venue.trim().toLowerCase() === venue.toLowerCase());
    if (duplicate) {
      setError('Riwayat dengan judul, tanggal, dan venue yang sama sudah pernah dikirim.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    const { error: saveError } = await supabase.from('member_open_mic_history_submissions').insert({
      user_id: user.id,
      komika_id: komikaId,
      title,
      organizer_name: organizerName,
      event_date: form.event_date,
      venue,
      city: form.city.trim() || null,
      notes: form.notes.trim() || null,
      proof_url: form.proof_url.trim() || null,
      status: 'pending',
    });
    setSaving(false);
    if (saveError) {
      setError(saveError.code === '23505' ? 'Riwayat dengan judul, tanggal, dan venue yang sama sudah pernah dikirim.' : 'Riwayat gagal dikirim. Coba lagi beberapa saat.');
      return;
    }
    setForm(emptyForm);
    setSuccess('Riwayat berhasil dikirim dan menunggu review admin.');
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
      <PageHeader router={router} title="Riwayat Open Mic" subtitle="Catat penampilanmu, baik di Standupindo maupun di luar komunitas." />
      <div className="container-app py-6 sm:py-8">
        {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        {success && <div role="status" className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>}
        <div className="mx-auto max-w-2xl space-y-3">
            <form onSubmit={submitHistory} className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_12px_28px_rgba(37,99,235,0.08)]">
              <div className="bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 px-4 py-4 text-white sm:px-5">
                <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg ring-1 ring-white/25">🎤</span><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-100">Riwayat Panggung</p><h2 className="mt-0.5 text-lg font-black">Tambah Riwayat Open Mic</h2><p className="mt-1 text-xs leading-5 text-blue-50">Catat penampilan di komunitas atau penyelenggara lain.</p></div></div>
              </div>
              <div className="p-4 sm:p-5">
                <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-800">
                  <span className="mt-0.5 shrink-0">ⓘ</span>
                  <p><span className="font-extrabold">Catatan penting:</span> riwayat Open Mic di luar komunitas ini hanya dicatat sebagai jam terbang dan riwayat tampil setelah disetujui Admin. Data ini tidak masuk Evaluator, evaluasi, skor, ranking, atau penilaian.</p>
                </div>
                <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-slate-700">Judul acara<input required value={form.title} onChange={(event) => updateForm('title', event.target.value)} className="input-field mt-1 !py-2.5 text-sm" /></label>
              <label className="block text-xs font-semibold text-slate-700">Komunitas<CommunityCombobox id="history-community" value={form.organizer_name} onChange={(event) => updateForm('organizer_name', event.target.value)} required placeholder="Pilih atau ketik komunitas" /></label>
              <div className="grid gap-2.5 sm:grid-cols-2"><label className="block text-xs font-semibold text-slate-700">Tanggal<input required type="date" value={form.event_date} onChange={(event) => updateForm('event_date', event.target.value)} className="input-field mt-1 !py-2.5 text-sm" /></label><label className="block text-xs font-semibold text-slate-700">Venue<input required value={form.venue} onChange={(event) => updateForm('venue', event.target.value)} className="input-field mt-1 !py-2.5 text-sm" /></label></div>
              <label className="block text-xs font-semibold text-slate-700">Kota<input required value={form.city} onChange={(event) => updateForm('city', event.target.value)} className="input-field mt-1 !py-2.5 text-sm" /></label>
              <ImageUpload label="Foto bukti penampilan" folder="open-mic-history" value={form.proof_url} onChange={(url) => updateForm('proof_url', url)} required compact skipCrop />
              <label className="block text-xs font-semibold text-slate-700">Catatan <span className="font-normal text-slate-400">(opsional)</span><textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} rows={2} className="input-field mt-1 text-sm" /></label>
              <button disabled={saving} type="submit" className="w-full rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-60">{saving ? 'Mengirim...' : 'Kirim untuk review'}</button>
              </div></div>
            </form>
            {(pendingSubmissions.length > 0 || rejectedSubmissions.length > 0) && <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-extrabold text-slate-900">Status pengajuan</h2><span className="text-[10px] font-semibold text-slate-400">Jam terbang · bukan evaluasi</span></div><div className="mt-3 space-y-2">{[...pendingSubmissions, ...rejectedSubmissions].map((item) => <SubmissionCard key={item.id} item={item} deleting={deletingId === item.id} onDelete={deleteRejectedSubmission} />)}</div></section>}
        </div>
      </div>
    </div>
  );
}
