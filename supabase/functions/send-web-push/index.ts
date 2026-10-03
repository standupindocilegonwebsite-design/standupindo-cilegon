import webpush from 'web-push';
import { createClient } from 'supabase';
import { serve } from 'server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-push-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type WebhookPayload = {
  type?: string;
  table?: string;
  record?: Record<string, unknown> | null;
  old_record?: Record<string, unknown> | null;
  action?: 'test' | 'vapid_fingerprint' | 'scheduled_announcement';
  app_identity?: 'public' | 'admin' | 'member';
  target_app_identity?: 'public' | 'admin' | 'member';
  target_user_id?: string;
  target_subscription_id?: string;
  notification_id?: string;
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
};

type SubscriptionRow = {
  id: string;
  user_id: string | null;
  app_identity: 'public' | 'admin' | 'member';
  endpoint: string;
  p256dh: string;
  auth: string;
};

type PushPayload = {
  notification_id: string;
  type: string;
  title: string;
  body: string;
  url: string;
  tag: string;
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256Fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hasRole(user: { app_metadata?: Record<string, unknown> }, roles: string[]): boolean {
  const metadata = user.app_metadata ?? {};
  const values = [metadata.role, metadata.roles, metadata.user_roles].flatMap((value) => Array.isArray(value) ? value : [value]);
  return values.some((value) => typeof value === 'string' && roles.includes(value.trim().toLowerCase()));
}

function isStatusTransition(record: Record<string, unknown>, oldRecord: Record<string, unknown> | null, statuses: string[]): boolean {
  const nextStatus = String(record.status ?? '');
  const previousStatus = String(oldRecord?.status ?? '');
  return statuses.includes(nextStatus) && (oldRecord === null || previousStatus !== nextStatus);
}

function isPubliclyActive(record: Record<string, unknown> | null): boolean {
  if (!record || record.published !== true || record.status !== 'upcoming') return false;
  const date = String(record.date ?? '');
  return Boolean(date) && date >= new Date().toISOString().slice(0, 10);
}

function formatDate(value: unknown): string {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(date);
}

function locationLabel(record: Record<string, unknown>): string {
  const venue = String(record.venue ?? '').trim();
  const location = String(record.location ?? '').trim();
  return location && location !== venue ? `${venue}, ${location}` : venue;
}

async function listUsersByRoles(adminClient: ReturnType<typeof createClient>, roles: string[]): Promise<string[]> {
  const result: string[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data.users ?? [];
    users.forEach((user) => {
      if (hasRole(user, roles)) result.push(user.id);
    });
    if (users.length < 1000) break;
  }
  return [...new Set(result)];
}

async function getKomikaUserId(adminClient: ReturnType<typeof createClient>, komikaId: unknown): Promise<string | null> {
  if (typeof komikaId !== 'string' || !komikaId) return null;
  const { data, error } = await adminClient.from('komika').select('user_id').eq('id', komikaId).maybeSingle();
  if (error) throw error;
  return typeof data?.user_id === 'string' ? data.user_id : null;
}

async function getOpenMicSlug(adminClient: ReturnType<typeof createClient>, openMicId: unknown): Promise<string | null> {
  if (typeof openMicId !== 'string' || !openMicId) return null;
  const { data, error } = await adminClient.from('open_mics').select('slug').eq('id', openMicId).maybeSingle();
  if (error) throw error;
  return typeof data?.slug === 'string' ? data.slug : null;
}

async function getEventSlug(adminClient: ReturnType<typeof createClient>, eventId: unknown): Promise<string | null> {
  if (typeof eventId !== 'string' || !eventId) return null;
  const { data, error } = await adminClient.from('events').select('slug').eq('id', eventId).maybeSingle();
  if (error) throw error;
  return typeof data?.slug === 'string' ? data.slug : null;
}

async function loadSubscriptions(
  adminClient: ReturnType<typeof createClient>,
  userIds?: string[],
  appIdentity?: SubscriptionRow['app_identity'],
): Promise<SubscriptionRow[]> {
  let query = adminClient.from('push_subscriptions').select('id, user_id, app_identity, endpoint, p256dh, auth');
  if (userIds) {
    if (userIds.length === 0) return [];
    query = query.in('user_id', userIds);
  }
  if (appIdentity) query = query.eq('app_identity', appIdentity);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SubscriptionRow[];
}

async function loadTestSubscription(adminClient: ReturnType<typeof createClient>, userId: string, appIdentity: SubscriptionRow['app_identity']): Promise<SubscriptionRow | null> {
  const { data, error } = await adminClient
    .from('push_subscriptions')
    .select('id, user_id, app_identity, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('app_identity', appIdentity)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as SubscriptionRow | null) ?? null;
}

async function loadTestSubscriptionById(adminClient: ReturnType<typeof createClient>, subscriptionId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await adminClient
    .from('push_subscriptions')
    .select('id, user_id, app_identity, endpoint, p256dh, auth')
    .eq('id', subscriptionId)
    .maybeSingle();
  if (error) throw error;
  return (data as SubscriptionRow | null) ?? null;
}

async function sendToSubscriptions(adminClient: ReturnType<typeof createClient>, subscriptions: SubscriptionRow[], payload: PushPayload): Promise<{ sent: number; removed: number; failed: number }> {
  const results = await Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload), { TTL: 86400 });
      return 'sent' as const;
    } catch (error) {
      const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) {
        await adminClient.from('push_subscriptions').delete().eq('id', subscription.id);
        return 'removed' as const;
      }
      console.error('web push failed', { subscriptionId: subscription.id, statusCode, error });
      return 'failed' as const;
    }
  }));
  return results.reduce((summary, result) => {
    if (result.status === 'fulfilled') summary[result.value] += 1;
    else summary.failed += 1;
    return summary;
  }, { sent: 0, removed: 0, failed: 0 });
}

async function sendForUsers(
  adminClient: ReturnType<typeof createClient>,
  userIds: string[],
  payload: PushPayload,
  appIdentity: SubscriptionRow['app_identity'],
) {
  return sendToSubscriptions(adminClient, await loadSubscriptions(adminClient, userIds, appIdentity), payload);
}

function buildAnnouncement(table: 'open_mics' | 'events', record: Record<string, unknown>): PushPayload {
  const kind = table === 'open_mics' ? 'open-mic' : 'event';
  const title = table === 'open_mics' ? 'Open Mic Terbaru' : 'Event Terbaru';
  const body = table === 'open_mics'
    ? `${String(record.title ?? '')} — ${locationLabel(record)}, ${formatDate(record.date)}. Mau coba? Buruan daftar!`
    : `${String(record.title ?? '')} — ${locationLabel(record)}, ${formatDate(record.date)}. Buruan beli tiket!`;
  const id = String(record.id);
  const slug = String(record.slug ?? '');
  return { notification_id: `${kind}-announcement:${id}`, type: `${kind}-announcement`, title, body, url: table === 'open_mics' ? `/open-mic/${slug}` : `/event/${slug}`, tag: `${kind}-announcement:${id}` };
}

async function dispatchWebhook(adminClient: ReturnType<typeof createClient>, webhook: WebhookPayload) {
  const table = webhook.table ?? '';
  const type = webhook.type ?? '';
  const record = webhook.record ?? null;
  const oldRecord = webhook.old_record ?? null;
  if (!record || type === 'DELETE') return { sent: 0, removed: 0, failed: 0 };

  if (table === 'events' && type === 'INSERT') {
    const adminIds = await listUsersByRoles(adminClient, ['admin', 'event_admin']);
    await sendForUsers(adminClient, adminIds, {
      notification_id: `event-admin-created:${record.id}`,
      type: 'admin-notification',
      title: 'Event Baru Dibuat',
      body: `${String(record.title ?? 'Event')} telah ditambahkan.`,
      url: '/admin/events',
      tag: `event-admin-created:${record.id}`,
    }, 'admin');
  }

  if ((table === 'open_mics' || table === 'events') && (type === 'INSERT' ? isPubliclyActive(record) : !isPubliclyActive(oldRecord) && isPubliclyActive(record))) {
    return sendToSubscriptions(adminClient, await loadSubscriptions(adminClient, undefined, 'public'), buildAnnouncement(table, record));
  }

  if (table === 'open_mic_registrations') {
    if (type === 'INSERT' && record.status === 'pending') {
      const userIds = await listUsersByRoles(adminClient, ['admin', 'open_mic_admin']);
      return sendForUsers(adminClient, userIds, { notification_id: `open-mic-registration:${record.id}:pending`, type: 'admin-notification', title: 'Pendaftar Open Mic Baru', body: 'Ada pendaftar baru untuk Open Mic.', url: '/admin/open-mic-list', tag: `open-mic-registration:${record.id}:pending` }, 'admin');
    }
    if (type === 'UPDATE' && isStatusTransition(record, oldRecord, ['confirmed', 'rejected', 'cancelled'])) {
      const userId = await getKomikaUserId(adminClient, record.komika_id);
      if (!userId) return { sent: 0, removed: 0, failed: 0 };
      const status = String(record.status);
      const label = status === 'confirmed' ? 'Dikonfirmasi' : status === 'rejected' ? 'Ditolak' : 'Dibatalkan';
      const slug = await getOpenMicSlug(adminClient, record.open_mic_id);
      return sendForUsers(adminClient, [userId], { notification_id: `registration:${record.id}:${status}`, type: 'member-notification', title: `Pendaftaran Open Mic ${label}`, body: `Pendaftaran Open Mic kamu telah ${label.toLowerCase()}.`, url: slug ? `/member/open-mic/${slug}` : '/member/open-mic', tag: `registration:${record.id}:${status}` }, 'member');
    }
  }

  if (table === 'event_participants') {
    if (type === 'INSERT' && record.status === 'pending') {
      const userIds = await listUsersByRoles(adminClient, ['admin', 'event_admin']);
      return sendForUsers(adminClient, userIds, { notification_id: `event-participant:${record.id}:pending`, type: 'admin-notification', title: 'Pendaftar Event Baru', body: 'Ada pendaftar baru untuk Event.', url: `/admin/event-pendaftar/${String(record.event_id ?? '')}`, tag: `event-participant:${record.id}:pending` }, 'admin');
    }
    if (type === 'UPDATE' && isStatusTransition(record, oldRecord, ['approved', 'rejected'])) {
      const userId = await getKomikaUserId(adminClient, record.komika_id);
      if (!userId) return { sent: 0, removed: 0, failed: 0 };
      const status = String(record.status);
      const label = status === 'approved' ? 'disetujui' : 'ditolak';
      const slug = await getEventSlug(adminClient, record.event_id);
      return sendForUsers(adminClient, [userId], { notification_id: `event:${record.id}:${status}`, type: 'member-notification', title: `Pendaftaran Event ${status === 'approved' ? 'Disetujui' : 'Ditolak'}`, body: `Pendaftaran Event kamu telah ${label}.`, url: slug ? `/event/${slug}` : '/event', tag: `event:${record.id}:${status}` }, 'member');
    }
  }

  if (table === 'evaluations' && isStatusTransition(record, oldRecord, ['submitted'])) {
    const userId = await getKomikaUserId(adminClient, record.performer_komika_id);
    if (!userId) return { sent: 0, removed: 0, failed: 0 };
    return sendForUsers(adminClient, [userId], { notification_id: `evaluation:${record.id}:submitted`, type: 'member-notification', title: 'Evaluasi Baru Tersedia', body: 'Evaluasi penampilan kamu sudah tersedia.', url: '/member/evaluations', tag: `evaluation:${record.id}:submitted` }, 'member');
  }

  if (table === 'community_applications' && type === 'INSERT' && record.status === 'pending') {
    const userIds = await listUsersByRoles(adminClient, ['admin']);
    return sendForUsers(adminClient, userIds, { notification_id: `application:${record.id}:pending`, type: 'admin-notification', title: 'Pengajuan Komunitas Baru', body: 'Ada pengajuan baru untuk bergabung dengan komunitas.', url: '/admin/applications', tag: `application:${record.id}:pending` }, 'admin');
  }

  const ticketOrderAttentionStatuses = ['Draft Pembayaran', 'Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar'];
  if (table === 'ticket_orders' && ((type === 'INSERT' && ticketOrderAttentionStatuses.includes(String(record.status))) || (type === 'UPDATE' && isStatusTransition(record, oldRecord, ticketOrderAttentionStatuses)))) {
    const newPurchase = type === 'INSERT';
    const userIds = await listUsersByRoles(adminClient, newPurchase ? ['admin', 'admin_ticket'] : ['admin']);
    return sendForUsers(adminClient, userIds, {
      notification_id: `ticket-order:${record.id}:${record.status}`,
      type: 'admin-notification',
      title: newPurchase ? 'Pembelian Tiket Baru' : 'Status Pesanan Tiket Diperbarui',
      body: newPurchase ? 'Ada pembelian tiket baru yang perlu ditinjau.' : 'Status pesanan tiket berubah.',
      url: '/admin/ticket-orders',
      tag: `ticket-order:${record.id}:${record.status}`,
    }, 'admin');
  }

  return { sent: 0, removed: 0, failed: 0 };
}

serve(async (request) => {
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);
  const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!webhookSecret || request.headers.get('x-push-webhook-secret') !== webhookSecret) return response({ error: 'Unauthorized.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) return response({ error: 'Konfigurasi Web Push server belum lengkap.' }, 500);

  let webhook: WebhookPayload;
  try {
    webhook = await request.json();
  } catch {
    return response({ error: 'Payload webhook tidak valid.' }, 400);
  }

  try {
    if (webhook.action === 'vapid_fingerprint') {
      return response({
        diagnostic: 'vapid_fingerprint',
        backend_public_key: vapidPublicKey,
        backend_fingerprint: await sha256Fingerprint(vapidPublicKey),
        backend_length: vapidPublicKey.length,
      });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (webhook.action === 'test') {
      const targetUserId = typeof webhook.target_user_id === 'string' ? webhook.target_user_id.trim() : '';
      const targetSubscriptionId = typeof webhook.target_subscription_id === 'string' ? webhook.target_subscription_id.trim() : '';
      const appIdentity = webhook.app_identity;
      const title = webhook.title;
      const body = webhook.body;
      const url = webhook.url;
      if ((!targetUserId && !targetSubscriptionId) || (targetUserId && targetSubscriptionId)
        || (appIdentity !== 'public' && appIdentity !== 'admin' && appIdentity !== 'member')
        || title !== 'Test Web Push'
        || body !== 'Notifikasi Web Push Standupindo Cilegon berhasil diterima.'
        || !['/', '/admin', '/member'].includes(String(url))) {
        return response({ error: 'Payload test Web Push tidak valid.' }, 400);
      }

      const subscription = targetUserId
        ? await loadTestSubscription(adminClient, targetUserId, appIdentity)
        : await loadTestSubscriptionById(adminClient, targetSubscriptionId);
      if (!subscription) return response({ error: 'Subscription authenticated target tidak ditemukan.' }, 404);
      if (subscription.app_identity !== appIdentity) return response({ error: 'Subscription tidak sesuai dengan aplikasi target.' }, 403);
      const summary = await sendToSubscriptions(adminClient, [subscription], {
        notification_id: `manual-test:${subscription.id}`,
        type: 'manual-test',
        title,
        body,
        url,
        tag: `manual-test:${subscription.id}`,
      });
      return response({ success: true, test: true, ...summary });
    }

    if (webhook.action === 'scheduled_announcement') {
      const notificationId = webhook.notification_id?.trim() ?? '';
      const type = webhook.type?.trim() ?? '';
      const title = webhook.title?.trim() ?? '';
      const body = webhook.body?.trim() ?? '';
      const url = webhook.url?.trim() ?? '';
      const tag = webhook.tag?.trim() ?? '';
      const targetSubscriptionId = webhook.target_subscription_id?.trim() ?? '';
      const targetAppIdentity = webhook.target_app_identity;
      if (!/^(event|open-mic)-reminder$/.test(type) && type !== 'evaluator-assignment'
        || !notificationId
        || !title
        || !body
        || !tag
        || !targetSubscriptionId
        || (targetAppIdentity !== 'public' && targetAppIdentity !== 'admin' && targetAppIdentity !== 'member')
        || (!/^\/(event|open-mic)\//.test(url)
          && !/^\/admin\/(events|scan)$/.test(url)
          && !(type === 'evaluator-assignment' && /^\/evaluator\/[0-9a-f-]+$/i.test(url)))
        || url.startsWith('//')) {
        return response({ error: 'Payload notifikasi terjadwal tidak valid.' }, 400);
      }
      const subscription = await loadTestSubscriptionById(adminClient, targetSubscriptionId);
      if (!subscription) return response({ error: 'Subscription target tidak ditemukan.' }, 404);
      if (subscription.app_identity !== targetAppIdentity
        || (type === 'evaluator-assignment' && targetAppIdentity !== 'member')) {
        return response({ error: 'Subscription tidak sesuai dengan aplikasi target.' }, 403);
      }
      const summary = await sendToSubscriptions(adminClient, [subscription], {
        notification_id: notificationId,
        type,
        title,
        body,
        url,
        tag,
      });
      return response({ success: true, ...summary });
    }

    const summary = await dispatchWebhook(adminClient, webhook);
    return response({ success: true, ...summary });
  } catch (error) {
    console.error('web push dispatch failed', error);
    return response({ error: 'Pengiriman Web Push gagal.' }, 500);
  }
});
