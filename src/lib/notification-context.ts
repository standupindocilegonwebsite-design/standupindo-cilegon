import { createContext, useContext } from 'react';

export type NotificationSource = 'ticket-orders' | 'open-mic' | 'event-participants' | 'applications';

export type NotificationRecord = { id: string; status: string; source: NotificationSource };

export type NotificationContextValue = {
  unreadCount: number;
  counts: Record<NotificationSource, number>;
  notifications: NotificationRecord[];
  revision: number;
  realtimeConnected: boolean;
  resync: () => Promise<void>;
  markAsRead: (source: NotificationSource, id: string) => Promise<void>;
  markAllAsRead: (source: NotificationSource) => Promise<void>;
};

export const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
}
