import { getOpenMicStatus } from '@/lib/format';
import { useEffect, useState } from 'react';
import { CheckCircle2, Mic } from 'lucide-react';
import type { Router } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { LOGO_URL } from '@/lib/types';
import { InstagramFollowLink } from '@/components/ui/InstagramFollowLink';

interface Props {
  router: Router;
  slug: string;
}

interface FormState {
  full_name: string;
  stage_name: string;
  community: string;
  instagram: string;
  whatsapp: string;
  notes: string;
}

const EMPTY: FormState = { full_name: '', stage_name: '', community: '', instagram: '', whatsapp: '', notes: '' };

export function OpenMicRegisterPage({ router, slug }: Props) {
  const [loading, setLoading] = useState(true);
  const [micId, setMicId] = useState<string | null>(null);
  const [micTitle, setMicTitle] = useState('');
  const [micPoster, setMicPoster] = useState<string | null>(null);
  const [filled, setFilled] = useState(0);
  const [capacity, setCapacity] = useState(0);
  const [closed, setClosed] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ registration_id: string } | null>(null);
  const [serverError, setServerError] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);

  function formatFullName(value: string): string {
    return value.replace(/\s+/g, ' ').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
  }

  function formatInstagramInput(value: string) {
    const cleaned = value
      .trim()
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
      .replace(/^@/, '')
      .replace(/\s+/g, '')
      .replace(/\/.*$/, '');

    return cleaned ? `@${cleaned}` : '';
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('open_mics').select('id, title, poster, capacity, registration_status, status, date').eq('slug', slug).eq('published', true).maybeSingle();
      const m = data as { id: string; title: string; poster: string | null; capacity: number; registration_status: string; status: 'upcoming' | 'completed' | 'cancelled'; date: string } | null;
      if (m) {
        setMicId(m.id);
        setMicTitle(m.title);
        setMicPoster(m.poster);
        setCapacity(m.capacity);
        setClosed(m.registration_status === 'closed' || getOpenMicStatus(m.status, m.date) !== 'upcoming');
        const { count } = await supabase.from('open_mic_registrations').select('id', { count: 'exact', head: true }).eq('open_mic_id', m.id).eq('status', 'confirmed').neq('attendance_status', 'absent');
        setFilled(count ?? 0);
      }
      setLoading(false);
    })();
  }, [slug]);

  function validate(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.full_name.trim()) e.full_name = 'Nama lengkap wajib diisi.';
    if (!form.stage_name.trim()) e.stage_name = 'Nama panggung wajib diisi.';
    if (form.whatsapp.trim() && !/^\d{8,15}$/.test(form.whatsapp.trim())) e.whatsapp = 'Nomor WhatsApp harus berupa angka 8-15 digit.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setServerError('');
    if (!validate() || !micId) return;
    if (filled >= capacity) { setServerError('Slot sudah penuh. Maaf, pendaftaran tidak bisa dilanjutkan.'); return; }
    setReviewOpen(true);
  }

  async function confirmSubmit() {
    setSubmitting(true);

    // Generate registration id: OM<seq>-<4digit>
    const { data: seqData } = await supabase.rpc('next_open_mic_reg_seq');
    const seq = (seqData as number) ?? 1;
    const seqPadded = String(seq).padStart(4, '0');
    const omNum = micTitle.match(/#?(\d+)/)?.[1] ?? '00';
    const registrationId = `OM${omNum}-${seqPadded}`;

    const payload = {
      registration_id: registrationId,
      open_mic_id: micId,
      full_name: form.full_name.trim(),
      stage_name: form.stage_name.trim(),
      community: form.community.trim() || null,
      instagram: form.instagram.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      notes: form.notes.trim() || null,
      status: 'pending',
    };

    const { error } = await supabase.from('open_mic_registrations').insert(payload);
    setSubmitting(false);
    setReviewOpen(false);
    if (error) {
      setServerError('Terjadi kesalahan saat mengirim pendaftaran. Silakan coba lagi.');
      return;
    }
    setResult({ registration_id: registrationId });
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} />
        <div className="container-app py-8"><LoadingSkeleton count={1} /></div>
      </div>
    );
  }

  if (!micId) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title="Pendaftaran tidak tersedia" />
        <div className="container-app py-8"><EmptyState title="Open Mic tidak ditemukan." /></div>
      </div>
    );
  }

  if (closed) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title={micTitle} />
        <div className="container-app py-8">
          <EmptyState title="PENDAFTARAN DITUTUP" description="Pendaftaran untuk Open Mic ini sudah ditutup." />
        </div>
      </div>
    );
  }

  if (filled >= capacity) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title={micTitle} />
        <div className="container-app py-8">
          <EmptyState title="SLOT PENUH" description="Semua slot untuk Open Mic ini sudah terisi." />
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title="Pendaftaran Open Mic" />
        <div className="container-app py-10">
          <div className="mx-auto max-w-lg animate-scale-in">
            <div className="card p-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              <h2 className="mt-5 text-2xl font-extrabold text-slate-900">Pendaftaran Berhasil</h2>
              <p className="mt-2 text-sm text-slate-500">Data kamu sudah diterima dan sedang menunggu konfirmasi admin.</p>

              <div className="mt-6 rounded-2xl bg-slate-50 p-5 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-500">Registration ID</span>
                  <span className="font-mono text-lg font-extrabold text-blue-700">{result.registration_id}</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                  <span className="text-sm font-semibold text-slate-500">Status</span>
                  <StatusBadge status="pending" />
                </div>
              </div>

              <p className="mt-5 text-xs text-slate-400">Simpan Registration ID kamu untuk mengecek status pendaftaran.</p>
              <button onClick={() => router.navigate('/open-mic')} className="btn-primary mt-6 w-full">
                Kembali ke Open Mic
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title={`Daftar ${micTitle}`} subtitle="Isi data kamu untuk mendaftar Open Mic." />
      <div className="container-app py-8">
        <div className="mx-auto max-w-xl">
          <form onSubmit={handleSubmit} className="card p-6 space-y-5" noValidate>
            <div className="flex items-center gap-3 border-b border-slate-100 pb-5">{micPoster ? <img src={micPoster} alt={`Poster ${micTitle}`} className="h-14 w-20 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" /> : <span className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-blue-100"><img src={LOGO_URL} alt="Logo Standupindo Cilegon" className="h-9 w-9 object-contain" /></span>}<div className="min-w-0"><h2 className="truncate font-bold text-slate-900">{micTitle}</h2><p className="text-sm text-slate-500">Isi data kamu untuk mendaftar.</p></div></div>
            <div>
              <label className="label-field" htmlFor="full_name">Nama Lengkap <span className="text-red-500">*</span></label>
              <input id="full_name" type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: formatFullName(e.target.value) })} className="input-field" placeholder="Contoh: Budi Santoso" />
              {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name}</p>}
            </div>

            <div>
              <label className="label-field" htmlFor="stage_name">Nama Panggung <span className="text-red-500">*</span></label>
              <input id="stage_name" type="text" value={form.stage_name} onChange={(e) => setForm({ ...form, stage_name: e.target.value })} className="input-field" placeholder="Contoh: Budi Ngakak" />
              {errors.stage_name && <p className="mt-1 text-xs text-red-600">{errors.stage_name}</p>}
            </div>

            <div>
              <label className="label-field" htmlFor="community">Komunitas</label>
              <input id="community" type="text" value={form.community} onChange={(e) => setForm({ ...form, community: e.target.value })} className="input-field" placeholder="Contoh: Standupindo Cilegon / Umum" />
            </div>

            <div>
              <label className="label-field" htmlFor="instagram">Instagram</label>
              <input
                id="instagram"
                type="text"
                value={form.instagram}
                onChange={(e) => setForm({ ...form, instagram: formatInstagramInput(e.target.value) })}
                className="input-field"
                placeholder="Contoh: @budisantoso"
              />
            </div>

            <div>
              <label className="label-field" htmlFor="whatsapp">Nomor WhatsApp <span className="font-normal text-slate-400">(opsional)</span></label>
              <input id="whatsapp" type="tel" inputMode="numeric" pattern="[0-9]*" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value.replace(/\D/g, '') })} className={`input-field ${errors.whatsapp ? '!border-red-400 !ring-1 !ring-red-400' : ''}`} placeholder="Contoh: 082212345678" />
              {errors.whatsapp ? (
                <p className="mt-1 text-xs text-red-600">{errors.whatsapp}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-400">Dianjurkan diisi agar admin lebih mudah mengonfirmasi pendaftaran.</p>
              )}
            </div>

            <div>
              <label className="label-field" htmlFor="notes">Catatan</label>
              <textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field min-h-[88px] resize-y" placeholder="Contoh: Materi 5 menit, coba materi baru, pertama kali open mic" />
            </div>

            {serverError && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
                {serverError}
              </div>
            )}

            <InstagramFollowLink />
            <button type="submit" disabled={submitting} className="btn-primary w-full !py-3.5 text-base">
              {submitting ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Memproses...</>
              ) : (
                <><Mic className="h-5 w-5" /> Kirim Pendaftaran</>
              )}
            </button>
          </form>
        </div>
      </div>
      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="Periksa Data Pendaftaran" size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Pastikan data berikut sudah benar sebelum dikirim.</p>
          <div className="review-summary">
            <div className="review-row"><span className="review-label">Nama Lengkap</span><span className="review-value">{form.full_name}</span></div>
            <div className="review-row"><span className="review-label">Nama Panggung</span><span className="review-value">{form.stage_name}</span></div>
            <div className="review-row"><span className="review-label">Komunitas</span><span className="review-value">{form.community || '—'}</span></div>
            <div className="review-row"><span className="review-label">Instagram</span><span className="review-value">{form.instagram || '—'}</span></div>
            <div className="review-row"><span className="review-label">WhatsApp</span><span className="review-value">{form.whatsapp || '—'}</span></div>
            {form.notes && <div className="review-row"><span className="review-label">Catatan</span><span className="review-value">{form.notes}</span></div>}
          </div>
          {!form.whatsapp && <p className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-700">Nomor WhatsApp belum diisi. Disarankan mengisi nomor agar admin lebih mudah mengonfirmasi pendaftaran.</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => setReviewOpen(false)} disabled={submitting} className="btn-secondary flex-1">Edit Data</button>
            <button type="button" onClick={() => { void confirmSubmit(); }} disabled={submitting} className="btn-primary flex-1">{submitting ? 'Mengirim...' : 'Kirim Pendaftaran'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
