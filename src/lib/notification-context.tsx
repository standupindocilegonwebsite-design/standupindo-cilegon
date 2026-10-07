import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth-context';
import { NotificationContext, type NotificationRecord, type NotificationSource } from './notification-context';

const TAB_CHANNEL = 'standupindo-admin-notifications';
const SOURCES: NotificationSource[] = ['ticket-orders', 'open-mic', 'event-participants', 'applications'];
const EMPTY_COUNTS: Record<NotificationSource, number> = { 'ticket-orders': 0, 'open-mic': 0, 'event-participants': 0, applications: 0 };
const READ_STORAGE_KEY = 'standupindo-admin-read-notifications';

function readStoredIds(storageKey: string): Record<NotificationSource, string[]> {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '{}') as Record<NotificationSource, string[]>;
  } catch {
    return {} as Record<NotificationSource, string[]>;
  }
}

function isRead(storageKey: string, source: NotificationSource, id: string): boolean {
  return (readStoredIds(storageKey)[source] ?? []).includes(id);
}

function storeReadIds(storageKey: string, readIds: Record<NotificationSource, string[]>) {
  localStorage.setItem(storageKey, JSON.stringify(readIds));
}

function isAttentionStatus(source: NotificationSource, status: unknown): boolean {
  if (source === 'ticket-orders') {
    return status === 'Draft Pembayaran'
      || status === 'Menunggu Pembayaran'
      || status === 'Menunggu Verifikasi'
      || status === 'Sudah Bayar';
  }
  return status === 'pending';
}

function updateAppBadge(count: number) {
  const badgeNavigator = navigator as Navigator & {
    setAppBadge?: (value: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0 && badgeNavigator.setAppBadge) void badgeNavigator.setAppBadge(count).catch(() => undefined);
  if (count === 0 && badgeNavigator.clearAppBadge) void badgeNavigator.clearAppBadge().catch(() => undefined);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin, isOpenMicAdmin, isEventAdmin, isTicketAdmin } = useAuth();
  const activeSources = useMemo<NotificationSource[]>(() => {
    if (isAdmin) return SOURCES;
    return [
      ...(isTicketAdmin ? ['ticket-orders' as const] : []),
      ...(isOpenMicAdmin ? ['open-mic' as const] : []),
      ...(isEventAdmin ? ['event-participants' as const] : []),
    ];
  }, [isAdmin, isEventAdmin, isOpenMicAdmin, isTicketAdmin]);
  const readStorageKey = `${READ_STORAGE_KEY}:${user?.id ?? 'anonymous'}`;
  const [records, setRecords] = useState<Map<string, NotificationRecord>>(new Map());
  const [revision, setRevision] = useState(0);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [channelRevision, setChannelRevision] = useState(0);

  const resync = useCallback(async () => {
    if (activeSources.length === 0) {
      setRecords(new Map());
      return;
    }
    const ticketOrdersRequest = activeSources.includes('ticket-orders')
      ? supabase.from('ticket_orders').select('id, status, full_name, event_id')
        .in('status', ['Draft Pembayaran', 'Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar'])
      : null;
    const otherSources = activeSources.filter((source) => source !== 'ticket-orders');
    const results = await Promise.all(otherSources.map((source) => source === 'open-mic'
      ? supabase.from('open_mic_registrations').select('id, status')
      : source === 'event-participants'
        ? supabase.from('event_participants').select('id, status')
        : supabase.from('community_applications').select('id, status')));
    const ticketOrdersResult = ticketOrdersRequest ? await ticketOrdersRequest : null;
    if (results.some((result) => result.error) || ticketOrdersResult?.error) return;

    const ticketOrders = (ticketOrdersResult?.data ?? []) as {
      id: string;
      status: string;
      full_name: string;
      event_id: string;
    }[];
    const eventIds = [...new Set(ticketOrders.map((order) => order.event_id))];
    const { data: events, error: eventsError } = eventIds.length > 0
      ? await supabase.from('events').select('id, title').in('id', eventIds)
      : { data: [], error: null };
    if (eventsError) return;
    const eventTitles = new Map((events ?? []).map((event) => [event.id, event.title]));

    const next = new Map<string, NotificationRecord>();
    results.forEach((result, index) => {
      const source = otherSources[index];
      (result.data as { id: string; status: string }[]).forEach((row) => {
        if (isAttentionStatus(source, row.status) && !isRead(readStorageKey, source, row.id)) next.set(`${source}:${row.id}`, { ...row, source });
      });
    });
    ticketOrders.forEach((order) => {
      if (isRead(readStorageKey, 'ticket-orders', order.id)) return;
      next.set(`ticket-orders:${order.id}`, {
        id: order.id,
        status: order.status,
        source: 'ticket-orders',
        fullName: order.full_name,
        eventTitle: eventTitles.get(order.event_id),
      });
    });
    setRecords(next);
    setRevision((value) => value + 1);
  }, [activeSources, readStorageKey]);

  useEffect(() => {
    if (activeSources.length === 0) {
      setRecords(new Map());
      setRealtimeConnected(false);
      return;
    }

    const broadcast = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(TAB_CHANNEL) : null;
    const applyRow = (source: NotificationSource, row: { id: string; status: string } | undefined) => {
      if (!row) return;
      const key = `${source}:${row.id}`;
      setRecords((current) => {
        const next = new Map(current);
        if (isAttentionStatus(source, row.status) && !isRead(readStorageKey, source, row.id)) next.set(key, { ...row, source });
        else next.delete(key);
        return next;
      });
      setRevision((value) => value + 1);
    };

    void resync();
    const channel = supabase.channel(`admin-notifications-${activeSources.join('-')}`);
    if (activeSources.includes('ticket-orders')) channel.on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_orders' }, () => {
        void resync();
        broadcast?.postMessage({ type: 'notification-changed' });
      });
    if (activeSources.includes('open-mic')) channel.on('postgres_changes', { event: '*', schema: 'public', table: 'open_mic_registrations' }, (payload) => {
        applyRow('open-mic', (payload.eventType === 'DELETE' ? payload.old : payload.new) as { id: string; status: string });
        broadcast?.postMessage({ type: 'notification-changed' });
      });
    if (activeSources.includes('event-participants')) channel.on('postgres_changes', { event: '*', schema: 'public', table: 'event_participants' }, (payload) => {
        applyRow('event-participants', (payload.eventType === 'DELETE' ? payload.old : payload.new) as { id: string; status: string });
        broadcast?.postMessage({ type: 'notification-changed' });
      });
    if (activeSources.includes('applications')) channel.on('postgres_changes', { event: '*', schema: 'public', table: 'community_applications' }, (payload) => {
        applyRow('applications', (payload.eventType === 'DELETE' ? payload.old : payload.new) as { id: string; status: string });
        broadcast?.postMessage({ type: 'notification-changed' });
      });
    let active = true;
    channel.subscribe((status) => {
      if (!active) return;
      setRealtimeConnected(status === 'SUBSCRIBED');
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setChannelRevision((value) => value + 1);
        void resync();
      }
    });

    const onBroadcast = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === 'notification-changed' || event.data?.type === 'notification-read') void resync();
    };
    const resyncOnResume = () => {
      if (document.visibilityState === 'visible') void resync();
    };
    broadcast?.addEventListener('message', onBroadcast);
    window.addEventListener('pageshow', resyncOnResume);
    window.addEventListener('focus', resyncOnResume);
    document.addEventListener('visibilitychange', resyncOnResume);

    return () => {
      active = false;
      broadcast?.removeEventListener('message', onBroadcast);
      broadcast?.close();
      window.removeEventListener('pageshow', resyncOnResume);
      window.removeEventListener('focus', resyncOnResume);
      document.removeEventListener('visibilitychange', resyncOnResume);
      void supabase.removeChannel(channel);
      setRealtimeConnected(false);
    };
  }, [activeSources, channelRevision, readStorageKey, resync]);

  const markAsRead = useCallback(async (source: NotificationSource, id: string) => {
    const stored = readStoredIds(readStorageKey);
    stored[source] = [...new Set([...(stored[source] ?? []), id])];
    storeReadIds(readStorageKey, stored);
    setRecords((current) => {
      const next = new Map(current);
      next.delete(`${source}:${id}`);
      return next;
    });
    setRevision((value) => value + 1);
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(TAB_CHANNEL);
      channel.postMessage({ type: 'notification-read' });
      channel.close();
    }
  }, [readStorageKey]);

  const markAllAsRead = useCallback(async (source: NotificationSource) => {
    const ids = [...records.values()].filter((record) => record.source === source).map((record) => record.id);
    if (ids.length === 0) return;
    const stored = readStoredIds(readStorageKey);
    stored[source] = [...new Set([...(stored[source] ?? []), ...ids])];
    storeReadIds(readStorageKey, stored);
    setRecords((current) => {
      const next = new Map(current);
      ids.forEach((id) => next.delete(`${source}:${id}`));
      return next;
    });
    setRevision((value) => value + 1);
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(TAB_CHANNEL);
      channel.postMessage({ type: 'notification-read' });
      channel.close();
    }
  }, [readStorageKey, records]);

  const unreadCount = records.size;
  const counts = [...records.values()].reduce<Record<NotificationSource, number>>((result, record) => {
    result[record.source] += 1;
    return result;
  }, { ...EMPTY_COUNTS });
  useEffect(() => { updateAppBadge(unreadCount); }, [unreadCount]);

  const value = useMemo(() => ({ unreadCount, counts, notifications: [...records.values()], revision, realtimeConnected, resync, markAsRead, markAllAsRead }), [unreadCount, counts, records, revision, realtimeConnected, resync, markAsRead, markAllAsRead]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
