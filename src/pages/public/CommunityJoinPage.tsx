import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { Router } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { LOGO_URL } from '@/lib/types';
import { InstagramFollowLink } from '@/components/ui/InstagramFollowLink';

const INTERESTS = ['Komika', 'Penulis', 'Volunteer', 'Dokumentasi', 'Event', 'Supporter', 'Lainnya'];

export function CommunityJoinPage({ router }: { router: Router }) {
  const [form, setForm] = useState({ full_name: '', whatsapp: '', instagram: '', city: 'Cilegon', notes: '' });
  const [interests, setInterests] = useState<string[]>([]);
  const [otherInterest, setOtherInterest] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  function capitalizeName(value: string) {
    return value.replace(/\s+/g, ' ').replace(/(^|\s)(\S)/g, (_, space, letter) => `${space}${letter.toUpperCase()}`);
  }

  function toggleInterest(value: string) {
    setInterests((current) => {
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      if (value === 'Lainnya' && current.includes(value)) setOtherInterest('');
      return next;
    });
  }

  function setWhatsapp(value: string) {
    setForm((current) => ({ ...current, whatsapp: value.replace(/\D/g, '') }));
  }

  function setInstagram(value: string) {
    const username = value.replace(/^@+/, '').replace(/\s/g, '');
    setForm((current) => ({ ...current, instagram: username ? `@${username}` : '' }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.full_name.trim() || !form.whatsapp || !form.instagram || !form.city.trim() || interests.length === 0 || (interests.includes('Lainnya') && !otherInterest.trim())) {
      setError(interests.includes('Lainnya') && !otherInterest.trim() ? 'Isi minat lainnya terlebih dahulu.' : 'Lengkapi nama, WhatsApp, Instagram, domisili, dan pilih minimal satu minat.');
      return;
    }
    setReviewOpen(true);
  }

  async function confirmSubmit() {
    setError('');
    setSaving(true);
    const savedInterests = interests.map((interest) => interest === 'Lainnya' ? `Lainnya: ${otherInterest.trim()}` : interest);
    const { error: insertError } = await supabase.from('community_applications').insert({ ...form, interests: savedInterests, status: 'pending' });
    setSaving(false);
    if (insertError) { setError('Pendaftaran belum tersimpan. Silakan coba lagi.'); return; }
    setReviewOpen(false);
    setSubmitted(true);
  }

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Gabung Komunitas" subtitle="Jadi bagian dari ruang tumbuh Standupindo Cilegon." />
      <div className="container-app py-6 sm:py-8">
        <div className="mx-auto max-w-xl">
          {submitted ? (
            <div className="card p-6 text-center sm:p-8">
              <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
              <h2 className="mt-3 text-xl font-extrabold text-slate-900">Pendaftaran diterima</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Data kamu sudah masuk. Admin akan menghubungi melalui WhatsApp setelah meninjau pendaftaran.</p>
              <button onClick={() => router.navigate('/')} className="btn-primary mt-5">Kembali ke Beranda</button>
            </div>
          ) : (
            <form onSubmit={submit} className="card space-y-4 p-4 sm:p-6">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-blue-100"><img src={LOGO_URL} alt="Logo Standupindo Cilegon" className="h-8 w-8 object-contain" /></span>
                <div><h2 className="font-bold text-slate-900">Kenalan dengan kami</h2><p className="text-xs text-slate-500 sm:text-sm">Isi data singkat untuk bergabung.</p></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label-field" htmlFor="join-name">Nama lengkap</label><input id="join-name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: capitalizeName(e.target.value) })} className="input-field" placeholder="Contoh: Budi Santoso" /></div>
                <div><label className="label-field" htmlFor="join-whatsapp">WhatsApp</label><input id="join-whatsapp" required type="tel" inputMode="numeric" pattern="[0-9]+" value={form.whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="input-field" placeholder="Contoh: 082212345678" /></div>
                <div><label className="label-field" htmlFor="join-instagram">Instagram</label><input id="join-instagram" required value={form.instagram} onChange={(e) => setInstagram(e.target.value)} className="input-field" placeholder="Contoh: @budisantoso" /></div>
                <div><label className="label-field" htmlFor="join-city">Domisili</label><input id="join-city" required value={form.city} onChange={(e) => setForm({ ...form, city: capitalizeName(e.target.value) })} className="input-field" placeholder="Contoh: Cilegon" /></div>
              </div>
              <fieldset><legend className="label-field">Minat kamu <span className="font-normal text-slate-400">(pilih minimal satu)</span></legend><div className="flex flex-wrap gap-1.5">{INTERESTS.map((interest) => <button type="button" key={interest} onClick={() => toggleInterest(interest)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${interests.includes(interest) ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-blue-200'}`}>{interest}</button>)}</div>{interests.includes('Lainnya') && <input required value={otherInterest} onChange={(e) => setOtherInterest(e.target.value)} className="input-field mt-3" placeholder="Contoh: Fotografer, MC, atau Tim Kreatif" aria-label="Minat lainnya" />}</fieldset>
              <InstagramFollowLink />
              <div><label className="label-field" htmlFor="join-notes">Cerita singkat (opsional)</label><textarea id="join-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field min-h-[84px]" placeholder="Contoh: Ingin belajar stand up dan membantu event komunitas" /></div>
              {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={saving} className="btn-primary w-full !py-3">{saving ? 'Mengirim...' : 'Kirim Pendaftaran'}</button>
            </form>
          )}
        </div>
      </div>
      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="Periksa Data Pendaftaran" size="sm">
        <div className="space-y-3"><p className="text-sm font-medium text-slate-700">Pastikan data berikut sudah benar sebelum dikirim.</p><div className="review-summary"><div className="review-row"><span className="review-label">Nama</span><span className="review-value">{form.full_name}</span></div><div className="review-row"><span className="review-label">WhatsApp</span><span className="review-value">{form.whatsapp}</span></div><div className="review-row"><span className="review-label">Instagram</span><span className="review-value">{form.instagram}</span></div><div className="review-row"><span className="review-label">Domisili</span><span className="review-value">{form.city}</span></div><div className="review-row"><span className="review-label">Minat</span><span className="review-value">{interests.map((interest) => interest === 'Lainnya' ? `Lainnya: ${otherInterest}` : interest).join(', ')}</span></div></div><div className="flex flex-col-reverse gap-2 sm:flex-row"><button type="button" onClick={() => setReviewOpen(false)} className="btn-secondary flex-1">Periksa Lagi</button><button type="button" onClick={() => void confirmSubmit()} disabled={saving} className="btn-primary flex-1">{saving ? 'Mengirim...' : 'Sudah Benar, Kirim'}</button></div></div>
      </Modal>
    </div>
  );
}
