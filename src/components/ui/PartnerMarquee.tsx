import { useEffect, useRef, useState } from 'react';
import type { PartnerCategory, PublicPartnerLogo } from '@/lib/types';

const CATEGORY_LABELS: Record<PartnerCategory, string> = {
  sponsor: 'Sponsor',
  support: 'Support',
  media_partner: 'Media Partner',
};

const CATEGORY_ORDER: PartnerCategory[] = ['sponsor', 'support', 'media_partner'];

export function PartnerMarquee({ partners, category }: { partners: PublicPartnerLogo[]; category: PartnerCategory }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, scrollLeft: 0 });
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [repeatCount, setRepeatCount] = useState(2);
  const [reducedMotion, setReducedMotion] = useState(false);
  const isLooping = partners.length > 1 && loopEnabled && !reducedMotion;
  const direction = category === 'support' ? -1 : 1;
  const items = isLooping ? Array.from({ length: repeatCount }, () => partners).flat() : partners;
  pausedRef.current = paused;

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    const track = shell?.firstElementChild;
    if (!shell || !(track instanceof HTMLElement)) return undefined;

    const measure = () => {
      const currentRepeatCount = isLooping ? repeatCount : 1;
      const baseWidth = track.scrollWidth / currentRepeatCount;
      if (partners.length > 1 && baseWidth > 0) {
        const nextRepeatCount = Math.max(2, Math.ceil(shell.clientWidth / baseWidth) + 2);
        setRepeatCount((current) => current === nextRepeatCount ? current : nextRepeatCount);
      }
      setLoopEnabled(partners.length > 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    observer.observe(track);
    return () => observer.disconnect();
  }, [isLooping, partners.length, repeatCount]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !isLooping) return undefined;

    if (direction < 0) shell.scrollLeft = shell.scrollWidth / repeatCount;
    let frame = 0;
    let previousTime = 0;
    let position = shell.scrollLeft;
    const speed = 40;
    const animate = (time: number) => {
      if (pausedRef.current) {
        position = shell.scrollLeft;
      } else if (previousTime) {
        const loopWidth = shell.scrollWidth / repeatCount;
        const distance = speed * Math.min((time - previousTime) / 1000, 0.05);
        position += direction * distance;
        if (direction > 0 && position >= loopWidth) position -= loopWidth;
        if (direction < 0 && position <= 0) position += loopWidth;
        shell.scrollLeft = position;
      }

      previousTime = time;
      frame = window.requestAnimationFrame(animate);
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [direction, isLooping, repeatCount]);

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) return;
    dragStartRef.current = { x: event.clientX, scrollLeft: event.currentTarget.scrollLeft };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPaused(true);
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!paused || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.scrollLeft = dragStartRef.current.scrollLeft - (event.clientX - dragStartRef.current.x);
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setPaused(false);
  }

  if (partners.length === 0) return null;

  return (
    <div className="partner-marquee-group">
      <h3 className="partner-marquee-label">{CATEGORY_LABELS[category]}</h3>
      <div
        ref={shellRef}
        className={`partner-marquee-shell ${isLooping ? '' : 'is-static'}`}
        role="region"
        aria-label={`${CATEGORY_LABELS[category]} partner`}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="partner-marquee-track" role="list">
          {items.map((partner, index) => {
            const duplicate = index >= partners.length;
            return (
              <div key={`${partner.id}-${index}`} className="partner-marquee-item" role="listitem" aria-hidden={duplicate}>
                <div className="partner-marquee-logo">
                  {partner.logo_url
                    ? <img src={partner.logo_url} alt={duplicate ? '' : partner.name} loading="lazy" draggable={false} />
                    : <span aria-hidden="true">{partner.name.trim().slice(0, 2).toUpperCase()}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function PartnerMarqueeCollection({
  partnersByCategory,
}: {
  partnersByCategory: Partial<Record<PartnerCategory, PublicPartnerLogo[]>>;
}) {
  const categories = CATEGORY_ORDER.filter((category) => (partnersByCategory[category]?.length ?? 0) > 0);

  if (categories.length === 0) return null;

  return (
    <div className="partner-marquee-collection">
      {categories.map((category) => (
        <PartnerMarquee
          key={category}
          partners={partnersByCategory[category] ?? []}
          category={category}
        />
      ))}
    </div>
  );
}
