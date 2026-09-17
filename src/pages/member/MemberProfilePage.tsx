import { useEffect, useMemo, useState } from 'react';
import { Instagram, Music2, Pencil, Save, UserRound, X, Youtube } from 'lucide-react';
import type { Router } from '@/lib/router';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Komika } from '@/lib/types';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { SocialIconButton } from '@/components/ui/SocialIconButton';

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
  const [profileError, setProfileError] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [form, setForm] = useState({ stage_name: '', full_name: '', whatsapp: '', bio: '', instagram_url: '', tiktok_url: '', youtube_url: '', photo: '' });

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    (async () => {
      setProfileError('');
      try {
        const { data, error } = await supabase
          .from('komika')
          .select('*')
          .or(`user_id.eq.${user.id},id.eq.${user.id}`)
          .limit(1)
          .maybeSingle();

        if (error) throw error;
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
      } catch (error) {
        console.error('Failed to load member profile', error);
        setProfileError('Data profil gagal dimuat. Silakan coba buka halaman ini lagi.');
      } finally {
        setLoading(false);
      }
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
      setEditingProfile(false);
      window.alert('Profil berhasil disimpan.');
    } else {
      window.alert('Gagal menyimpan profil: ' + error.message);
    }
  }

  function cancelEditing() {
    if (!profile) return;
    setForm({
      stage_name: profile.stage_name ?? '',
      full_name: profile.full_name ?? '',
      whatsapp: profile.whatsapp ?? '',
      bio: profile.bio ?? '',
      instagram_url: profile.instagram_url ?? '',
      tiktok_url: profile.tiktok_url ?? '',
      youtube_url: profile.youtube_url ?? '',
      photo: profile.photo ?? '',
    });
    setEditingProfile(false);
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
            {profileError || 'Profil member belum terhubung ke akun kamu. Silakan hubungi admin untuk mengaitkan profil komika.'}
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
          <div className="rounded-[28px] border border-blue-700 bg-blue-700 p-3 text-white shadow-[0_14px_32px_rgba(11,60,93,0.12)] sm:p-4">
            <div className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-4">
              <div className="overflow-hidden rounded-2xl border border-white/35 bg-white/15 ring-1 ring-white/30">
                {editingProfile ? (
                  <div className="p-1">
                    <ImageUpload label="Foto Profil" folder="komika" value={form.photo} onChange={(url) => setForm({ ...form, photo: url })} aspect="portrait" avatar onPreview={() => setPreviewPhoto(true)} />
                  </div>
                ) : (
                  <button type="button" onClick={() => form.photo && setPreviewPhoto(true)} className="block h-full w-full" aria-label={form.photo ? 'Lihat foto profil' : undefined}>
                    {form.photo ? <img src={form.photo} alt="Foto profil" className="aspect-[4/4.5] w-full object-cover bg-slate-100" /> : <div className="flex aspect-[4/4.5] w-full items-center justify-center bg-white text-blue-600"><UserRound className="h-9 w-9" /></div>}
                  </button>
                )}
              </div>

              <div className="space-y-3 border-l border-white/25 pl-3 sm:space-y-4 sm:pl-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-100">Member Profile</p>
                    <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-white sm:text-2xl">{profileSummary}</h2>
                  </div>
                  {editingProfile ? (
                    <button type="button" onClick={cancelEditing} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100" title="Batal mengedit">
                      <X className="h-4 w-4" /> Batal
                    </button>
                  ) : (
                    <button type="button" onClick={() => setEditingProfile(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-blue-700 transition hover:bg-blue-50">
                      <Pencil className="h-3.5 w-3.5" /> Edit Profile
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 [&_a]:border-white/30 [&_a]:bg-white/10 [&_a]:text-white">
                  <SocialIconButton instagram={form.instagram_url} tiktok={form.tiktok_url} youtube={form.youtube_url} />
                </div>

              </div>
            </div>
          </div>

          {editingProfile ? (
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
          ) : (
            <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Informasi akun</p><h3 className="mt-1 text-lg font-extrabold text-slate-950">Detail Profil</h3></div>
                <UserRound className="h-5 w-5 text-slate-300" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3"><p className="mb-1 text-xs font-bold text-slate-500">Nama lengkap</p><p className="text-sm font-bold text-slate-900">{form.full_name || '-'}</p></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3"><p className="mb-1 text-xs font-bold text-slate-500">Nama panggung</p><p className="text-sm font-bold text-slate-900">{form.stage_name || '-'}</p></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3"><p className="mb-1 text-xs font-bold text-slate-500">Nomor WhatsApp</p><p className="text-sm font-bold text-slate-900">{form.whatsapp || '-'}</p></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3"><p className="mb-1 text-xs font-bold text-slate-500">Bio</p><p className="whitespace-pre-line text-sm font-medium leading-6 text-slate-700">{form.bio || '-'}</p></div>
              </div>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="label-field">Media sosial</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Instagram className="h-4 w-4 text-pink-500" /> {handleValue(form.instagram_url, 'instagram') || '-'}</p>
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Music2 className="h-4 w-4 text-slate-700" /> {handleValue(form.tiktok_url, 'tiktok') || '-'}</p>
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Youtube className="h-4 w-4 text-red-500" /> {handleValue(form.youtube_url, 'youtube') || '-'}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {form.photo && <ImageLightbox src={form.photo} alt={profileSummary} open={previewPhoto} onClose={() => setPreviewPhoto(false)} closeAriaLabel="Tutup foto profil" />}
    </div>
  );
}
