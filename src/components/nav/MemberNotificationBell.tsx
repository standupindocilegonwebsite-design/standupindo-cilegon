import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { MemberNotificationCountsContext, useMemberNotificationCounts } from '@/components/nav/member-notification-counts';
import { NotificationInbox, type NotificationInboxItem } from '@/components/nav/NotificationInbox';

type MemberNotification = NotificationInboxItem & { kind: 'registration' | 'event' | 'evaluation' };
type MemberNotificationSource = 'member-registration' | 'member-event' | 'member-evaluation';
type MemberNotificationRow = {
  id: string;
  source_type: MemberNotificationSource;
  source_id: string;
  title: string;
  description: string;
  target_path: string;
  created_at: string;
  read_at: string | null;
};
type MemberNotificationCandidate = {
  notification_key: string;
  source_type: MemberNotificationSource;
  source_id: string;
  title: string;
  description: string;
  target_path: string;
  kind: MemberNotification['kind'];
  createdAt: string;
};

export function MemberNotificationCountsProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState({ openMic: 0, evaluations: 0 });
  const updateCounts = useCallback((items: Array<{ kind: MemberNotification['kind'] }>) => {
    setCounts({
      openMic: items.filter((item) => item.kind !== 'evaluation').length,
      evaluations: items.filter((item) => item.kind === 'evaluation').length,
    });
  }, []);
  const value = useMemo(() => ({ ...counts, setCounts: updateCounts }), [counts, updateCounts]);

  return <MemberNotificationCountsContext.Provider value={value}>{children}</MemberNotificationCountsContext.Provider>;
}

async function fetchLegacyReadIds(userId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('member_notification_reads').select('notification_key, read_at').eq('user_id', userId);
  if (error) {
    console.error('Failed to load legacy member notification read states', error);
    return new Map();
  }
  return new Map((data ?? []).map((item) => [String(item.notification_key), String(item.read_at)]));
}

export function MemberNotificationBell({ router }: { router: import('@/lib/router').Router }) {
  const { user } = useAuth();
  const { setCounts } = useMemberNotificationCounts();
  const [items, setItems] = useState<MemberNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [channelRevision, setChannelRevision] = useState(0);
  const [legacyStorageFallback, setLegacyStorageFallback] = useState(false);
  const [persistentStorageAvailable, setPersistentStorageAvailable] = useState<boolean | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(undefined);
    try {
      const { data: profile, error: profileError } = await supabase.from('komika').select('id').eq('user_id', user.id).maybeSingle();
      if (profileError) throw profileError;
      if (!profile?.id) {
        setItems([]);
        return;
      }

      const [{ data: registrations, error: registrationError }, { data: evaluations, error: evaluationError }, { data: eventParticipants, error: participantError }, legacyReadIds] = await Promise.all([
        supabase.from('open_mic_registrations').select('id, registration_id, open_mic_id, status, updated_at, open_mics(title, slug)').eq('komika_id', profile.id).in('status', ['confirmed', 'rejected', 'cancelled']).order('updated_at', { ascending: false }),
        supabase.from('evaluations').select('id, open_mic_id, performer_registration_id, status, updated_at, open_mics(title)').eq('performer_komika_id', profile.id).eq('status', 'submitted').order('updated_at', { ascending: false }),
        supabase.from('event_participants').select('id, registration_id, event_id, status, updated_at, events(title, slug)').eq('komika_id', profile.id).in('status', ['approved', 'rejected']).order('updated_at', { ascending: false }),
        fetchLegacyReadIds(user.id),
      ]);
      const sourceErrors = [
        registrationError && ['Open Mic', registrationError],
        evaluationError && ['evaluasi', evaluationError],
        participantError && ['event', participantError],
      ].filter((item): item is [string, NonNullable<typeof registrationError>] => Boolean(item));
      sourceErrors.forEach(([source, error]) => {
        console.error(`Failed to load member ${source} notification source`, error);
      });
      if (sourceErrors.length === 3) {
        throw new Error('Notifikasi pendaftaran Open Mic, event, dan evaluasi tidak dapat dimuat.');
      }

      const candidates: MemberNotificationCandidate[] = [];
      ((registrations ?? []) as Array<{ id: string; registration_id: string; open_mic_id: string; status: string; updated_at: string; open_mics?: { title?: string; slug?: string } | null }>).forEach((row) => {
        const slug = row.open_mics?.slug;
        candidates.push({
          notification_key: `registration:${row.id}:${row.status}`,
          source_type: 'member-registration',
          source_id: row.id,
          title: `Pendaftaran ${row.status === 'confirmed' ? 'dikonfirmasi' : row.status === 'rejected' ? 'ditolak' : 'dibatalkan'}`,
          description: row.open_mics?.title ?? row.registration_id,
          target_path: slug
            ? `/member/open-mic/${encodeURIComponent(slug)}?notificationRegistrationId=${encodeURIComponent(row.id)}`
            : `/member/open-mic?notificationRegistrationId=${encodeURIComponent(row.id)}`,
          kind: 'registration',
          createdAt: row.updated_at,
        });
      });
      ((eventParticipants ?? []) as Array<{ id: string; registration_id: string; event_id: string; status: string; updated_at: string; events?: { title?: string; slug?: string } | null }>).forEach((row) => {
        candidates.push({
          notification_key: `event:${row.id}:${row.status}`,
          source_type: 'member-event',
          source_id: row.id,
          title: `Pendaftaran event ${row.status === 'approved' ? 'disetujui' : 'ditolak'}`,
          description: row.events?.title ?? row.registration_id,
          target_path: row.events?.slug
            ? `/event/${encodeURIComponent(row.events.slug)}?notificationParticipantId=${encodeURIComponent(row.id)}`
            : `/event?notificationParticipantId=${encodeURIComponent(row.id)}`,
          kind: 'event',
          createdAt: row.updated_at,
        });
      });
      ((evaluations ?? []) as Array<{ id: string; open_mic_id: string; status: string; updated_at: string; open_mics?: { title?: string } | null }>).forEach((row) => {
        candidates.push({
          notification_key: `evaluation:${row.id}`,
          source_type: 'member-evaluation',
          source_id: row.id,
          title: 'Evaluasi baru tersedia',
          description: row.open_mics?.title ?? 'Performance kamu',
          target_path: `/member/evaluations?notificationEvaluationId=${encodeURIComponent(row.id)}`,
          kind: 'evaluation',
          createdAt: row.updated_at,
        });
      });

      let useLegacyStorage = false;
      if (candidates.length > 0) {
        const { error: persistError } = await supabase.from('user_notifications').upsert(candidates.map((candidate) => ({
          user_id: user.id,
          notification_key: candidate.notification_key,
          source_type: candidate.source_type,
          source_id: candidate.source_id,
          title: candidate.title,
          description: candidate.description,
          target_path: candidate.target_path,
          read_at: legacyReadIds.has(candidate.notification_key) ? legacyReadIds.get(candidate.notification_key) : null,
        })), { onConflict: 'user_id,notification_key', ignoreDuplicates: true });
        if (persistError) {
          console.error('Failed to persist member notifications; using source data for this session', persistError);
          useLegacyStorage = true;
        }
      }

      const pageSize = 200;
      const inboxRows: MemberNotificationRow[] = [];
      if (!useLegacyStorage) {
        for (let from = 0; ; from += pageSize) {
          const { data, error: inboxError } = await supabase.from('user_notifications')
            .select('id, source_type, source_id, title, description, target_path, created_at, read_at')
            .eq('user_id', user.id)
            .in('source_type', ['member-registration', 'member-event', 'member-evaluation'])
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .range(from, from + pageSize - 1);
          if (inboxError) {
            console.error('Failed to load persisted member notifications; using source data for this session', inboxError);
            useLegacyStorage = true;
            break;
          }
          const page = (data ?? []) as MemberNotificationRow[];
          inboxRows.push(...page);
          if (page.length < pageSize) break;
        }
      }
      setLegacyStorageFallback(useLegacyStorage);
      setPersistentStorageAvailable(!useLegacyStorage);
      const kindBySource: Record<MemberNotificationSource, MemberNotification['kind']> = {
        'member-registration': 'registration',
        'member-event': 'event',
        'member-evaluation': 'evaluation',
      };
      const notifications = useLegacyStorage
        ? candidates.map((candidate) => ({
          id: candidate.notification_key,
          source: candidate.source_type,
          title: candidate.title,
          description: candidate.description,
          targetPath: candidate.target_path,
          createdAt: candidate.createdAt,
          readAt: legacyReadIds.get(candidate.notification_key) ?? null,
          kind: candidate.kind,
        }))
        : inboxRows.map((row) => ({
        id: row.id,
        source: row.source_type,
        title: row.title,
        description: row.description,
        targetPath: row.target_path,
        createdAt: row.created_at,
        readAt: row.read_at,
        kind: kindBySource[row.source_type],
        }));
      setItems(notifications);
    } catch (error) {
      console.error('Failed to load member notifications', error);
      const detail = typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
        ? error.message
        : '';
      setLoadError(detail
        ? `Notifikasi gagal dimuat: ${detail}`
        : 'Notifikasi gagal dimuat. Coba buka panel lagi atau segarkan halaman.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadNotifications();
    if (!user?.id) return undefined;
    let active = true;
    const channel = supabase.channel(`member-notifications-${user.id}`);
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'open_mic_registrations' }, () => void loadNotifications())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_participants' }, () => void loadNotifications())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evaluations' }, () => void loadNotifications());
    if (persistentStorageAvailable) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${user.id}` }, () => void loadNotifications());
    }
    channel.subscribe((status) => {
        if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')) {
          setChannelRevision((revision) => revision + 1);
        }
      });
    const refreshOnResume = () => {
      if (document.visibilityState === 'visible') {
        void loadNotifications();
        setChannelRevision((revision) => revision + 1);
      }
    };
    window.addEventListener('pageshow', refreshOnResume);
    window.addEventListener('focus', refreshOnResume);
    document.addEventListener('visibilitychange', refreshOnResume);
    return () => {
      active = false;
      window.removeEventListener('pageshow', refreshOnResume);
      window.removeEventListener('focus', refreshOnResume);
      document.removeEventListener('visibilitychange', refreshOnResume);
      void supabase.removeChannel(channel);
    };
  }, [channelRevision, loadNotifications, persistentStorageAvailable, user?.id]);

  const unreadItems = useMemo(() => items.filter((item) => !item.readAt), [items]);
  useEffect(() => { setCounts(unreadItems); }, [setCounts, unreadItems]);

  async function markRead(id: string) {
    if (!user?.id) throw new Error('Sesi login tidak tersedia.');
    if (legacyStorageFallback) {
      const { error } = await supabase.from('member_notification_reads').upsert({
        user_id: user.id,
        notification_key: id,
        read_at: new Date().toISOString(),
      }, { onConflict: 'user_id,notification_key' });
      if (error) throw error;
      await loadNotifications();
      return;
    }
    const { error } = await supabase.from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null);
    if (error) throw error;
    await loadNotifications();
  }

  async function markAllRead() {
    if (!user?.id) throw new Error('Sesi login tidak tersedia.');
    if (legacyStorageFallback) {
      const unreadItems = items.filter((item) => !item.readAt);
      if (unreadItems.length === 0) return;
      const { error } = await supabase.from('member_notification_reads').upsert(unreadItems.map((item) => ({
        user_id: user.id,
        notification_key: item.id,
        read_at: new Date().toISOString(),
      })), { onConflict: 'user_id,notification_key' });
      if (error) throw error;
      await loadNotifications();
      return;
    }
    const { error } = await supabase.from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .in('source_type', ['member-registration', 'member-event', 'member-evaluation'])
      .is('read_at', null)
      .is('deleted_at', null);
    if (error) throw error;
    await loadNotifications();
  }

  async function clearAll() {
    if (!user?.id) throw new Error('Sesi login tidak tersedia.');
    const { error } = await supabase.from('user_notifications')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .in('source_type', ['member-registration', 'member-event', 'member-evaluation'])
      .is('deleted_at', null);
    if (error) throw error;
    await loadNotifications();
  }

  async function deleteReadNotification(id: string) {
    if (!user?.id) throw new Error('Sesi login tidak tersedia.');
    const { error } = await supabase.from('user_notifications')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .in('source_type', ['member-registration', 'member-event', 'member-evaluation'])
      .not('read_at', 'is', null)
      .is('deleted_at', null);
    if (error) throw error;
    await loadNotifications();
  }

  async function clearRead() {
    if (!user?.id) throw new Error('Sesi login tidak tersedia.');
    const { error } = await supabase.from('user_notifications')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .in('source_type', ['member-registration', 'member-event', 'member-evaluation'])
      .not('read_at', 'is', null)
      .is('deleted_at', null);
    if (error) throw error;
    await loadNotifications();
  }

  return (
    <NotificationInbox
      items={items}
      unreadCount={unreadItems.length}
      loading={loading}
      error={loadError}
      inverse
      label="Notifikasi member"
      canDelete={persistentStorageAvailable === true && !legacyStorageFallback}
      onMarkRead={markRead}
      onMarkAllRead={markAllRead}
      onClearAll={clearAll}
      onDeleteRead={deleteReadNotification}
      onClearRead={clearRead}
      onRetry={loadNotifications}
      onNavigate={(path) => router.navigate(path)}
    />
  );
}
