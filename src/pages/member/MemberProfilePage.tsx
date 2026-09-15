import { useEffect, useMemo, useState } from 'react';
import { Instagram, Music2, Save, Youtube } from 'lucide-react';
import type { Router } from '@/lib/router';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Komika } from '@/lib/types';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { ImageLightbox } from '@/components/ui/ImageLightbox';

function handleValue(value: string, prefix: string): string {
  return value.trim().replace(new RegExp(`^https?://(www\\.)?${prefix}\\.com/`, 'i'), '').replace(/^@/, '').replace(/\/.*$/, '').replace(/\s/g, '');
}

function profileUrl(value: string, prefix: string): string | null {
  const handle = handleValue(value, prefix);
  return handle ? `https://${prefix}.com/${prefix === 'tiktok' ? '@' : ''}${handle}` : null;
}

export function MemberProfilePage({ router }: { router: Router }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Komika | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(false);
  const [form, setForm] = useState({ stage_name: '', full_name: '', whatsapp: '', bio: '', instagram_url: '', tiktok_url: '', youtube_url: '', photo: '' });

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from('komika')
        .select('*')
        .or(`user_id.eq.${user.id},id.eq.${user.id}`)
        .maybeSingle();

      const row = data as Komika | null;
      setProfile(row);
      if (row) {
        setForm({
          stage_name: row.stage_name ?? '',
          full_name: row.full_name ?? '',
          whatsapp: row.whatsapp ?? '',
          bio: row.bio ?? '',
          instagram_url: row.instagram_url ?? '',
          tiktok_url: row.tiktok_url ?? '',
          youtube_url: row.youtube_url ?? '',
          photo: row.photo ?? '',
        });
      }
      setLoading(false);
    })();
  }, [user?.id]);

  const profileSummary = useMemo(() => {
    const safeName = form.stage_name.trim() || profile?.stage_name || 'Komika';
    return safeName;
  }, [form.stage_name, profile?.stage_name]);

  async function handleSave() {
    if (!user?.id) return;
    setSaving(true);

    const { data: komikaRow } = await supabase
      .from('komika')
      .select('id')
      .or(`user_id.eq.${user.id},id.eq.${user.id}`)
      .maybeSingle();

    const komikaId = komikaRow?.id ?? profile?.id;
    if (!komikaId) {
      setSaving(false);
      window.alert('Profil komika belum terhubung ke akun kamu. Hubungi admin untuk mengaitkan profil member.');
      return;
    }

    const payload = {
      stage_name: form.stage_name.trim(),
      whatsapp: form.whatsapp.replace(/\D/g, '') || null,
      bio: form.bio.trim() || null,
      instagram_url: profileUrl(form.instagram_url, 'instagram'),
      tiktok_url: profileUrl(form.tiktok_url, 'tiktok'),
      youtube_url: profileUrl(form.youtube_url, 'youtube'),
      photo: form.photo.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('komika')
      .update(payload)
      .eq('id', komikaId);

    setSaving(false);
    if (!error) {
      window.alert('Profil berhasil disimpan.');
    } else {
      window.alert('Gagal menyimpan profil: ' + error.message);
    }
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title="Profil Member" subtitle="Memuat data profil kamu." />
        <div className="container-app py-8">
          <div className="h-64 animate-pulse rounded-[28px] bg-slate-100" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title="Profil Member" subtitle="Data profil belum tersedia." />
        <div className="container-app py-8">
          <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            Profil member belum terhubung ke akun kamu. Silakan hubungi admin untuk mengaitkan profil komika.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Profil Member" subtitle="Kelola profil publik komika kamu." />

      <div className="container-app py-6 sm:py-8">
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-5">
            <div className="flex items-center gap-4">
              <ImageUpload label="Foto Profil" folder="komika" value={form.photo} onChange={(url) => setForm({ ...form, photo: url })} aspect="portrait" avatar onPreview={() => setPreviewPhoto(true)} />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Member Profile</p>
                <h2 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-900">{profileSummary}</h2>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-5">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                <label className="label-field" htmlFor="full_name">Nama lengkap</label>
                <input id="full_name" value={form.full_name} disabled className="input-field bg-slate-50" />
                </div>
                <div>
                <label className="label-field" htmlFor="stage_name">Nama panggung</label>
                <input id="stage_name" value={form.stage_name} onChange={(e) => setForm({ ...form, stage_name: e.target.value })} className="input-field" placeholder="Contoh: Joko Ngakak" />
                </div>
              </div>

              <div>
                <label className="label-field" htmlFor="whatsapp">Nomor WhatsApp</label>
                <input id="whatsapp" type="tel" inputMode="numeric" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value.replace(/\D/g, '') })} className="input-field" placeholder="Contoh: 082212345678" />
              </div>

              <div>
                <label className="label-field" htmlFor="bio">Bio</label>
                <textarea id="bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={5} className="input-field !min-h-[120px]" placeholder="Ceritakan singkat tentang kamu..." />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label-field" htmlFor="instagram_url"><span className="inline-flex items-center gap-2"><Instagram className="h-4 w-4 text-pink-500" /> Instagram</span></label>
                  <input id="instagram_url" value={handleValue(form.instagram_url, 'instagram')} onChange={(e) => setForm({ ...form, instagram_url: e.target.value.replace(/^@/, '') })} className="input-field" placeholder="username" />
                </div>
                <div>
                  <label className="label-field" htmlFor="tiktok_url"><span className="inline-flex items-center gap-2"><Music2 className="h-4 w-4 text-slate-700" /> TikTok</span></label>
                  <input id="tiktok_url" value={handleValue(form.tiktok_url, 'tiktok')} onChange={(e) => setForm({ ...form, tiktok_url: e.target.value.replace(/^@/, '') })} className="input-field" placeholder="username" />
                </div>
              </div>

              <div>
                <label className="label-field" htmlFor="youtube_url"><span className="inline-flex items-center gap-2"><Youtube className="h-4 w-4 text-red-500" /> YouTube</span></label>
                <input id="youtube_url" value={handleValue(form.youtube_url, 'youtube')} onChange={(e) => setForm({ ...form, youtube_url: e.target.value.replace(/^@/, '') })} className="input-field" placeholder="username atau channel" />
              </div>

              <button type="button" onClick={handleSave} disabled={saving} className="btn-primary w-full !py-3.5">
                {saving ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Menyimpan...</> : <><Save className="h-4 w-4" /> Simpan Profil</>}
              </button>
            </div>
          </div>
        </div>
      </div>
      {form.photo && <ImageLightbox src={form.photo} alt={profileSummary} open={previewPhoto} onClose={() => setPreviewPhoto(false)} closeAriaLabel="Tutup foto profil" />}
    </div>
  );
}
