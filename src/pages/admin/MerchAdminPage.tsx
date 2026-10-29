import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Eye, Pencil, Plus, Save, Store } from 'lucide-react';
import { MerchBanner } from '@/components/MerchBanner';
import { AdminModal as Modal } from '@/components/admin/AdminModal';
import { WorkspacePageHeader } from '@/components/admin/WorkspacePageHeader';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { StatusBanner, type StatusBannerVariant } from '@/components/ui/StatusBanner';
import { MERCH_DESCRIPTION_MAX_LENGTH, MERCH_STORAGE_BUCKET, getMerchShopUrl } from '@/lib/merch';
import { supabase } from '@/lib/supabase';
import type { SiteSettings } from '@/lib/types';

type MerchForm = {
  imageUrl: string;
  title: string;
  description: string;
  shopUrl: string;
  enabled: boolean;
};

function getMerchStoragePath(imageUrl: string): string | null {
  try {
    const bucket = supabase.storage.from(MERCH_STORAGE_BUCKET);
    const baseUrl = new URL(bucket.getPublicUrl('banner/').data.publicUrl);
    const candidateUrl = new URL(imageUrl);
    if (candidateUrl.origin !== baseUrl.origin || candidateUrl.search || candidateUrl.hash || !candidateUrl.pathname.startsWith(baseUrl.pathname)) return null;

    const fileName = decodeURIComponent(candidateUrl.pathname.slice(baseUrl.pathname.length));
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpe?g|png|webp)$/i.test(fileName)) return null;
    return `banner/${fileName}`;
  } catch {
    return null;
  }
}

async function removeMerchImageIfUnused(imageUrl: string): Promise<string | null> {
  const path = getMerchStoragePath(imageUrl);
  if (!path) return null;

  try {
    const { data, error: settingsError } = await supabase
      .from('site_settings')
      .select('merch_banner_image_url')
      .eq('id', 1)
      .maybeSingle();
    if (settingsError) throw settingsError;
    if (data?.merch_banner_image_url === imageUrl) return null;

    const { error } = await supabase.storage.from(MERCH_STORAGE_BUCKET).remove([path]);
    if (error) throw error;
    return null;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Kesalahan tidak diketahui.';
    console.error('File gambar Merch yang tidak terpakai gagal dibersihkan.', { path, error });
    return detail;
  }
}

function formFromSettings(settings: SiteSettings): MerchForm {
  return {
    imageUrl: settings.merch_banner_image_url ?? '',
    title: settings.merch_banner_title ?? '',
    description: settings.merch_banner_description ?? '',
    shopUrl: settings.merch_shop_url ?? '',
    enabled: settings.merch_banner_enabled ?? false,
  };
}

function hasMerchConfiguration(settings: SiteSettings): boolean {
  return Boolean(
    settings.merch_banner_image_url
    || settings.merch_banner_title?.trim()
    || settings.merch_banner_description?.trim()
    || settings.merch_shop_url?.trim()
    || settings.merch_banner_enabled,
  );
}

export function MerchAdminPage({ settings, onSaved }: { settings: SiteSettings; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState(() => formFromSettings(settings));
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notice, setNotice] = useState<{ message: string; variant: StatusBannerVariant } | null>(null);
  const stagedImageUrls = useRef(new Set<string>());

  useEffect(() => {
    setForm(formFromSettings(settings));
  }, [settings]);

  useEffect(() => () => {
    stagedImageUrls.current.forEach((imageUrl) => {
      void removeMerchImageIfUnused(imageUrl);
    });
  }, []);

  async function cleanupStagedImages(): Promise<string[]> {
    const failures: string[] = [];
    for (const imageUrl of stagedImageUrls.current) {
      const failure = await removeMerchImageIfUnused(imageUrl);
      if (failure) failures.push(failure);
      else stagedImageUrls.current.delete(imageUrl);
    }
    return failures;
  }

  function startEditing() {
    setForm(formFromSettings(settings));
    setIsFormOpen(true);
    setNotice(null);
  }

  async function cancelEditing() {
    if (saving || uploading) return;
    const cleanupFailures = await cleanupStagedImages();
    setForm(formFromSettings(settings));
    setIsFormOpen(false);
    setPreviewOpen(false);
    setNotice(cleanupFailures.length
      ? { message: 'Perubahan dibatalkan, tetapi foto sementara gagal dibersihkan.', variant: 'warning' }
      : null);
  }

  function handleImageChange(imageUrl: string) {
    const previousImageUrl = form.imageUrl;
    const savedImageUrl = settings.merch_banner_image_url ?? '';
    if (imageUrl && imageUrl !== savedImageUrl) stagedImageUrls.current.add(imageUrl);
    setForm((current) => ({ ...current, imageUrl }));

    if (previousImageUrl && previousImageUrl !== savedImageUrl && previousImageUrl !== imageUrl) {
      void removeMerchImageIfUnused(previousImageUrl).then((failure) => {
        if (failure) setNotice({ message: 'Gambar pengganti baru dipilih, tetapi foto sementara sebelumnya gagal dibersihkan.', variant: 'warning' });
        else stagedImageUrls.current.delete(previousImageUrl);
      });
    }
  }

  async function saveChanges(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || uploading) return;

    if (form.description.length > MERCH_DESCRIPTION_MAX_LENGTH) {
      setNotice({ message: `Deskripsi Singkat maksimal ${MERCH_DESCRIPTION_MAX_LENGTH} karakter. Perbaiki teks secara manual sebelum menyimpan.`, variant: 'warning' });
      return;
    }

    if (form.enabled && (!form.imageUrl.trim() || !form.title.trim() || !form.description.trim() || !getMerchShopUrl(form.shopUrl))) {
      setNotice({ message: 'Lengkapi Gambar Banner, Judul, Deskripsi Singkat, dan URL Toko HTTPS yang valid sebelum mengaktifkan banner.', variant: 'warning' });
      return;
    }

    setSaving(true);
    setNotice(null);
    const previousImageUrl = settings.merch_banner_image_url ?? '';
    const nextImageUrl = form.imageUrl.trim();
    const { data, error } = await supabase.from('site_settings').update({
      merch_banner_image_url: nextImageUrl || null,
      merch_banner_title: form.title.trim(),
      merch_banner_description: form.description.trim(),
      merch_shop_url: form.shopUrl.trim(),
      merch_banner_enabled: form.enabled,
    }).eq('id', 1).select('id').maybeSingle();
    setSaving(false);

    if (error || !data) {
      console.error('Konfigurasi Merch gagal disimpan.', error);
      const cleanupFailures = await cleanupStagedImages();
      setForm((current) => ({ ...current, imageUrl: previousImageUrl }));
      setNotice({
        message: cleanupFailures.length
          ? 'Perubahan Merch gagal disimpan. Foto lama tetap digunakan, tetapi foto sementara gagal dibersihkan.'
          : 'Perubahan Merch gagal disimpan. Konfigurasi dan foto lama tetap dipertahankan.',
        variant: 'error',
      });
      return;
    }

    stagedImageUrls.current.delete(nextImageUrl);
    const cleanupFailures = await cleanupStagedImages();
    const oldImageCleanupFailure = previousImageUrl && previousImageUrl !== nextImageUrl
      ? await removeMerchImageIfUnused(previousImageUrl)
      : null;
    try {
      await onSaved();
    } catch (refreshError) {
      console.error('Konfigurasi Merch tersimpan, tetapi pengaturan website gagal diperbarui.', refreshError);
      setIsFormOpen(false);
      setNotice({ message: 'Konfigurasi Merch tersimpan, tetapi tampilan website gagal diperbarui. Muat ulang halaman untuk memastikan hasilnya.', variant: 'warning' });
      return;
    }
    setIsFormOpen(false);
    setPreviewOpen(false);
    setNotice({
      message: oldImageCleanupFailure || cleanupFailures.length
        ? 'Konfigurasi Merch berhasil disimpan, tetapi sebagian file gambar lama atau sementara gagal dibersihkan.'
        : 'Konfigurasi Merch berhasil disimpan.',
      variant: oldImageCleanupFailure || cleanupFailures.length ? 'warning' : 'success',
    });
  }

  const shopUrlValid = Boolean(getMerchShopUrl(form.shopUrl));

  return (
    <div className="space-y-5">
      <WorkspacePageHeader
        eyebrow="Menu Lainnya"
        title="Merch Standupindo Cilegon"
        subtitle="Kelola satu banner promosi dan tautan toko marketplace Standupindo Cilegon."
      />
      {notice && !isFormOpen && <StatusBanner message={notice.message} variant={notice.variant} onDismiss={() => setNotice(null)} />}

      {hasMerchConfiguration(settings) && !isFormOpen && (
        <section className="max-w-3xl overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
          {settings.merch_banner_image_url && (
            <div className="flex aspect-video max-h-[340px] items-center justify-center overflow-hidden">
              <img src={settings.merch_banner_image_url} alt={`Banner ${settings.merch_banner_title || 'Merch Standupindo Cilegon'}`} className="h-full w-full object-contain" />
            </div>
          )}
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-blue-700">Banner Merch</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase ${settings.merch_banner_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {settings.merch_banner_enabled ? 'Dipublikasikan' : 'Disembunyikan'}
                  </span>
                </div>
                <h2 className="mt-2 text-lg font-black text-slate-950">{settings.merch_banner_title || 'Judul belum diisi'}</h2>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-600">{settings.merch_banner_description || 'Deskripsi Singkat belum diisi.'}</p>
                <a href={getMerchShopUrl(settings.merch_shop_url) ?? undefined} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block break-all text-sm font-semibold text-blue-700 underline decoration-blue-200 underline-offset-2">
                  {settings.merch_shop_url || 'URL Toko belum diisi'}
                </a>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={startEditing} aria-label="Edit konfigurasi Merch" title="Edit Merch" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2">
                <Pencil className="h-4 w-4" /> Edit
              </button>
            </div>
          </div>
        </section>
      )}

      {!hasMerchConfiguration(settings) && !isFormOpen && (
        <section className="max-w-3xl rounded-2xl border border-dashed border-blue-200 bg-white p-6 text-center shadow-sm">
          <CalendarDays className="mx-auto h-9 w-9 text-blue-500" />
          <h2 className="mt-3 text-base font-extrabold text-slate-900">Konfigurasi Merch belum dibuat</h2>
          <p className="mt-1 text-sm text-slate-500">Buat satu konfigurasi untuk mengatur gambar banner, informasi promosi, URL toko, dan status publikasi.</p>
          <button type="button" onClick={startEditing} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-800">
            <Plus className="h-4 w-4" /> Tambah Merch
          </button>
        </section>
      )}

      <Modal
        open={isFormOpen}
        onClose={() => void cancelEditing()}
        title={hasMerchConfiguration(settings) ? 'Edit Konfigurasi Merch' : 'Tambah Merch'}
        titleEyebrow="Merch Standupindo Cilegon"
        size="lg"
      >
        <form onSubmit={(event) => void saveChanges(event)} className="space-y-4">
        {notice && <StatusBanner message={notice.message} variant={notice.variant} onDismiss={() => setNotice(null)} />}
        <div>
          <div>
            <p className="text-sm leading-5 text-slate-600">Satu konfigurasi untuk banner promosi dan tautan toko Standupindo Cilegon.</p>
          </div>
        </div>
        <section className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Store className="h-5 w-5" /></span>
            <div>
              <h2 className="text-base font-extrabold text-slate-950">Banner Promosi</h2>
              <p className="mt-1 text-sm leading-5 text-slate-600">Gambar dan informasi ini ditampilkan kepada pengunjung saat banner aktif.</p>
            </div>
          </div>

          <ImageUpload
            label="Gambar Banner"
            folder="banner"
            bucket={MERCH_STORAGE_BUCKET}
            value={form.imageUrl}
            onChange={handleImageChange}
            aspect="landscape"
            objectFit="contain"
            seamlessPreview
            skipCrop
            processingProfile="poster"
            cleanupOnUnmount
            onUploadingChange={setUploading}
          />

          <div>
            <label htmlFor="merch-title" className="label-field">Judul</label>
            <input id="merch-title" value={form.title} maxLength={100} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="input-field" placeholder="Contoh: Koleksi Merch Standupindo Cilegon" />
          </div>
          <div>
            <label htmlFor="merch-description" className="label-field">Deskripsi Singkat</label>
            <textarea id="merch-description" value={form.description} maxLength={MERCH_DESCRIPTION_MAX_LENGTH} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="input-field min-h-24" placeholder="Tulis pesan singkat untuk pengunjung." aria-describedby="merch-description-count" />
            <p id="merch-description-count" className={`mt-1.5 text-right text-xs font-semibold ${form.description.length > MERCH_DESCRIPTION_MAX_LENGTH ? 'text-amber-700' : 'text-slate-500'}`}>
              {form.description.length}/{MERCH_DESCRIPTION_MAX_LENGTH}
            </p>
            {form.description.length > MERCH_DESCRIPTION_MAX_LENGTH && <p className="mt-1 text-xs font-semibold text-amber-700">Data yang tersimpan melebihi batas. Teks tidak dipotong otomatis; kurangi secara manual sebelum menyimpan.</p>}
          </div>
          <div>
            <label htmlFor="merch-shop-url" className="label-field">URL Toko</label>
            <input id="merch-shop-url" type="url" value={form.shopUrl} onChange={(event) => setForm((current) => ({ ...current, shopUrl: event.target.value }))} className="input-field" placeholder="https://..." autoComplete="url" />
            {form.shopUrl && !shopUrlValid && <p className="mt-1.5 text-xs font-semibold text-amber-700">Gunakan URL HTTPS yang valid.</p>}
          </div>

          <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <span><span className="block text-sm font-bold text-slate-800">Status Publikasi</span><span className="mt-0.5 block text-xs text-slate-500">{form.enabled ? 'Banner dan ikon toko aktif untuk publik.' : 'Banner dan ikon toko disembunyikan dari publik.'}</span></span>
            <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} className="h-5 w-5 rounded border-slate-300 text-blue-700 focus:ring-blue-500" aria-label="Aktifkan banner Merch" />
          </label>

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => void cancelEditing()} disabled={saving || uploading} className="btn-secondary min-h-11 w-full justify-center sm:w-auto disabled:cursor-not-allowed disabled:opacity-50">
              Batal
            </button>
            <button type="button" onClick={() => setPreviewOpen((open) => !open)} disabled={!form.imageUrl || !form.title.trim() || !shopUrlValid} className="btn-secondary min-h-11 w-full justify-center sm:w-auto disabled:cursor-not-allowed disabled:opacity-50">
              <Eye className="h-4 w-4" /> {previewOpen ? 'Tutup Pratinjau' : 'Pratinjau Banner'}
            </button>
            <button type="submit" disabled={saving || uploading} className="btn-primary min-h-11 w-full justify-center sm:w-auto disabled:cursor-not-allowed disabled:opacity-60">
              <Save className="h-4 w-4" /> {saving ? 'Menyimpan...' : uploading ? 'Menunggu Upload...' : 'Simpan Perubahan'}
            </button>
          </div>
        </section>
        {previewOpen && form.imageUrl && shopUrlValid && <MerchBanner imageUrl={form.imageUrl} title={form.title} description={form.description} shopUrl={form.shopUrl} preview onDismiss={() => setPreviewOpen(false)} />}
        </form>
      </Modal>
    </div>
  );
}
