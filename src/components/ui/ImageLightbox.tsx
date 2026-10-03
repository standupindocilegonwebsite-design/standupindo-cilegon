import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface ImageLightboxProps {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
  closeAriaLabel?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  positionLabel?: string;
}

export function ImageLightbox({ src, alt, open, onClose, closeAriaLabel = 'Tutup', onPrevious, onNext, positionLabel }: ImageLightboxProps) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrevious?.();
      if (e.key === 'ArrowRight') onNext?.();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, onNext, onPrevious]);

  if (!open) return null;

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (deltaX < 0) onNext?.();
    else onPrevious?.();
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || event.pointerType !== 'mouse') return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (deltaX < 0) onNext?.();
    else onPrevious?.();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] overflow-auto overscroll-contain bg-slate-950/85 px-3 py-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-sm animate-fade-in sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={onClose}
        aria-label={closeAriaLabel}
        className="fixed right-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/50 sm:right-5 sm:top-5"
      >
        <X className="h-6 w-6" />
      </button>
      {positionLabel && <span className="fixed left-1/2 top-[calc(0.9rem+env(safe-area-inset-top))] z-10 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur">{positionLabel}</span>}
      {onPrevious && (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onPrevious(); }}
          aria-label="Foto sebelumnya"
          className="fixed left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/50 sm:left-5"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {onNext && (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onNext(); }}
          aria-label="Foto berikutnya"
          className="fixed right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/50 sm:right-5"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
      <div className="flex min-h-full min-w-full items-center justify-center py-2 sm:py-0">
        <div
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(event) => {
            const touch = event.touches[0];
            if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={handleTouchEnd}
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse') pointerStart.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={handlePointerEnd}
          onPointerCancel={() => { pointerStart.current = null; }}
          className={`relative flex max-h-[calc(100dvh-2rem)] max-w-full items-center justify-center overflow-auto overscroll-contain rounded-lg shadow-2xl sm:max-h-[calc(100dvh-3rem)] ${onPrevious || onNext ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
          <img
            src={src}
            alt={alt}
            className="block h-auto w-auto max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-1.5rem)] select-none rounded-lg object-contain animate-scale-in touch-pan-x touch-pan-y sm:max-h-[calc(100dvh-3rem)] sm:max-w-[calc(100vw-3rem)]"
          />
        </div>
      </div>
    </div>
    , document.body,
  );
}
