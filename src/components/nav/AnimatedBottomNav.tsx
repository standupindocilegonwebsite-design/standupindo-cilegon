import type { LucideIcon } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { MobileBottomNavPortal } from '@/components/nav/MobileBottomNavPortal';

export interface AnimatedBottomNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: () => void;
  badge?: number;
}

function getNavShape(centerRatio: number, itemCount: number, stretch = 0) {
  const center = centerRatio * 1000;
  const halfWidth = Math.min(
    (0.65 / itemCount) * (1 + stretch),
    centerRatio - 0.015,
    0.985 - centerRatio,
  ) * 1000;
  const left = center - halfWidth;
  const right = center + halfWidth;
  const depth = 80 * (1 + stretch * 0.45);
  const leftCurveControl = left + halfWidth * 0.42;
  const rightCurveControl = right - halfWidth * 0.42;
  const wave = `C${leftCurveControl} 0 ${center - halfWidth * 0.42} ${depth} ${center} ${depth}C${center + halfWidth * 0.42} ${depth} ${rightCurveControl} 0 ${right} 0`;
  const leftJoin = left >= 40
    ? `M40 0H${left}`
    : `M0 40C0 16 ${Math.max(0, left - 18)} 0 ${left} 0`;
  const rightJoin = right <= 960
    ? `H960Q1000 0 1000 40`
    : `C${Math.min(1000, right + 30)} 0 1000 16 1000 40`;
  const topContour = `${leftJoin}${wave}${rightJoin}`;
  const leftClose = left >= 40 ? 'V40Q0 0 40 0Z' : 'V40Z';
  const shape = `${leftJoin}${wave}${rightJoin}V120Q1000 160 960 160H40Q0 160 0 120${leftClose}`;

  return { topContour, shape };
}

interface AnimatedBottomNavProps {
  items: AnimatedBottomNavItem[];
  className: string;
  ariaLabel: string;
  maxWidthClassName?: string;
  contentClassName?: string;
}

export function AnimatedBottomNav({
  items,
  className,
  ariaLabel,
  maxWidthClassName = 'max-w-md',
  contentClassName = '',
}: AnimatedBottomNavProps) {
  const activeIndex = items.findIndex((item) => item.active);
  const shapePathRef = useRef<SVGPathElement>(null);
  const contourPathRef = useRef<SVGPathElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const ActiveIcon = activeIndex >= 0 ? items[activeIndex].icon : null;
  const activePositionRatio = activeIndex >= 0 ? (activeIndex + 0.5) / items.length : undefined;
  const currentPosition = useRef(activePositionRatio ?? 0);
  const activePosition = activePositionRatio !== undefined ? `${activePositionRatio * 100}%` : undefined;
  const initialShape = activePositionRatio !== undefined
    ? getNavShape(activePositionRatio, items.length)
    : undefined;

  useLayoutEffect(() => {
    if (activePositionRatio === undefined || currentPosition.current === activePositionRatio) return;

    const from = currentPosition.current;
    const to = activePositionRatio;
    let startTime = 0;
    let frame = 0;

    const updateShape = (center: number, stretch: number) => {
      currentPosition.current = center;
      const { shape, topContour } = getNavShape(center, items.length, stretch);
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

  return (
    <MobileBottomNavPortal className={className} ariaLabel={ariaLabel}>
      <div
        className={`animated-bottom-nav relative mx-auto w-[calc(100%-1.5rem)] ${maxWidthClassName} ${contentClassName}`}
      >
        {ActiveIcon && initialShape && <>
          <svg
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
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </MobileBottomNavPortal>
  );
}
