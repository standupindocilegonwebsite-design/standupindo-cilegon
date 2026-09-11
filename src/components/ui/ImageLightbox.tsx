import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ImageLightboxProps {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
  closeAriaLabel?: string;
}

export function ImageLightbox({ src, alt, open, onClose, closeAriaLabel = 'Tutup' }: ImageLightboxProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm animate-fade-in sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative flex min-h-full items-center justify-center py-2">
        <button
          onClick={onClose}
          aria-label={closeAriaLabel}
          className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/50"
        >
          <X className="h-6 w-6" />
        </button>
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative max-h-[calc(100dvh-2rem)] overflow-auto rounded-lg shadow-2xl"
        >
          <img
            src={src}
            alt={alt}
            className="block h-auto w-auto max-w-[calc(100vw-2rem)] rounded-lg object-contain animate-scale-in"
          />
        </div>
      </div>
    </div>
  );
}
