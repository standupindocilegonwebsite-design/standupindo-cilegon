import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getImageFileExtension, processImageForUpload, type ImageProcessingProfile } from '@/lib/image-processing';

export function PhotoCropper({ src, originalFile, folder, processingProfile, onSave, onCancel }: { src: string; originalFile: File; folder: string; processingProfile: ImageProcessingProfile; onSave: (url: string) => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const uploadFile = await processImageForUpload(originalFile, processingProfile);
      const fileName = `${crypto.randomUUID()}.${getImageFileExtension(uploadFile.type)}`;
      const uploadPath = `${folder}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('standupindo-media').upload(uploadPath, uploadFile, { cacheControl: '3600', upsert: false, contentType: uploadFile.type });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('standupindo-media').getPublicUrl(uploadPath);
      onSave(data.publicUrl);
    } catch (error) {
      console.error('Failed to save profile image', error);
      window.alert('Gagal menyimpan foto. Silakan coba lagi.');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-x-0 top-0 bottom-[calc(4.5rem+var(--safe-bottom))] z-[1000] flex items-center justify-center overflow-y-auto overscroll-contain px-3 py-[calc(1rem+env(safe-area-inset-top))] md:inset-0 md:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.3)] md:max-h-[min(90dvh,760px)] md:rounded-[28px]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Foto Profil</p>
            <h3 className="mt-0.5 text-base font-black text-slate-900 sm:text-lg">Atur foto</h3>
          </div>
          <button type="button" onClick={onCancel} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 active:scale-95" aria-label="Tutup crop foto">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex h-[min(42dvh,360px)] min-h-[160px] w-full shrink-0 items-center justify-center bg-slate-100 p-3 sm:p-4 md:h-[min(52dvh,460px)]">
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <img src={src} alt="Pratinjau foto profil utuh" className="h-full w-full object-contain" />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-slate-100 bg-white px-4 pb-3 pt-3 sm:justify-end sm:px-5 sm:pb-4">
          <button type="button" onClick={onCancel} disabled={saving} className="btn-secondary min-h-11 min-w-0 flex-1 whitespace-nowrap rounded-xl px-3 text-sm active:scale-[0.98] sm:flex-none sm:min-w-32 sm:px-5">Batal</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="btn-primary min-h-11 min-w-0 flex-1 whitespace-nowrap rounded-xl px-3 text-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 sm:flex-none sm:min-w-36 sm:px-5">
            {saving ? 'Menyimpan...' : <><Check className="h-4 w-4" /> Simpan Foto</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
