import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  titleEyebrow?: string;
  ariaLabel?: string;
  headerContent?: React.ReactNode;
  panelClassName?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ open, onClose, title, titleEyebrow, ariaLabel, headerContent, panelClassName = '', children, size = 'md' }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const visualViewport = window.visualViewport;
    let animationFrame = 0;
    const updateViewport = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const top = visualViewport?.offsetTop ?? 0;
        const height = visualViewport?.height ?? window.innerHeight;
        modalRef.current?.style.setProperty('--modal-viewport-top', `${top}px`);
        modalRef.current?.style.setProperty('--modal-viewport-height', `${height}px`);
      });
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', updateViewport);
    visualViewport?.addEventListener('resize', updateViewport);
    visualViewport?.addEventListener('scroll', updateViewport);
    updateViewport();

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', updateViewport);
      visualViewport?.removeEventListener('resize', updateViewport);
      visualViewport?.removeEventListener('scroll', updateViewport);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  const maxW = size === 'sm' ? 'sm:max-w-sm' : size === 'lg' ? 'sm:max-w-2xl' : size === 'xl' ? 'sm:max-w-5xl' : 'sm:max-w-md';

  return createPortal(
    <div ref={modalRef} className="fixed inset-x-0 z-[1000] flex items-center justify-center overflow-y-auto px-3 py-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-4" style={{ top: 'var(--modal-viewport-top, 0px)', height: 'var(--modal-viewport-height, 100dvh)' }} role="dialog" aria-modal="true" aria-label={ariaLabel ?? title}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onMouseDown={onClose} onClick={onClose} />
      <div className={`relative z-10 mx-auto flex max-h-[calc(var(--modal-viewport-height,100dvh)_-_2rem)] w-full max-w-[100vw] flex-col overflow-hidden rounded-[1.5rem] border border-blue-300 bg-white text-slate-900 shadow-[0_26px_80px_rgba(11,31,68,0.3)] animate-scale-in sm:rounded-2xl ${maxW} sm:max-h-[min(90dvh,680px)] ${panelClassName}`}>
        <div className="sticky top-0 z-10 shrink-0 bg-white px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6 sm:pb-3 sm:pt-0">
          <div className="flex items-center justify-between gap-3">
            {title && <div className="min-w-0 flex-1">
              {titleEyebrow && <p className="mb-0.5 text-[9px] font-extrabold uppercase tracking-[0.16em] text-blue-700">{titleEyebrow}</p>}
              <h3 className="text-base font-extrabold leading-tight tracking-[-0.03em] text-slate-900 sm:text-xl">{title}</h3>
            </div>}
            <button
              onClick={onClose}
              className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
              aria-label="Tutup"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {headerContent && <div className="mt-2">{headerContent}</div>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-5 [touch-action:pan-y_pinch-zoom] sm:px-6 sm:pb-6">
          {children}
        </div>
      </div>
    </div>
    , document.body,
  );
}
