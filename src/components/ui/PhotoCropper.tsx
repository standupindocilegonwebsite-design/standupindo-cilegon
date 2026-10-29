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

async function createAdjustedLogo(src: string, zoom: number, position: { x: number; y: number }): Promise<Blob> {
  const image = await loadCropImage(src);
  const size = 640;
  const scale = (size * 0.92 * zoom) / Math.max(image.naturalWidth, image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Browser tidak dapat memproses logo ini.');
  context.drawImage(image, (size - width) / 2 + position.x, (size - height) / 2 + position.y, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Penyesuaian logo gagal.')),
      'image/png',
    );
  });
}

async function uploadPhoto(folder: string, file: Blob, type: string): Promise<string> {
  const fileName = `${crypto.randomUUID()}.${getImageFileExtension(type)}`;
  const uploadPath = `${folder}/${fileName}`;
  const { error } = await supabase.storage.from('standupindo-media').upload(uploadPath, file, {
    cacheControl: '31536000',
    upsert: false,
    contentType: type,
  });
  if (error) throw error;
  return supabase.storage.from('standupindo-media').getPublicUrl(uploadPath).data.publicUrl;
}

export function PhotoCropper({ src, originalFile, folder, processingProfile, cropToFrame = false, adjustLogo = false, onSave, onCancel }: { src: string; originalFile: File; folder: string; processingProfile: ImageProcessingProfile; cropToFrame?: boolean; adjustLogo?: boolean; onSave: (url: string, cardUrl?: string) => void | Promise<void>; onCancel: () => void }) {
  const [saving, setSaving] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [logoPosition, setLogoPosition] = useState({ x: 0, y: 0 });
  const [croppedArea, setCroppedArea] = useState<CropArea | null>(null);
  const [cropSize, setCropSize] = useState<{ width: number; height: number } | null>(null);
  const cropViewportRef = useRef<HTMLDivElement>(null);
  const logoDragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const viewport = cropViewportRef.current;
    if (!viewport) return;
    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (adjustLogo) {
        const cropSize = Math.min(width * 0.92, height * 0.92);
        setCropSize({ width: cropSize, height: cropSize });
      } else {
        const cropWidth = Math.min(width * 0.94, height * 0.94 * (3 / 5));
        setCropSize({ width: cropWidth, height: cropWidth * (5 / 3) });
      }
    });
    resizeObserver.observe(viewport);
    return () => resizeObserver.disconnect();
  }, [adjustLogo]);

  async function handleSave() {
    setSaving(true);
    try {
      if (adjustLogo) {
        const logo = await createAdjustedLogo(src, zoom, logoPosition);
        const logoUrl = await uploadPhoto(folder, logo, 'image/png');
        await onSave(logoUrl);
        return;
      }

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
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">{adjustLogo ? 'Logo Partner' : 'Foto Profil'}</p>
            <h3 className="mt-0.5 text-base font-black text-slate-900 sm:text-lg">{adjustLogo ? 'Sesuaikan tampilan logo' : cropToFrame ? 'Atur foto Komika' : 'Atur foto'}</h3>
          </div>
          <button type="button" onClick={onCancel} disabled={saving} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 active:scale-95 disabled:opacity-50" aria-label="Tutup crop foto">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden overscroll-contain bg-slate-50 px-2 py-2 sm:px-4">
          {adjustLogo ? (
            <>
              <div
                ref={cropViewportRef}
                className="relative flex min-h-0 w-full flex-1 touch-none items-center justify-center overflow-hidden md:max-h-[min(58dvh,520px)]"
              >
                {cropSize && (
                  <div
                    className="relative aspect-square max-h-full max-w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
                    style={{ width: cropSize.width, height: cropSize.height }}
                    onPointerDown={(event) => {
                      if (!event.isPrimary) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      logoDragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
                    }}
                    onPointerMove={(event) => {
                      const drag = logoDragRef.current;
                      if (!drag || drag.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
                      const bounds = event.currentTarget.getBoundingClientRect();
                      const scaleToCanvas = 640 / bounds.width;
                      const deltaX = (event.clientX - drag.x) * scaleToCanvas;
                      const deltaY = (event.clientY - drag.y) * scaleToCanvas;
                      logoDragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
                      setLogoPosition((position) => ({
                        x: Math.max(-240, Math.min(240, position.x + deltaX)),
                        y: Math.max(-240, Math.min(240, position.y + deltaY)),
                      }));
                    }}
                    onPointerUp={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                      logoDragRef.current = null;
                    }}
                    onPointerCancel={() => { logoDragRef.current = null; }}
                    aria-label="Pratinjau logo, geser untuk mengatur posisi"
                  >
                    <img
                      src={src}
                      alt="Pratinjau logo Partner"
                      className="pointer-events-none h-full w-full select-none object-contain"
                      draggable={false}
                      style={{
                        transform: `translate(${(logoPosition.x / 640) * 100}%, ${(logoPosition.y / 640) * 100}%) scale(${0.92 * zoom})`,
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="w-full max-w-sm shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="partner-logo-size" className="text-sm font-bold text-slate-800">Ukuran logo</label>
                  <span className="min-w-12 rounded-lg bg-blue-50 px-2 py-1 text-center text-xs font-extrabold text-blue-700">{Math.round(zoom * 100)}%</span>
                </div>
                <input
                  id="partner-logo-size"
                  type="range"
                  min="70"
                  max="180"
                  step="1"
                  value={Math.round(zoom * 100)}
                  onChange={(event) => setZoom(Number(event.target.value) / 100)}
                  className="mt-2 h-8 w-full touch-pan-y accent-blue-600"
                  aria-describedby="partner-logo-adjustment-hint"
                />
                <p id="partner-logo-adjustment-hint" className="text-xs leading-relaxed text-slate-500">Geser logo untuk mengatur posisinya. Rasio logo tetap terjaga.</p>
              </div>
            </>
          ) : cropToFrame ? (
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
            {saving ? 'Menyimpan...' : <><Check className="h-4 w-4" /> {adjustLogo ? 'Simpan Logo' : 'Simpan'}</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
