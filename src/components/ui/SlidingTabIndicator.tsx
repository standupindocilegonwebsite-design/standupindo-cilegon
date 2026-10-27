import { useLayoutEffect, useRef, type RefObject } from 'react';

interface SlidingTabIndicatorProps {
  activeId: string;
  className: string;
  trackRef: RefObject<HTMLDivElement>;
}

interface IndicatorBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

const INDICATOR_TRANSITION = 'left 360ms cubic-bezier(0.22, 1, 0.36, 1), top 360ms cubic-bezier(0.22, 1, 0.36, 1), width 360ms cubic-bezier(0.22, 1, 0.36, 1), height 360ms cubic-bezier(0.22, 1, 0.36, 1)';

function measureBounds(track: HTMLDivElement, tab: HTMLElement): IndicatorBounds {
  const trackRect = track.getBoundingClientRect();
  const tabRect = tab.getBoundingClientRect();

  return {
    left: tabRect.left - trackRect.left - track.clientLeft + track.scrollLeft,
    top: tabRect.top - trackRect.top - track.clientTop + track.scrollTop,
    width: tabRect.width,
    height: tabRect.height,
  };
}

function findActiveTab(track: HTMLDivElement, activeId: string) {
  return Array.from(track.querySelectorAll<HTMLElement>('[data-sliding-tab]'))
    .find((tab) => tab.dataset.slidingTab === activeId);
}

function setBounds(indicator: HTMLSpanElement, bounds: IndicatorBounds) {
  indicator.style.left = `${bounds.left}px`;
  indicator.style.top = `${bounds.top}px`;
  indicator.style.width = `${bounds.width}px`;
  indicator.style.height = `${bounds.height}px`;
}

function boundsChanged(first: IndicatorBounds | null, second: IndicatorBounds) {
  if (!first) return true;
  return Math.abs(first.left - second.left) > 0.5
    || Math.abs(first.top - second.top) > 0.5
    || Math.abs(first.width - second.width) > 0.5
    || Math.abs(first.height - second.height) > 0.5;
}

function hasUsableBounds(bounds: IndicatorBounds) {
  return bounds.width > 0 && bounds.height > 0;
}

export function SlidingTabIndicator({ activeId, className, trackRef }: SlidingTabIndicatorProps) {
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const activeIdRef = useRef(activeId);
  const lastBoundsRef = useRef<IndicatorBounds | null>(null);
  const hasPositionedRef = useRef(false);
  const transitionFrameRef = useRef<number | null>(null);
  activeIdRef.current = activeId;

  useLayoutEffect(() => {
    const track = trackRef.current;
    const indicator = indicatorRef.current;
    const selectedTab = track && findActiveTab(track, activeId);
    if (!track || !indicator || !selectedTab) return;

    const bounds = measureBounds(track, selectedTab);
    if (!hasUsableBounds(bounds)) {
      track.removeAttribute('data-sliding-indicator-ready');
      return;
    }

    track.setAttribute('data-sliding-indicator-ready', 'true');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (transitionFrameRef.current !== null) {
      window.cancelAnimationFrame(transitionFrameRef.current);
      transitionFrameRef.current = null;
    }

    if (!hasPositionedRef.current || reduceMotion) {
      indicator.style.transition = 'none';
      setBounds(indicator, bounds);
      hasPositionedRef.current = true;
      lastBoundsRef.current = bounds;
      return;
    }

    const visualRect = indicator.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();
    const visualBounds = {
      left: visualRect.left - trackRect.left - track.clientLeft + track.scrollLeft,
      top: visualRect.top - trackRect.top - track.clientTop + track.scrollTop,
      width: visualRect.width,
      height: visualRect.height,
    };

    indicator.style.transition = 'none';
    setBounds(indicator, visualBounds);
    indicator.getBoundingClientRect();
    indicator.style.transition = INDICATOR_TRANSITION;
    lastBoundsRef.current = bounds;
    transitionFrameRef.current = window.requestAnimationFrame(() => {
      setBounds(indicator, bounds);
      transitionFrameRef.current = null;
    });
  }, [activeId, trackRef]);

  useLayoutEffect(() => {
    const track = trackRef.current;
    const indicator = indicatorRef.current;
    if (!track || !indicator) return;

    const syncPosition = () => {
      const selectedTab = findActiveTab(track, activeIdRef.current);
      if (!selectedTab) return;

      const bounds = measureBounds(track, selectedTab);
      if (!hasUsableBounds(bounds)) {
        track.removeAttribute('data-sliding-indicator-ready');
        return;
      }

      track.setAttribute('data-sliding-indicator-ready', 'true');
      if (!boundsChanged(lastBoundsRef.current, bounds)) return;

      if (transitionFrameRef.current !== null) {
        window.cancelAnimationFrame(transitionFrameRef.current);
        transitionFrameRef.current = null;
      }
      indicator.style.transition = 'none';
      setBounds(indicator, bounds);
      lastBoundsRef.current = bounds;
      hasPositionedRef.current = true;
    };

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncPosition);
    observer?.observe(track);
    track.querySelectorAll<HTMLElement>('[data-sliding-tab]').forEach((tab) => observer?.observe(tab));
    window.addEventListener('resize', syncPosition);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncPosition);
      track.removeAttribute('data-sliding-indicator-ready');
      if (transitionFrameRef.current !== null) {
        window.cancelAnimationFrame(transitionFrameRef.current);
      }
    };
  }, [trackRef]);

  return <span ref={indicatorRef} className={`pointer-events-none absolute left-0 top-0 z-0 ${className}`} aria-hidden="true" style={{ width: 0, height: 0, transition: 'none' }} />;
}
