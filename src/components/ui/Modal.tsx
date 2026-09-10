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

    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  const maxW = size === 'sm' ? 'sm:max-w-sm' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={`relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-0.5rem)] max-w-[100vw] flex-col overflow-hidden rounded-[1.5rem] border border-blue-300 bg-white text-slate-900 shadow-[0_26px_80px_rgba(11,31,68,0.3)] animate-scale-in sm:max-h-[min(90dvh,680px)] sm:w-auto sm:rounded-2xl ${maxW}`}>
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 bg-white px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6 sm:pb-3 sm:pt-0">
          {title && <h3 className="text-base font-extrabold tracking-[-0.03em] text-slate-900 sm:text-xl">{title}</h3>}
          <button
            onClick={onClose}
            className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch] sm:px-6 sm:pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}
