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
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  const maxW = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md';

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={`relative mt-auto w-full max-h-[calc(100dvh-1rem)] ${maxW} animate-scale-in touch-pan-y overscroll-contain overflow-y-auto rounded-t-3xl border border-blue-300 bg-white p-4 text-slate-900 shadow-[0_26px_80px_rgba(11,31,68,0.3)] [-webkit-overflow-scrolling:touch] sm:mt-0 sm:max-h-[min(90dvh,680px)] sm:rounded-2xl sm:p-6`}>
        <div className="mb-4 flex items-center justify-between gap-4 sm:mb-5">
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
