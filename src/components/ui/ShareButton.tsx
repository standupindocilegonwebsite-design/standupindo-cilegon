import { useEffect, useRef, useState } from 'react';
import { Send, Check } from 'lucide-react';

interface ShareButtonProps {
  title: string;
  text: string;
  url: string;
  image?: string | null;
  className?: string;
}

export function ShareButton({ title, text, url, image, className = '' }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [imageFile, setImageFile] = useState<{ image: string; file: File } | null>(null);
  const imageFileRequest = useRef<{ image: string; promise: Promise<File | null>; controller: AbortController } | null>(null);

  useEffect(() => () => {
    imageFileRequest.current?.controller.abort();
  }, []);

  async function prepareImageFile(): Promise<File | null> {
    if (!image || typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return null;
    const cachedImageFile = imageFile;
    if (cachedImageFile && cachedImageFile.image === image) return cachedImageFile.file;
    if (imageFileRequest.current?.image === image) return imageFileRequest.current.promise;

    const requestInfo = { image, promise: Promise.resolve<File | null>(null), controller: new AbortController() };
    const request = (async () => {
      try {
        const response = await fetch(image, { signal: requestInfo.controller.signal });
        if (!response.ok) throw new Error(`Gagal mengambil gambar untuk dibagikan (${response.status}).`);
        const imageBlob = await response.blob();
        if (!imageBlob.type.startsWith('image/')) throw new Error('File yang akan dibagikan bukan gambar.');

        const extension = imageBlob.type === 'image/png' ? 'png' : imageBlob.type === 'image/webp' ? 'webp' : 'jpg';
        const candidate = new File([imageBlob], `standupindo-poster.${extension}`, { type: imageBlob.type });
        if (!navigator.canShare({ files: [candidate] })) return null;
        setImageFile({ image, file: candidate });
        return candidate;
      } catch (error) {
        if ((error as DOMException)?.name !== 'AbortError') console.error('Gagal menyiapkan poster untuk dibagikan.', error);
        return null;
      } finally {
        if (imageFileRequest.current === requestInfo) imageFileRequest.current = null;
      }
    })();
    requestInfo.promise = request;
    imageFileRequest.current = requestInfo;
    return request;
  }

  async function handleShare() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        const cachedImageFile = imageFile;
        const shareImageFile = cachedImageFile && cachedImageFile.image === image ? cachedImageFile.file : null;
        const shareRequest = navigator.share({
          title,
          text,
          ...(!text.includes(url) ? { url } : {}),
          ...(shareImageFile && navigator.canShare?.({ files: [shareImageFile] }) ? { files: [shareImageFile] } : {}),
        });
        void prepareImageFile();
        await shareRequest;
        return;
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
        console.error('Gagal membuka native share sheet.', err);
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (error) {
      console.error('Gagal menyalin link untuk dibagikan.', error);
    }
  }

  return (
    <button
      onClick={handleShare}
      aria-label={copied ? 'Link berhasil disalin' : 'Bagikan'}
      title={copied ? 'Link berhasil disalin' : 'Bagikan'}
      onPointerEnter={() => void prepareImageFile()}
      onFocus={() => void prepareImageFile()}
      className={`inline-flex items-center justify-center rounded-xl border border-blue-200 bg-white p-2.5 text-blue-800 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 active:scale-[0.98] ${className}`}
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <Send className="h-4 w-4 text-blue-600" />
      )}
    </button>
  );
}
