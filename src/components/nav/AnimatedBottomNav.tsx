import type { LucideIcon } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { MobileBottomNavPortal } from '@/components/nav/MobileBottomNavPortal';

export interface AnimatedBottomNavItem {
  id: string;
  label: string;
  compactLabel?: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: () => void;
  badge?: number;
}

function getNavShape(centerRatio: number, itemCount: number, stretch = 0, baseDepth = 100, minimumHalfWidth = 0) {
  const center = centerRatio * 1000;
  const halfWidth = Math.min(
    (minimumHalfWidth > 0 ? minimumHalfWidth * 1.8 : 0.54 / itemCount) * (1 + stretch),
    centerRatio - 0.0025,
    0.9975 - centerRatio,
  ) * 1000;
  const left = center - halfWidth;
  const right = center + halfWidth;
  const depth = baseDepth * (1 + stretch * 0.45);
  const leftCurveControl = left + halfWidth * 0.42;
  const rightCurveControl = right - halfWidth * 0.42;
  const wave = `C${leftCurveControl} 0 ${center - halfWidth * 0.42} ${depth} ${center} ${depth}C${center + halfWidth * 0.42} ${depth} ${rightCurveControl} 0 ${right} 0`;
  const topContour = `M0 0H${left}${wave}H1000`;
  const shape = `${topContour}V160H0Z`;

  return { topContour, shape };
}

interface AnimatedBottomNavProps {
  items: AnimatedBottomNavItem[];
  ariaLabel: string;
  hideAt?: 'md' | 'lg' | null;
}

export function AnimatedBottomNav({
  items,
  ariaLabel,
  hideAt = 'md',
}: AnimatedBottomNavProps) {
  const activeIndex = items.findIndex((item) => item.active);
  const shapePathRef = useRef<SVGPathElement>(null);
  const contourPathRef = useRef<SVGPathElement>(null);
  const navShapeRef = useRef<SVGSVGElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const waveDepthRef = useRef(100);
  const waveHalfWidthRef = useRef(0);
  const ActiveIcon = activeIndex >= 0 ? items[activeIndex].icon : null;
  const activePositionRatio = activeIndex >= 0 ? (activeIndex + 0.5) / items.length : undefined;
  const currentPosition = useRef(activePositionRatio ?? 0);
  const activePosition = activePositionRatio !== undefined ? `${activePositionRatio * 100}%` : undefined;
  const initialShape = activePositionRatio !== undefined
    ? getNavShape(activePositionRatio, items.length, 0, waveDepthRef.current, waveHalfWidthRef.current)
    : undefined;

  useLayoutEffect(() => {
    const updateWaveDepth = () => {
      const shape = navShapeRef.current;
      const indicator = indicatorRef.current;
      const shapeBounds = shape?.getBoundingClientRect();
      const indicatorBounds = indicator?.getBoundingClientRect();
      if (!shape || !indicator || !shapeBounds?.height || !indicatorBounds) return;

      const gap = Number.parseFloat(getComputedStyle(shape).getPropertyValue('--animated-nav-cutout-gap'));
      waveDepthRef.current = ((indicatorBounds.bottom - shapeBounds.top + gap) / shapeBounds.height) * 160;
      waveHalfWidthRef.current = (indicatorBounds.width / 2 + gap) / shapeBounds.width;
      const { shape: nextShape, topContour } = getNavShape(
        currentPosition.current,
        items.length,
        0,
        waveDepthRef.current,
        waveHalfWidthRef.current,
      );
      shapePathRef.current?.setAttribute('d', nextShape);
      contourPathRef.current?.setAttribute('d', topContour);
    };

    const resizeObserver = new ResizeObserver(updateWaveDepth);
    const shape = navShapeRef.current;
    const indicator = indicatorRef.current;
    if (shape) resizeObserver.observe(shape);
    if (indicator) resizeObserver.observe(indicator);
    updateWaveDepth();
    return () => resizeObserver.disconnect();
  }, [items.length]);

  useLayoutEffect(() => {
    if (activePositionRatio === undefined || currentPosition.current === activePositionRatio) return;

    const from = currentPosition.current;
    const to = activePositionRatio;
    const baseDepth = waveDepthRef.current;
    const minimumHalfWidth = waveHalfWidthRef.current;
    let startTime = 0;
    let frame = 0;

    const updateShape = (center: number, stretch: number) => {
      currentPosition.current = center;
      const { shape, topContour } = getNavShape(center, items.length, stretch, baseDepth, minimumHalfWidth);
      shapePathRef.current?.setAttribute('d', shape);
      contourPathRef.current?.setAttribute('d', topContour);
      if (indicatorRef.current) indicatorRef.current.style.left = `${center * 100}%`;
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      updateShape(to, 0);
      return;
    }

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / 400, 1);
      const eased = 1 - (1 - progress) ** 3;
      updateShape(from + (to - from) * eased, Math.sin(progress * Math.PI) * 0.1);

      if (progress < 1) frame = requestAnimationFrame(animate);
      else updateShape(to, 0);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [activePositionRatio, items.length]);

  if (items.length === 0) return null;

  const visibilityClassName = hideAt === 'lg' ? 'lg:hidden' : hideAt === 'md' ? 'md:hidden' : '';

  return (
    <MobileBottomNavPortal className={visibilityClassName} ariaLabel={ariaLabel}>
      <div className={`animated-bottom-nav relative w-full ${activeIndex < 0 ? 'animated-bottom-nav--inactive' : ''}`}>
        {ActiveIcon && initialShape && <>
          <svg
            ref={navShapeRef}
            className="animated-bottom-nav__shape"
            viewBox="0 0 1000 160"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path ref={shapePathRef} className="animated-bottom-nav__shape-fill" d={initialShape.shape} />
            <path ref={contourPathRef} className="animated-bottom-nav__shape-contour" d={initialShape.topContour} />
          </svg>

          <span
            ref={indicatorRef}
            className="animated-bottom-nav__indicator"
            aria-hidden="true"
            style={{ left: activePosition }}
          >
            <ActiveIcon className="h-[1.375rem] w-[1.375rem]" />
          </span>
        </>}

        <div
          className="animated-bottom-nav__items relative z-10 grid"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        >
          {items.map((item) => {
            const Icon = item.icon;
            const badge = item.badge;
            const hasBadge = badge !== undefined && badge > 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onSelect}
                className={`animated-bottom-nav__item flex min-w-0 flex-col items-center gap-0.5 px-0.5 text-center ${item.active ? 'is-active' : ''}`}
                aria-current={item.active ? 'page' : undefined}
                aria-label={item.label}
              >
                <span className="animated-bottom-nav__icon-slot relative flex h-7 w-7 shrink-0 items-center justify-center">
                  <Icon className={`h-5 w-5 ${item.active ? 'opacity-0' : ''}`} />
                  {hasBadge && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-extrabold leading-none text-white">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                <span className="animated-bottom-nav__label block w-full text-xs font-semibold leading-4">
                  {item.compactLabel ? (
                    <>
                      <span className="text-[10px] leading-3 sm:hidden">{item.compactLabel}</span>
                      <span className="hidden sm:inline">{item.label}</span>
                    </>
                  ) : item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </MobileBottomNavPortal>
  );
}
