import { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Check, Move, RotateCcw, ZoomIn, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });
}

async function getCroppedImage(imageSrc: string, pixelCrop: Area): Promise<Blob | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) return null;

  const maxSize = 1600;
  const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
  const outputWidth = Math.max(1, Math.round(image.width * scale));
  const outputHeight = Math.max(1, Math.round(image.height * scale));
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const sourceX = Math.max(0, pixelCrop.x * (image.width / outputWidth));
  const sourceY = Math.max(0, pixelCrop.y * (image.height / outputHeight));
  const sourceWidth = Math.min(image.width - sourceX, outputWidth);
  const sourceHeight = Math.min(image.height - sourceY, outputHeight);

  ctx.clearRect(0, 0, outputWidth, outputHeight);
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92);
  });
}

export function PhotoCropper({ src, folder, onSave, onCancel }: { src: string; folder: string; onSave: (url: string) => void; onCancel: () => void }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCropComplete = useCallback((_: unknown, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  async function handleSave() {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedImage(src, croppedAreaPixels);
      if (!blob) throw new Error('Gagal memproses crop foto.');

      const fileName = `profile-${Date.now()}.jpg`;
      const uploadPath = `${folder}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('standupindo-media').upload(uploadPath, blob, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('standupindo-media').getPublicUrl(uploadPath);
      onSave(data.publicUrl);
    } catch (error) {
      console.error('Failed to crop profile image', error);
      window.alert('Gagal menyimpan hasil crop foto. Silakan coba lagi.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-3">
      <div className="w-full max-w-2xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.3)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-700">Sesuaikan foto</p>
            <h3 className="mt-1 text-lg font-black text-slate-900">Atur posisi & ukuran</h3>
          </div>
          <button type="button" onClick={onCancel} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200" aria-label="Tutup crop foto">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative h-[420px] w-full bg-slate-100">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={4 / 4.5}
            cropShape="rect"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        <div className="space-y-4 border-t border-slate-100 bg-slate-50 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <ZoomIn className="h-4 w-4 text-slate-500" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="h-2 w-full accent-blue-600"
              aria-label="Zoom foto profil"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              <Move className="h-4 w-4" /> Drag untuk atur posisi
            </div>
            <button type="button" onClick={() => { setCrop({ x: 0, y: 0 }); setZoom(1); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-slate-300">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className="btn-secondary flex-1">Batal</button>
            <button type="button" onClick={() => void handleSave()} disabled={saving || !croppedAreaPixels} className="btn-primary flex-1 disabled:cursor-not-allowed disabled:opacity-70">
              {saving ? 'Menyimpan...' : <><Check className="h-4 w-4" /> Simpan Foto</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
