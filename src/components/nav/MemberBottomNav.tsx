import { BookOpen, ClipboardList, House, Menu, Mic, UserRound } from 'lucide-react';
import type { Router } from '@/lib/router';
import { AnimatedBottomNav } from '@/components/nav/AnimatedBottomNav';
import { useMemberNotificationCounts } from '@/components/nav/member-notification-counts';

const ITEMS = [
  { to: '/member', label: 'Home', icon: House },
  { to: '/member/open-mic', label: 'Open Mic', icon: Mic },
  { to: '/member/materials', label: 'Buku Materi', icon: BookOpen },
  { to: '/member/profile', label: 'Profile', icon: UserRound },
  { to: '/member/evaluations', label: 'Evaluasi', icon: ClipboardList },
  { to: '/member/more', label: 'More', icon: Menu },
];

export function MemberBottomNav({ router }: { router: Router }) {
  const { openMic: openMicNotifications, evaluations: evaluationNotifications } = useMemberNotificationCounts();
  const morePaths = ['/member/more', '/member/help', '/member/roles', '/member/settings'];
  const isActive = (to: string) => {
    if (to === '/member') return router.path === '/member' || router.path === '/member/komika-recap';
    if (to === '/member/open-mic') {
      return router.path === to
        || router.path.startsWith(`${to}/`)
        || router.path === '/member/open-mic-history';
    }
    if (to === '/member/more') {
      return morePaths.some((path) => router.path === path || router.path.startsWith(`${path}/`))
        || router.path === '/evaluator'
        || router.path.startsWith('/evaluator/');
    }
    return router.path === to || router.path.startsWith(`${to}/`);
  };

  return (
    <AnimatedBottomNav
      ariaLabel="Navigasi member"
      items={ITEMS.map((item) => ({
        id: item.to,
        label: item.label,
        icon: item.icon,
        active: isActive(item.to),
        onSelect: () => router.navigate(item.to),
        badge: item.to === '/member/open-mic'
          ? openMicNotifications
          : item.to === '/member/evaluations' ? evaluationNotifications : undefined,
      }))}
    />
  );
}
