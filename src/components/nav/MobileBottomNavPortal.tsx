import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface MobileBottomNavPortalProps {
  children: React.ReactNode;
  className: string;
  ariaLabel: string;
}

export function MobileBottomNavPortal({ children, className, ariaLabel }: MobileBottomNavPortalProps) {
  const navRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const visualViewport = window.visualViewport;
    let animationFrame = 0;
    const updateViewportInset = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const visualBottom = visualViewport
          ? visualViewport.offsetTop + visualViewport.height
          : window.innerHeight;
        const bottomInset = Math.max(0, window.innerHeight - visualBottom);
        navRef.current?.style.setProperty('--mobile-nav-viewport-inset', `${bottomInset}px`);
      });
    };

    updateViewportInset();
    window.addEventListener('resize', updateViewportInset);
    window.addEventListener('orientationchange', updateViewportInset);
    window.addEventListener('pageshow', updateViewportInset);
    document.addEventListener('visibilitychange', updateViewportInset);
    visualViewport?.addEventListener('resize', updateViewportInset);
    visualViewport?.addEventListener('scroll', updateViewportInset);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', updateViewportInset);
      window.removeEventListener('orientationchange', updateViewportInset);
      window.removeEventListener('pageshow', updateViewportInset);
      document.removeEventListener('visibilitychange', updateViewportInset);
      visualViewport?.removeEventListener('resize', updateViewportInset);
      visualViewport?.removeEventListener('scroll', updateViewportInset);
    };
  }, []);

  return createPortal(
    <nav
      ref={navRef}
      className={className}
      style={{
        bottom: 'var(--mobile-nav-viewport-inset, 0px)',
        paddingBottom: 'var(--safe-bottom)',
      }}
      aria-label={ariaLabel}
    >
      {children}
    </nav>,
    document.body,
  );
}
