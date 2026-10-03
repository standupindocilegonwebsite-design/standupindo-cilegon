import { useRef, useState } from 'react';
import { AlertCircle, ImagePlus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getImageFileExtension, processImageForUpload, validateImageFile } from '@/lib/image-processing';

interface MultiImageUploadProps {
  label: string;
  folder: string;
  value: string[];
  onChange: (urls: string[]) => void;
  maxFiles?: number;
  onUploadingChange?: (uploading: boolean) => void;
}

export function MultiImageUpload({ label, folder, value, onChange, maxFiles = 15, onUploadingChange }: MultiImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState('');
  const remaining = Math.max(0, maxFiles - value.length);

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';
    setError('');
    if (selectedFiles.length === 0) return;

    const errors: string[] = [];
    const validFiles = selectedFiles.filter((file) => {
      const validationError = validateImageFile(file);
      if (validationError) {
        errors.push(`${file.name}: ${validationError}`);
        return false;
      }
      return true;
    }).slice(0, remaining);

    if (selectedFiles.length > remaining) {
      errors.push(`Hanya ${remaining} foto lagi yang bisa ditambahkan (maksimal ${maxFiles}).`);
    }
    if (validFiles.length === 0) {
      setError(errors.join(' '));
      return;
    }

    setUploading(true);
    onUploadingChange?.(true);
    const uploadedUrls: string[] = [];
    const failedFiles: string[] = [];
    try {
      for (const [index, file] of validFiles.entries()) {
        try {
          setUploadProgress(`Memproses ${index + 1}/${validFiles.length}...`);
          const uploadFile = await processImageForUpload(file, 'documentation');
          setUploadProgress(`Mengupload ${index + 1}/${validFiles.length}...`);
          const extension = getImageFileExtension(uploadFile.type);
          const path = `${folder}/${crypto.randomUUID()}.${extension}`;
          const { error: uploadError } = await supabase.storage
            .from('standupindo-media')
            .upload(path, uploadFile, { cacheControl: '3600', upsert: false, contentType: uploadFile.type });
          if (uploadError) {
            failedFiles.push(`${file.name} (${uploadError.message})`);
            continue;
          }
          const { data } = supabase.storage.from('standupindo-media').getPublicUrl(path);
          uploadedUrls.push(data.publicUrl);
        } catch (fileFailure) {
          const detail = fileFailure instanceof Error ? fileFailure.message : 'Kesalahan tidak diketahui.';
          failedFiles.push(`${file.name} (${detail})`);
          continue;
        }
      }
      if (uploadedUrls.length > 0) onChange([...value, ...uploadedUrls]);
      if (failedFiles.length > 0) errors.push(`Gagal mengupload: ${failedFiles.join(', ')}.`);
      setError(errors.join(' '));
    } catch (uploadFailure) {
      console.error('Dokumentasi event gagal diupload.', uploadFailure);
      const detail = uploadFailure instanceof Error ? uploadFailure.message : 'Kesalahan tidak diketahui.';
      setError(`Foto dokumentasi gagal diupload: ${detail}`);
    } finally {
      setUploading(false);
      setUploadProgress('');
      onUploadingChange?.(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="label-field">{label}</p>
        <span className="text-xs font-semibold text-slate-500">{value.length}/{maxFiles}</span>
      </div>
      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((url, index) => (
            <div key={`${url}-${index}`} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
              <img src={url} alt={`Foto dokumentasi ${index + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, photoIndex) => photoIndex !== index))}
                aria-label={`Hapus foto dokumentasi ${index + 1}`}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-slate-950/70 text-white transition hover:bg-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {remaining > 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-blue-200 bg-blue-50/70 p-3 text-left transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 ring-1 ring-blue-100">
            {uploading ? <span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" /> : <ImagePlus className="h-6 w-6" />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-800">{uploading ? uploadProgress : 'Pilih beberapa foto'}</span>
            <span className="mt-0.5 block text-xs text-slate-500">JPG, PNG, WEBP · Maks. 5 MB/foto · Bisa pilih hingga {remaining} foto</span>
          </span>
        </button>
      ) : (
        <p className="text-xs font-medium text-slate-500">Maksimal {maxFiles} foto dokumentasi.</p>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 ring-1 ring-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void handleFiles(event)} className="hidden" />
    </div>
  );
}
