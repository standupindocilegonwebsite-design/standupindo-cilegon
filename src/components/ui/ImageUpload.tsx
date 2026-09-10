import { useRef, useState } from 'react';
import { Upload, X, ImageIcon, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ImageUploadProps {
  label: string;
  folder: string;
  value: string;
  onChange: (url: string) => void;
  aspect?: 'square' | 'portrait' | 'landscape' | 'auto';
  required?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

export function ImageUpload({ label, folder, value, onChange, aspect = 'auto', required = false, onUploadingChange }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const aspectClass = aspect === 'square' ? 'aspect-square' : aspect === 'portrait' ? 'aspect-[3/4]' : aspect === 'landscape' ? 'aspect-video' : 'aspect-[4/3]';

  function validate(file: File): string | null {
    if (!ALLOWED.includes(file.type)) return 'Format file tidak didukung. Gunakan JPG, PNG, atau WEBP.';
    if (file.size > MAX_SIZE) return 'Ukuran file maksimal 5 MB.';
    return null;
  }

  async function uploadFile(file: File) {
    const vErr = validate(file);
    if (vErr) { setError(vErr); return; }
    setError('');
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
      const path = `${folder}/${fileName}`;
      const { error: upErr } = await supabase.storage.from('standupindo-media').upload(path, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('standupindo-media').getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (err) {
      console.error('upload failed', err);
      setError('Gagal mengupload gambar. Silakan coba lagi.');
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  function handleRemove() {
    if (value && !window.confirm('Hapus foto ini?')) return;
    onChange('');
    setError('');
  }

  return (
    <div>
      <label className="label-field">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>

      {value ? (
        <div className="space-y-3">
          <div className={`relative overflow-hidden rounded-xl ring-1 ring-slate-200 ${aspectClass} bg-slate-50`}>
            <img src={value} alt="Preview" className="h-full w-full object-cover" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="flex-1 rounded-lg bg-slate-100 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50">
              Ganti
            </button>
            <button type="button" onClick={handleRemove} disabled={uploading} className="flex-1 rounded-lg bg-red-50 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50">
              Hapus
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-10 text-center transition ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100'} ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
              <p className="text-sm font-semibold text-slate-500">Mengupload...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <Upload className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700">Klik untuk memilih gambar</p>
              <p className="text-xs text-slate-400">atau drag & drop ke sini</p>
              <p className="mt-1 text-xs text-slate-400">JPG, PNG, WEBP · Maks. 5 MB</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} className="hidden" />
    </div>
  );
}

export function ImageFallback({ src, alt, className, iconClassName }: { src: string | null | undefined; alt: string; className?: string; iconClassName?: string }) {
  if (src) {
    return <img src={src} alt={alt} className={className} />;
  }
  return (
    <div className={`flex items-center justify-center bg-slate-100 ${className}`}>
      <ImageIcon className={iconClassName ?? 'h-8 w-8 text-slate-300'} />
    </div>
  );
}
