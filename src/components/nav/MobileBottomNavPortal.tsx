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
    const updateNavClearance = () => {
      const nav = navRef.current;
      if (!nav) return;

      const navBounds = nav.getBoundingClientRect();
      if (navBounds.height === 0) {
        document.documentElement.style.removeProperty('--mobile-nav-clearance');
        return;
      }

      const indicatorTop = nav.querySelector('.animated-bottom-nav__indicator')?.getBoundingClientRect().top;
      const occupiedTop = indicatorTop === undefined ? navBounds.top : Math.min(navBounds.top, indicatorTop);
      const clearance = Math.max(0, window.innerHeight - occupiedTop) + 12;
      document.documentElement.style.setProperty('--mobile-nav-clearance', `${Math.ceil(clearance)}px`);
    };

    const updateViewportInset = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const visualBottom = visualViewport
          ? visualViewport.offsetTop + visualViewport.height
          : window.innerHeight;
        const bottomInset = Math.max(0, window.innerHeight - visualBottom);
        navRef.current?.style.setProperty('--mobile-nav-viewport-inset', `${bottomInset}px`);
        updateNavClearance();
      });
    };

    const resizeObserver = new ResizeObserver(updateNavClearance);
    if (navRef.current) {
      resizeObserver.observe(navRef.current);
      if (navRef.current.firstElementChild) resizeObserver.observe(navRef.current.firstElementChild);
    }

    updateViewportInset();
    updateNavClearance();
    window.addEventListener('resize', updateViewportInset);
    window.addEventListener('orientationchange', updateViewportInset);
    window.addEventListener('pageshow', updateViewportInset);
    document.addEventListener('visibilitychange', updateViewportInset);
    visualViewport?.addEventListener('resize', updateViewportInset);
    visualViewport?.addEventListener('scroll', updateViewportInset);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      document.documentElement.style.removeProperty('--mobile-nav-clearance');
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
      className={`mobile-bottom-nav fixed left-0 right-auto z-40 w-screen ${className}`}
      style={{
        bottom: 'var(--mobile-nav-viewport-inset, 0px)',
        paddingBottom: 'var(--safe-bottom)',
      }}
      aria-label={ariaLabel}
    >
      <span className="mobile-bottom-nav__safe-area" aria-hidden="true" />
      {children}
    </nav>,
    document.body,
  );
}
