import { Home, Mic, CalendarDays, Drama, Menu } from 'lucide-react';
import type { Router } from '@/lib/router';
import { AnimatedBottomNav } from '@/components/nav/AnimatedBottomNav';

const ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/open-mic', label: 'Open Mic', icon: Mic },
  { to: '/event', label: 'Event', icon: CalendarDays },
  { to: '/komika', label: 'Komika', icon: Drama },
  { to: '/more', label: 'More', icon: Menu },
];

export function MobileBottomNav({ router }: { router: Router }) {
  const isActive = (to: string) => {
    if (to === '/') return router.path === '/';
    if (to === '/more' && ['/syarat-ketentuan', '/kebijakan-privasi'].includes(router.path)) return true;
    return router.path === to || router.path.startsWith(`${to}/`);
  };

  return (
    <AnimatedBottomNav
      ariaLabel="Navigasi utama"
      items={ITEMS.map((item) => ({
        id: item.to,
        label: item.label,
        icon: item.icon,
        active: isActive(item.to),
        onSelect: () => router.navigate(item.to),
      }))}
    />
  );
}
