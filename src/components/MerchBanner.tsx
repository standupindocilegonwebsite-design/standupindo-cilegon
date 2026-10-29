import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Store, X } from 'lucide-react';
import { getMerchShopUrl } from '@/lib/merch';

interface MerchBannerProps {
  imageUrl: string;
  title: string;
  description: string;
  shopUrl: string;
  autoDismissAfterMs?: number;
  onDismiss?: () => void;
  onAutoDismiss?: () => void;
  preview?: boolean;
}

export function MerchBanner({ imageUrl, title, description, shopUrl, autoDismissAfterMs, onDismiss, onAutoDismiss, preview = false }: MerchBannerProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [transformOrigin, setTransformOrigin] = useState('calc(100% - 1.25rem) 1.25rem');
  const bannerRef = useRef<HTMLDivElement>(null);
  const dismissTimer = useRef<number | null>(null);
  const autoDismissTimer = useRef<number | null>(null);
  const isDismissing = useRef(false);
  const safeShopUrl = getMerchShopUrl(shopUrl);

  const dismiss = useCallback((reason: 'manual' | 'auto') => {
    if (isDismissing.current) return;
    isDismissing.current = true;
    setVisible(false);
    if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
    dismissTimer.current = window.setTimeout(() => {
      if (reason === 'manual') onDismiss?.();
      else onAutoDismiss?.();
      dismissTimer.current = null;
    }, 320);
  }, [onAutoDismiss, onDismiss]);

  useEffect(() => {
    setImageFailed(false);
    isDismissing.current = false;
    const frame = window.requestAnimationFrame(() => {
      const banner = bannerRef.current;
      const storeIcon = document.querySelector<HTMLElement>('[data-merch-store-trigger]');
      if (banner && storeIcon) {
        const bannerParent = banner.parentElement;
        const parentRect = bannerParent?.getBoundingClientRect();
        const parentStyle = bannerParent ? window.getComputedStyle(bannerParent) : null;
        const paddingLeft = Number.parseFloat(parentStyle?.paddingLeft ?? '0') || 0;
        const paddingRight = Number.parseFloat(parentStyle?.paddingRight ?? '0') || 0;
        const paddingTop = Number.parseFloat(parentStyle?.paddingTop ?? '0') || 0;
        const bannerLeft = parentRect && bannerParent
          ? parentRect.left + paddingLeft + (bannerParent.clientWidth - paddingLeft - paddingRight - banner.offsetWidth) / 2
          : banner.getBoundingClientRect().left;
        const bannerTop = parentRect ? parentRect.top + paddingTop : banner.getBoundingClientRect().top;
        const iconRect = storeIcon.getBoundingClientRect();
        setTransformOrigin(`${iconRect.left + iconRect.width / 2 - bannerLeft}px ${iconRect.top + iconRect.height / 2 - bannerTop}px`);
      }
      setVisible(true);
    });
    if (autoDismissAfterMs !== undefined) {
      autoDismissTimer.current = window.setTimeout(() => dismiss('auto'), autoDismissAfterMs);
    }
    return () => {
      window.cancelAnimationFrame(frame);
      if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
      if (autoDismissTimer.current !== null) window.clearTimeout(autoDismissTimer.current);
    };
  }, [autoDismissAfterMs, description, dismiss, imageUrl, safeShopUrl, title]);

  if (!safeShopUrl || !imageUrl.trim() || !title.trim() || imageFailed) return null;

  return (
    <div
      ref={bannerRef}
      style={{ transformOrigin }}
      className={`relative mx-auto w-full max-w-xl overflow-hidden rounded-xl border border-blue-100 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.12)] transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${visible ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-1 scale-[0.04] opacity-0'}`}
    >
      <a
        href={safeShopUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Kunjungi toko merchandise: ${title}`}
        className="group flex items-center gap-2 p-2 pr-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:gap-3 sm:p-3 sm:pr-12"
      >
        <img
          src={imageUrl}
          alt=""
          onError={() => setImageFailed(true)}
          className="pointer-events-none h-10 w-14 shrink-0 object-contain sm:h-14 sm:w-20"
        />
        <div className="pointer-events-none min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Store className="h-3 w-3 shrink-0 text-blue-700 sm:h-3.5 sm:w-3.5" />
            <h2 className="truncate text-xs font-black text-slate-950 sm:text-sm">{title}</h2>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[10px] leading-4 text-slate-600 sm:text-xs">{description}</p>
          <span className="mt-1 inline-flex min-h-6 items-center gap-1 rounded-md bg-blue-700 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm transition-colors group-hover:bg-blue-800 sm:mt-1.5 sm:min-h-8 sm:gap-1.5 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs">
            Beli Merchandise <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </a>
      {onDismiss && (
        <button
          type="button"
          onClick={() => dismiss('manual')}
          className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100/90 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:right-2 sm:top-2 sm:h-9 sm:w-9"
          aria-label={preview ? 'Tutup pratinjau' : 'Tutup promosi merchandise'}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
