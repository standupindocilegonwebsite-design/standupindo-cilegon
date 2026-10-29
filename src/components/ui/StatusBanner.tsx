import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

export type StatusBannerVariant = 'success' | 'error' | 'warning' | 'info';

const VARIANT_STYLES: Record<StatusBannerVariant, { title: string; className: string; icon: typeof CheckCircle2 }> = {
  success: {
    title: 'Berhasil',
    className: 'border-emerald-200 bg-white text-emerald-950 ring-emerald-100',
    icon: CheckCircle2,
  },
  error: {
    title: 'Tidak berhasil',
    className: 'border-rose-200 bg-white text-rose-950 ring-rose-100',
    icon: AlertCircle,
  },
  warning: {
    title: 'Perhatian',
    className: 'border-amber-200 bg-white text-amber-950 ring-amber-100',
    icon: TriangleAlert,
  },
  info: {
    title: 'Informasi',
    className: 'border-blue-200 bg-white text-blue-950 ring-blue-100',
    icon: Info,
  },
};

interface StatusBannerProps {
  message: string;
  variant: StatusBannerVariant;
  onDismiss: () => void;
  className?: string;
}

export function StatusBanner({ message, variant, onDismiss, className = '' }: StatusBannerProps) {
  const [visible, setVisible] = useState(false);
  const dismissTimer = useRef<number | null>(null);
  const dismissCallback = useRef(onDismiss);
  dismissCallback.current = onDismiss;

  const dismiss = useCallback(() => {
    setVisible(false);
    if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
    dismissTimer.current = window.setTimeout(() => {
      dismissCallback.current();
      dismissTimer.current = null;
    }, 180);
  }, []);

  useEffect(() => {
    setVisible(false);
    const frame = window.requestAnimationFrame(() => setVisible(true));
    if (variant === 'success' || variant === 'info') {
      dismissTimer.current = window.setTimeout(dismiss, 4500);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
    };
  }, [dismiss, message, variant]);

  const style = VARIANT_STYLES[variant];
  const Icon = style.icon;

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-[0_12px_30px_rgba(15,23,42,0.12)] ring-1 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${style.className} ${visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'} ${className}`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${variant === 'success' ? 'text-emerald-600' : variant === 'error' ? 'text-rose-600' : variant === 'warning' ? 'text-amber-600' : 'text-blue-600'}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold">{style.title}</p>
        <p className="mt-0.5 break-words text-sm font-medium leading-5 text-slate-700">{message}</p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label="Tutup pesan"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
