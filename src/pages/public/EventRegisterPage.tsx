import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { EventItem as EventType } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { formatDate } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';
import { LOGO_URL } from '@/lib/types';
import { InstagramFollowLink } from '@/components/ui/InstagramFollowLink';

export function EventRegisterPage({ router, slug }: { router: Router; slug: string }) {
  const [event, setEvent] = useState<EventType | null>(null);
  const [form, setForm] = useState({ full_name: '', stage_name: '', community: '', whatsapp: '', instagram: '', notes: '' });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  function capitalizeName(value: string) {
    return value.replace(/\s+/g, ' ').replace(/(^|\s)(\S)/g, (_, space, letter) => `${space}${letter.toUpperCase()}`);
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('events').select('*').eq('slug', slug).eq('published', true).maybeSingle();
      setEvent((data as EventType) ?? null);
    })();
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!event) return;
    if (!form.full_name.trim() || !form.stage_name.trim() || !form.whatsapp || !form.instagram) {
      setError('Lengkapi nama lengkap, nama panggung/tim, WhatsApp, dan Instagram.');
      return;
    }
    setReviewOpen(true);
  }

  async function confirmSubmit() {
    if (!event) return;
    setError('');
    setSaving(true);
    const { error: insertError } = await supabase.from('event_participants').insert({ ...form, event_id: event.id, status: 'pending' });
    setSaving(false);
    if (insertError) { setError('Pendaftaran belum tersimpan. Silakan coba lagi.'); return; }
    setReviewOpen(false);
    setSubmitted(true);
  }

  function setWhatsapp(value: string) {
    setForm((current) => ({ ...current, whatsapp: value.replace(/\D/g, '') }));
  }

  function setInstagram(value: string) {
    const username = value.replace(/^@+/, '').replace(/\s/g, '');
    setForm((current) => ({ ...current, instagram: username ? `@${username}` : '' }));
  }

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Daftar sebagai Peserta" subtitle={event?.title ?? 'Pendaftaran event'} />
      <div className="container-app py-8 sm:py-10">
        <div className="mx-auto max-w-2xl">
          {!event ? <div className="card p-8 text-center text-sm text-slate-500">Event tidak ditemukan.</div> : event.registration_status !== 'open' ? <div className="card p-8 text-center text-sm text-slate-500">Pendaftaran peserta untuk event ini belum dibuka.</div> : submitted ? (
            <div className="card p-8 text-center sm:p-12"><CheckCircle2 className="mx-auto h-12 w-12 text-green-600" /><h2 className="mt-4 text-2xl font-extrabold text-slate-900">Pendaftaran diterima</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Admin akan meninjau pendaftaran kamu dan menghubungi melalui WhatsApp.</p><button onClick={() => router.navigate(`/event/${event.slug}`)} className="btn-primary mt-6">Kembali ke Event</button></div>
          ) : (
            <form onSubmit={submit} className="card space-y-5 p-5 sm:p-7">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-5">{event.poster ? <img src={event.poster} alt={`Poster ${event.title}`} className="h-14 w-20 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" /> : <span className="flex h-14 w-20 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-blue-100"><img src={LOGO_URL} alt="Logo Standupindo Cilegon" className="h-9 w-9 object-contain" /></span>}<div className="min-w-0"><h2 className="truncate font-bold text-slate-900">{event.title}</h2><p className="text-sm text-slate-500">{formatDate(event.date)} · {event.venue}</p></div></div>
              <div className="grid gap-4 sm:grid-cols-2"><div><label className="label-field" htmlFor="participant-name">Nama lengkap</label><input id="participant-name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: capitalizeName(e.target.value) })} className="input-field" placeholder="Contoh: Budi Santoso" /></div><div><label className="label-field" htmlFor="participant-stage">Nama panggung / tim</label><input id="participant-stage" required value={form.stage_name} onChange={(e) => setForm({ ...form, stage_name: capitalizeName(e.target.value) })} className="input-field" placeholder="Contoh: Budi Ngakak" /></div><div><label className="label-field" htmlFor="participant-community">Komunitas <span className="font-normal text-slate-400">(opsional)</span></label><input id="participant-community" value={form.community} onChange={(e) => setForm({ ...form, community: e.target.value })} className="input-field" placeholder="Contoh: Standupindo Cilegon / Umum" /></div><div><label className="label-field" htmlFor="participant-whatsapp">WhatsApp</label><input id="participant-whatsapp" required type="tel" inputMode="numeric" pattern="[0-9]+" value={form.whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="input-field" placeholder="Contoh: 082212345678" /></div><div><label className="label-field" htmlFor="participant-instagram">Instagram</label><input id="participant-instagram" required value={form.instagram} onChange={(e) => setInstagram(e.target.value)} className="input-field" placeholder="Contoh: @budisantoso" /></div></div>
              <InstagramFollowLink />
              <div><label className="label-field" htmlFor="participant-notes">Catatan (opsional)</label><textarea id="participant-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field min-h-[100px]" /></div>
              {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}<button type="submit" disabled={saving} className="btn-primary w-full">{saving ? 'Mengirim...' : 'Kirim Pendaftaran'}</button>
            </form>
          )}
        </div>
      </div>
      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="Periksa Data Pendaftaran" size="md">
        <div className="space-y-4"><p className="text-sm font-medium text-slate-700">Pastikan data peserta dan Event sudah benar sebelum dikirim.</p><div className="review-summary"><div className="review-row"><span className="review-label">Nama</span><span className="review-value">{form.full_name}</span></div><div className="review-row"><span className="review-label">Panggung / Tim</span><span className="review-value">{form.stage_name}</span></div><div className="review-row"><span className="review-label">Komunitas</span><span className="review-value">{form.community || 'Umum'}</span></div><div className="review-row"><span className="review-label">WhatsApp</span><span className="review-value">{form.whatsapp}</span></div><div className="review-row"><span className="review-label">Instagram</span><span className="review-value">{form.instagram || '-'}</span></div></div><div className="flex gap-3"><button type="button" onClick={() => setReviewOpen(false)} className="btn-secondary flex-1">Periksa Lagi</button><button type="button" onClick={() => void confirmSubmit()} disabled={saving} className="btn-primary flex-1">{saving ? 'Mengirim...' : 'Sudah Benar, Kirim'}</button></div></div>
      </Modal>
    </div>
  );
}
