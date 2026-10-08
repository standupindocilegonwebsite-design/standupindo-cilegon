import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getImageFileExtension, processImageForUpload, type ImageProcessingProfile } from '@/lib/image-processing';

type CropArea = { x: number; y: number; width: number; height: number };

function loadCropImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Gambar tidak dapat dibaca untuk dipotong.'));
    image.src = src;
  });
}

async function createCardPhoto(src: string, area: CropArea): Promise<Blob> {
  const image = await loadCropImage(src);
  const scale = Math.min(1280 / area.width, 1280 / area.height, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(area.width * scale));
  canvas.height = Math.max(1, Math.round(area.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Browser tidak dapat memproses foto ini.');
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Pemotongan foto gagal.')),
      'image/jpeg',
      0.9,
    );
  });
}

async function uploadPhoto(folder: string, file: Blob, type: string): Promise<string> {
  const fileName = `${crypto.randomUUID()}.${getImageFileExtension(type)}`;
  const uploadPath = `${folder}/${fileName}`;
  const { error } = await supabase.storage.from('standupindo-media').upload(uploadPath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: type,
  });
  if (error) throw error;
  return supabase.storage.from('standupindo-media').getPublicUrl(uploadPath).data.publicUrl;
}

export function PhotoCropper({ src, originalFile, folder, processingProfile, cropToFrame = false, onSave, onCancel }: { src: string; originalFile: File; folder: string; processingProfile: ImageProcessingProfile; cropToFrame?: boolean; onSave: (url: string, cardUrl?: string) => void | Promise<void>; onCancel: () => void }) {
  const [saving, setSaving] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<CropArea | null>(null);
  const [cropSize, setCropSize] = useState<{ width: number; height: number } | null>(null);
  const cropViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = cropViewportRef.current;
    if (!viewport) return;
    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const cropWidth = Math.min(width * 0.94, height * 0.94 * (3 / 5));
      setCropSize({ width: cropWidth, height: cropWidth * (5 / 3) });
    });
    resizeObserver.observe(viewport);
    return () => resizeObserver.disconnect();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const processedFile = await processImageForUpload(originalFile, processingProfile);
      const photoUrl = await uploadPhoto(folder, processedFile, processedFile.type);
      let cardUrl: string | undefined;
      if (cropToFrame) {
        if (!croppedArea) throw new Error('Tunggu sampai pratinjau foto siap, lalu coba simpan lagi.');
        const cardPhoto = await createCardPhoto(src, croppedArea);
        cardUrl = await uploadPhoto(folder, cardPhoto, cardPhoto.type);
      }
      await onSave(photoUrl, cardUrl);
    } catch (error) {
      console.error('Failed to save profile image', error);
      const detail = error instanceof Error ? ` ${error.message}` : '';
      window.alert(`Gagal menyimpan foto.${detail}`);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center overflow-hidden overscroll-contain md:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm" onClick={() => { if (!saving) onCancel(); }} />
      <div className="relative z-10 flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.3)] md:h-auto md:max-h-[min(94dvh,900px)] md:max-w-3xl md:rounded-[28px] md:border">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-5 md:pt-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Foto Profil</p>
            <h3 className="mt-0.5 text-base font-black text-slate-900 sm:text-lg">{cropToFrame ? 'Atur foto Komika' : 'Atur foto'}</h3>
          </div>
          <button type="button" onClick={onCancel} disabled={saving} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 active:scale-95 disabled:opacity-50" aria-label="Tutup crop foto">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden overscroll-contain bg-slate-50 px-2 py-2 sm:px-4">
          {cropToFrame ? (
            <>
              <div ref={cropViewportRef} className="relative min-h-0 w-full max-w-[520px] flex-1 overflow-hidden rounded-[22px] bg-slate-950 shadow-lg md:max-h-[min(76dvh,720px)]">
                {cropSize && <Cropper
                  image={src}
                  crop={crop}
                  zoom={zoom}
                  aspect={3 / 5}
                  cropSize={cropSize}
                  objectFit="contain"
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, area) => setCroppedArea(area)}
                  classes={{ cropAreaClassName: 'member-photo-crop-area' }}
                  showGrid={false}
                  restrictPosition
                />}
              </div>
              <p className="shrink-0 text-center text-xs text-slate-600">Geser untuk mengatur posisi · Scroll atau cubit untuk zoom</p>
            </>
          ) : (
            <div className="flex h-[min(52dvh,460px)] w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <img src={src} alt="Pratinjau foto profil utuh" className="h-full w-full object-contain" />
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-slate-100 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:justify-end sm:px-5 sm:pb-4">
          <button type="button" onClick={onCancel} disabled={saving} className="btn-secondary min-h-11 min-w-0 flex-1 whitespace-nowrap rounded-xl px-3 text-sm active:scale-[0.98] disabled:opacity-50 sm:flex-none sm:min-w-32 sm:px-5">Batal</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="btn-primary min-h-11 min-w-0 flex-1 whitespace-nowrap rounded-xl px-3 text-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 sm:flex-none sm:min-w-36 sm:px-5">
            {saving ? 'Menyimpan...' : <><Check className="h-4 w-4" /> Simpan</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
