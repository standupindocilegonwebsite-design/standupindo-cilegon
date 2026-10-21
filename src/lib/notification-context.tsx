import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth-context';
import { NotificationContext, type NotificationRecord, type NotificationSource } from './notification-context';

const TAB_CHANNEL = 'standupindo-admin-notifications';
const SOURCES: NotificationSource[] = ['ticket-orders', 'open-mic', 'event-participants', 'applications'];
const EMPTY_COUNTS: Record<NotificationSource, number> = { 'ticket-orders': 0, 'open-mic': 0, 'event-participants': 0, applications: 0 };
const READ_STORAGE_KEY = 'standupindo-admin-read-notifications';

type UserNotificationRow = {
  id: string;
  notification_key: string;
  source_type: NotificationSource;
  source_id: string;
  title: string;
  description: string;
  target_path: string;
  created_at: string;
  read_at: string | null;
};

type NotificationCandidate = {
  notification_key: string;
  source_type: NotificationSource;
  source_id: string;
  title: string;
  description: string;
  target_path: string;
};

function readStoredIds(storageKey: string): Record<NotificationSource, string[]> {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '{}') as Record<NotificationSource, string[]>;
  } catch {
    return {} as Record<NotificationSource, string[]>;
  }
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
  const [records, setRecords] = useState<NotificationRecord[]>([]);
  const [revision, setRevision] = useState(0);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [channelRevision, setChannelRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const requestRevision = useRef(0);

  const resync = useCallback(async () => {
    const requestId = ++requestRevision.current;
    if (!user?.id || activeSources.length === 0) {
      setRecords([]);
      return;
    }

    const candidates: NotificationCandidate[] = [];
    const ticketOrdersRequest = activeSources.includes('ticket-orders')
      ? supabase.from('ticket_orders').select('id, status, full_name, event_id')
        .in('status', ['Draft Pembayaran', 'Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar'])
      : null;
    const otherSources = activeSources.filter((source) => source !== 'ticket-orders');
    const results = await Promise.all(otherSources.map((source) => source === 'open-mic'
      ? supabase.from('open_mic_registrations').select('id, status, open_mic_id, full_name, registration_id')
      : source === 'event-participants'
        ? supabase.from('event_participants').select('id, status, event_id, full_name, registration_id')
        : supabase.from('community_applications').select('id, status, full_name')));
    const ticketOrdersResult = ticketOrdersRequest ? await ticketOrdersRequest : null;
    const failedSource = results.find((result) => result.error);
    if (failedSource?.error || ticketOrdersResult?.error) {
      const failure = failedSource?.error ?? ticketOrdersResult?.error;
      console.error('Failed to load admin notification sources', failure);
      setError('Notifikasi gagal dimuat. Coba buka panel lagi atau segarkan halaman.');
      return;
    }

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
    if (eventsError) {
      console.error('Failed to load event names for admin notifications', eventsError);
      setError('Nama event pada notifikasi gagal dimuat.');
      return;
    }
    const eventTitles = new Map((events ?? []).map((event) => [event.id, event.title]));

    results.forEach((result, index) => {
      const source = otherSources[index];
      if (source === 'open-mic') {
        (result.data as { id: string; status: string; open_mic_id: string; full_name: string; registration_id: string }[]).forEach((row) => {
          if (!isAttentionStatus(source, row.status)) return;
          candidates.push({
            notification_key: `${source}:${row.id}`,
            source_type: source,
            source_id: row.id,
            title: 'Pendaftar Open Mic',
            description: `${row.full_name || row.registration_id} · Status: ${row.status}`,
            target_path: `/admin/pendaftar/${encodeURIComponent(row.open_mic_id)}?notificationRegistrationId=${encodeURIComponent(row.id)}`,
          });
        });
      } else if (source === 'event-participants') {
        (result.data as { id: string; status: string; event_id: string; full_name: string; registration_id: string }[]).forEach((row) => {
          if (!isAttentionStatus(source, row.status)) return;
          candidates.push({
            notification_key: `${source}:${row.id}`,
            source_type: source,
            source_id: row.id,
            title: 'Pendaftar Event',
            description: `${row.full_name || row.registration_id} · Status: ${row.status}`,
            target_path: `/admin/event-pendaftar/${encodeURIComponent(row.event_id)}?notificationParticipantId=${encodeURIComponent(row.id)}`,
          });
        });
      } else {
        (result.data as { id: string; status: string; full_name: string }[]).forEach((row) => {
          if (!isAttentionStatus(source, row.status)) return;
          candidates.push({
            notification_key: `${source}:${row.id}`,
            source_type: source,
            source_id: row.id,
            title: 'Gabung Komunitas',
            description: `${row.full_name || 'Pendaftar baru'} · Status: ${row.status}`,
            target_path: `/admin/applications?notificationApplicationId=${encodeURIComponent(row.id)}`,
          });
        });
      }
    });

    ticketOrders.forEach((order) => candidates.push({
      notification_key: `ticket-orders:${order.id}`,
      source_type: 'ticket-orders',
      source_id: order.id,
      title: 'Pembeli Tiket',
      description: `${order.full_name || 'Nama pembeli tidak tersedia'} · Event: ${eventTitles.get(order.event_id) || 'Event tidak tersedia'} · Status: ${order.status}`,
      target_path: `/admin/ticket-orders?notificationOrderId=${encodeURIComponent(order.id)}`,
    }));

    if (candidates.length > 0) {
      const legacyReads = readStoredIds(`${READ_STORAGE_KEY}:${user.id}`);
      const legacyReadSet = new Set(activeSources.flatMap((source) => (legacyReads[source] ?? []).map((id) => `${source}:${id}`)));
      const rowsToInsert = candidates.map((candidate) => ({
        user_id: user.id,
        ...candidate,
        read_at: legacyReadSet.has(`${candidate.source_type}:${candidate.source_id}`) ? new Date().toISOString() : null,
      }));
      const { error: insertError } = await supabase.from('user_notifications').upsert(rowsToInsert, {
        onConflict: 'user_id,notification_key',
        ignoreDuplicates: true,
      });
      if (insertError) {
        console.error('Failed to persist admin notifications', insertError);
        setError('Notifikasi gagal disimpan. Coba segarkan halaman.');
        return;
      }
    }

    const pageSize = 200;
    const inboxRows: UserNotificationRow[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error: inboxError } = await supabase.from('user_notifications')
        .select('id, notification_key, source_type, source_id, title, description, target_path, created_at, read_at')
        .eq('user_id', user.id)
        .in('source_type', activeSources)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (inboxError) {
        console.error('Failed to load persisted admin notifications', inboxError);
        setError('Daftar notifikasi gagal dimuat.');
        return;
      }
      const page = (data ?? []) as UserNotificationRow[];
      inboxRows.push(...page);
      if (page.length < pageSize) break;
    }

    if (requestId !== requestRevision.current) return;
    setRecords(inboxRows.map((row) => ({
      id: row.id,
      notificationKey: row.notification_key,
      source: row.source_type,
      sourceId: row.source_id,
      title: row.title,
      description: row.description,
      targetPath: row.target_path,
      createdAt: row.created_at,
      readAt: row.read_at,
      status: row.description.split('Status: ').slice(-1)[0] ?? '',
    })));
    setError(null);
    setRevision((value) => value + 1);
  }, [activeSources, user?.id]);

  useEffect(() => {
    if (!user?.id || activeSources.length === 0) {
      setRecords([]);
      setRealtimeConnected(false);
      return;
    }

    const broadcast = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(TAB_CHANNEL) : null;
    setRecords([]);
    void resync();
    const channel = supabase.channel(`admin-notifications-${user.id}-${activeSources.join('-')}`);
    if (activeSources.includes('ticket-orders')) channel.on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_orders' }, () => {
      void resync();
      broadcast?.postMessage({ type: 'notification-changed' });
    });
    if (activeSources.includes('open-mic')) channel.on('postgres_changes', { event: '*', schema: 'public', table: 'open_mic_registrations' }, () => {
      void resync();
      broadcast?.postMessage({ type: 'notification-changed' });
    });
    if (activeSources.includes('event-participants')) channel.on('postgres_changes', { event: '*', schema: 'public', table: 'event_participants' }, () => {
      void resync();
      broadcast?.postMessage({ type: 'notification-changed' });
    });
    if (activeSources.includes('applications')) channel.on('postgres_changes', { event: '*', schema: 'public', table: 'community_applications' }, () => {
      void resync();
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
  }, [activeSources, channelRevision, resync, user?.id]);

  const markAsRead = useCallback(async (id: string) => {
    if (!user?.id) throw new Error('Sesi login tidak tersedia.');
    const { error: updateError } = await supabase.from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null);
    if (updateError) throw updateError;
    await resync();
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(TAB_CHANNEL);
      channel.postMessage({ type: 'notification-read' });
      channel.close();
    }
  }, [resync, user?.id]);

  const markAllAsRead = useCallback(async () => {
    if (!user?.id || activeSources.length === 0) return;
    const { error: updateError } = await supabase.from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .in('source_type', activeSources)
      .is('read_at', null)
      .is('deleted_at', null);
    if (updateError) throw updateError;
    await resync();
  }, [activeSources, resync, user?.id]);

  const clearAll = useCallback(async () => {
    if (!user?.id || activeSources.length === 0) return;
    const { error: updateError } = await supabase.from('user_notifications')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .in('source_type', activeSources)
      .is('deleted_at', null);
    if (updateError) throw updateError;
    await resync();
  }, [activeSources, resync, user?.id]);

  const deleteReadNotification = useCallback(async (id: string) => {
    if (!user?.id) throw new Error('Sesi login tidak tersedia.');
    const { error: updateError } = await supabase.from('user_notifications')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .in('source_type', activeSources)
      .not('read_at', 'is', null)
      .is('deleted_at', null);
    if (updateError) throw updateError;
    await resync();
  }, [activeSources, resync, user?.id]);

  const clearRead = useCallback(async () => {
    if (!user?.id || activeSources.length === 0) return;
    const { error: updateError } = await supabase.from('user_notifications')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .in('source_type', activeSources)
      .not('read_at', 'is', null)
      .is('deleted_at', null);
    if (updateError) throw updateError;
    await resync();
  }, [activeSources, resync, user?.id]);

  const unreadCount = records.filter((record) => !record.readAt).length;
  const counts = records.reduce<Record<NotificationSource, number>>((result, record) => {
    if (!record.readAt) result[record.source] += 1;
    return result;
  }, { ...EMPTY_COUNTS });
  useEffect(() => { updateAppBadge(unreadCount); }, [unreadCount]);

  const value = useMemo(() => ({
    unreadCount,
    counts,
    notifications: records,
    revision,
    realtimeConnected,
    error,
    resync,
    markAsRead,
    markAllAsRead,
    clearAll,
    deleteReadNotification,
    clearRead,
  }), [unreadCount, counts, records, revision, realtimeConnected, error, resync, markAsRead, markAllAsRead, clearAll, deleteReadNotification, clearRead]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
