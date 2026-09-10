import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousHtmlPosition = document.documentElement.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyLeft = document.body.style.left;
    const previousBodyRight = document.body.style.right;
    const previousBodyBottom = document.body.style.bottom;
    const previousBodyWidth = document.body.style.width;
    const previousHtmlWidth = document.documentElement.style.width;
    const previousBodyTouchAction = document.body.style.touchAction;
    const previousScrollY = window.scrollY;

    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.documentElement.style.position = 'fixed';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.top = `-${previousScrollY}px`;
    document.body.style.bottom = '0';
    document.body.style.width = '100%';
    document.documentElement.style.width = '100%';
    document.body.style.touchAction = 'none';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.position = previousBodyPosition;
      document.documentElement.style.position = previousHtmlPosition;
      document.body.style.left = previousBodyLeft;
      document.body.style.right = previousBodyRight;
      document.body.style.bottom = previousBodyBottom;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      document.documentElement.style.width = previousHtmlWidth;
      document.body.style.touchAction = previousBodyTouchAction;
      window.scrollTo(0, previousScrollY);
    };
  }, [open, onClose]);

  if (!open) return null;
  const maxW = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md';

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={`relative mt-auto w-full max-h-[calc(100dvh-0.75rem)] ${maxW} animate-scale-in touch-pan-y overscroll-contain overflow-y-auto rounded-t-3xl border border-blue-300 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-slate-900 shadow-[0_26px_80px_rgba(11,31,68,0.3)] [-webkit-overflow-scrolling:touch] sm:mt-0 sm:max-h-[min(90dvh,680px)] sm:rounded-2xl sm:p-6 sm:pb-6`}>
        <div className="sticky top-0 z-10 mb-4 flex items-center justify-between gap-4 rounded-t-3xl bg-white pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:mb-5 sm:rounded-t-2xl sm:pt-0">
          {title && <h3 className="text-lg font-extrabold tracking-[-0.03em] text-slate-900 sm:text-xl">{title}</h3>}
          <button
            onClick={onClose}
            className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
