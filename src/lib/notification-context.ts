import { createContext, useContext } from 'react';

export type NotificationSource = 'ticket-orders' | 'open-mic' | 'event-participants' | 'applications';

export type NotificationRecord = {
  id: string;
  notificationKey: string;
  sourceId: string;
  status: string;
  source: NotificationSource;
  title: string;
  description: string;
  targetPath: string;
  createdAt: string;
  readAt: string | null;
};

export type NotificationContextValue = {
  unreadCount: number;
  counts: Record<NotificationSource, number>;
  notifications: NotificationRecord[];
  revision: number;
  realtimeConnected: boolean;
  error: string | null;
  resync: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  deleteReadNotification: (id: string) => Promise<void>;
  clearRead: () => Promise<void>;
};

export const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
}
