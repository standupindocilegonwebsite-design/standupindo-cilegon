import { useEffect, useRef, useState } from 'react';

const numberFormatter = new Intl.NumberFormat('id-ID');

export function AnimatedCount({ value, className }: { value: number; className: string }) {
  const [count, setCount] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) {
      setCount(value);
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      hasAnimated.current = true;
      setCount(value);
      return;
    }

    const duration = 2000;
    const startedAt = performance.now();
    let frame = 0;
    const updateCount = (now: number) => {
      hasAnimated.current = true;
      const progress = Math.min((now - startedAt) / duration, 1);
      const easedProgress = progress ** 3 * (progress * (progress * 6 - 15) + 10);
      setCount(Math.round(value * easedProgress));
      if (progress < 1) frame = window.requestAnimationFrame(updateCount);
    };
    frame = window.requestAnimationFrame(updateCount);

    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return <span className={className}>{numberFormatter.format(count)}</span>;
}
