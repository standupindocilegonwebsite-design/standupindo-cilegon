import { createContext, useContext } from 'react';

type MemberNotificationCounts = {
  openMic: number;
  evaluations: number;
  setCounts: (items: Array<{ kind: 'registration' | 'event' | 'evaluation' }>) => void;
};

export const MemberNotificationCountsContext = createContext<MemberNotificationCounts | null>(null);

export function useMemberNotificationCounts() {
  const context = useContext(MemberNotificationCountsContext);
  if (!context) throw new Error('useMemberNotificationCounts must be used within MemberNotificationCountsProvider');
  return context;
}
