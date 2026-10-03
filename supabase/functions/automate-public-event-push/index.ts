import { createClient } from 'supabase';
import { serve } from 'server';

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DUE_WINDOW_MS = 15 * MINUTE_MS;
const POST_EVENT_WINDOW_MS = DAY_MS;

type EntityKind = 'event' | 'open-mic';
type PublicItem = {
  id: string;
  title: string;
  slug: string;
  date: string;
  time: string;
  status: string;
  published: boolean;
  registration_status?: string;
};
type NotificationCycle = {
  id: string;
  entity_type: EntityKind;
  entity_id: string;
  published_at: string;
};
type ScheduledNotification = {
  stage: string;
  scheduledAt: number;
  title: string;
  body: string;
  url: string;
  audience: 'public' | 'event_admin' | 'qr_admin';
};
type SubscriptionRow = { id: string; user_id: string | null; app_identity: 'public' | 'admin' | 'member' };

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function localDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: 'year' | 'month' | 'day') => parts.find((entry) => entry.type === type)?.value ?? '';
  return { year: Number(part('year')), month: Number(part('month')), day: Number(part('day')) };
}

function jakartaDateString(value: Date) {
  const { year, month, day } = localDateParts(value);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function jakartaDateTime(date: string, hour: number, minute: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Tanggal acara tidak valid: ${date}`);
  const [, year, month, day] = match.map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) - JAKARTA_OFFSET_MS;
}

function eventStartTime(item: PublicItem) {
  const match = /(\d{1,2})[.:](\d{2})\s*(AM|PM)?/i.exec(item.time);
  if (!match) throw new Error(`Jam acara tidak valid: ${item.time}`);
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (minute > 59 || hour > 24 || (meridiem && (hour < 1 || hour > 12))) {
    throw new Error(`Jam acara tidak valid: ${item.time}`);
  }
  if (meridiem === 'AM') hour = hour % 12;
  if (meridiem === 'PM') hour = (hour % 12) + 12;
  return jakartaDateTime(item.date, hour, minute);
}

function dateDayDifference(laterDate: string, earlierDate: string) {
  const later = localDateParts(new Date(jakartaDateTime(laterDate, 12, 0)));
  const earlier = localDateParts(new Date(jakartaDateTime(earlierDate, 12, 0)));
  const laterUtc = Date.UTC(later.year, later.month - 1, later.day);
  const earlierUtc = Date.UTC(earlier.year, earlier.month - 1, earlier.day);
  return Math.round((laterUtc - earlierUtc) / DAY_MS);
}

function countdownMessage(kind: EntityKind, days: number, title: string): { title: string; body: string } {
  if (kind === 'event') {
    if (days === 0) return {
      title: '🔥 Hari Ini!',
      body: `${title} berlangsung hari ini. Pastikan tiketmu sudah siap dan sampai tepat waktu!`,
    };
    if (days === 1) return {
      title: `🎟️ H-1 Menuju ${title}!`,
      body: 'Besok waktunya! Kalau belum punya tiket, yuk amankan tiketmu sekarang!',
    };
    if (days === 3) return {
      title: `🎟️ H-3 Menuju ${title}!`,
      body: 'Waktunya semakin dekat. Kalau belum punya tiket, yuk amankan tiketmu sekarang!',
    };
    return {
      title: `🎟️ H-${days} Menuju ${title}!`,
      body: 'Waktunya semakin dekat. Kalau belum punya tiket, yuk amankan tiketmu sekarang!',
    };
  }
  if (days === 0) return {
    title: '🎤 Hari Ini Open Mic!',
    body: `${title} berlangsung hari ini. Sudah daftar untuk tampil? Sampai ketemu di Open Mic!`,
  };
  if (days === 1) return {
    title: '🎤 Besok Open Mic!',
    body: `${title} berlangsung besok. Kalau mau tampil, pastikan sudah daftar ya!`,
  };
  if (days === 3) return {
    title: `🔥 H-3 ${title}!`,
    body: 'Masih mau tampil di Open Mic ini? Yuk segera daftar sebelum pendaftarannya ditutup!',
  };
  return {
    title: '🎤 Jangan Lewatkan!',
    body: `${title} akan segera digelar. Kalau mau tampil, yuk daftar sekarang!`,
  };
}

function buildNotifications(kind: EntityKind, item: PublicItem, cycle: NotificationCycle, now: number): ScheduledNotification[] {
  const eventStart = eventStartTime(item);
  const eventDateAtNine = jakartaDateTime(item.date, 9, 0);
  const cycleStart = Date.parse(cycle.published_at);
  const detailUrl = kind === 'event' ? `/event/${item.slug}` : `/open-mic/${item.slug}`;
  const due: ScheduledNotification[] = [];

  if (kind === 'event') {
    for (let week = 1; ; week += 1) {
      const scheduledAt = cycleStart + week * 7 * DAY_MS;
      if (scheduledAt >= eventStart) break;
      const daysRemaining = dateDayDifference(item.date, jakartaDateString(new Date(scheduledAt)));
      if (daysRemaining > 35 && now >= scheduledAt && now < scheduledAt + DUE_WINDOW_MS) {
        due.push({
          stage: `awareness-week-${week}`,
          scheduledAt,
          title: '👀 Jangan Lewatkan!',
          body: `${item.title} akan hadir di Standupindo Cilegon. Yuk lihat detail eventnya dan simpan informasinya!`,
          url: detailUrl,
          audience: 'public',
        });
      }
    }

    for (const days of [35, 28, 21, 14, 7, 3, 1, 0]) {
      const scheduledAt = jakartaDateTime(item.date, 9, 0) - days * DAY_MS;
      if (scheduledAt >= eventStart || now < scheduledAt || now >= scheduledAt + DUE_WINDOW_MS) continue;
      const message = countdownMessage(kind, days, item.title);
      due.push({ stage: `countdown-h-${days}`, scheduledAt, ...message, url: detailUrl, audience: 'public' });
    }
    const adminOneDayBefore = jakartaDateTime(item.date, 9, 0) - DAY_MS;
    if (now >= adminOneDayBefore && now < adminOneDayBefore + DUE_WINDOW_MS) {
      due.push({
        stage: 'admin-event-h-1',
        scheduledAt: adminOneDayBefore,
        title: `📋 Besok: ${item.title}`,
        body: 'Event berlangsung besok. Pastikan persiapan dan informasi event sudah siap.',
        url: '/admin/events',
        audience: 'event_admin',
      });
      due.push({
        stage: 'admin-qr-h-1',
        scheduledAt: adminOneDayBefore,
        title: `📲 Persiapan Check-in: ${item.title}`,
        body: 'Event berlangsung besok. Pastikan QR scanner dan proses check-in sudah siap.',
        url: '/admin/scan',
        audience: 'qr_admin',
      });
    }
    const threeHoursBefore = eventStart - 3 * 60 * MINUTE_MS;
    if (now >= threeHoursBefore && now < threeHoursBefore + DUE_WINDOW_MS) {
      due.push({
        stage: 'countdown-h-3-hours',
        scheduledAt: threeHoursBefore,
        title: '⏰ 3 Jam Lagi!',
        body: `${item.title} segera dimulai. Sampai ketemu dan jangan lupa bawa tiketmu!`,
        url: detailUrl,
        audience: 'public',
      });
      due.push({
        stage: 'admin-qr-h-3-hours',
        scheduledAt: threeHoursBefore,
        title: `⏰ ${item.title} Dimulai 3 Jam Lagi`,
        body: 'QR scanner dan tim check-in bersiap untuk menyambut peserta.',
        url: '/admin/scan',
        audience: 'qr_admin',
      });
    }
    const twoHoursAfter = eventStart + 2 * 60 * MINUTE_MS;
    if (now >= twoHoursAfter && now < twoHoursAfter + POST_EVENT_WINDOW_MS) {
      due.push({
        stage: 'thanks-h-plus-2',
        scheduledAt: twoHoursAfter,
        title: '❤️ Terima Kasih Sudah Hadir!',
        body: `${item.title} sudah selesai. Terima kasih sudah menjadi bagian dari keseruannya! Yuk lihat kembali event dan dokumentasinya. 📸`,
        url: detailUrl,
        audience: 'public',
      });
      due.push({
        stage: 'admin-event-h-plus-2',
        scheduledAt: twoHoursAfter,
        title: `✅ ${item.title} Selesai`,
        body: 'Event telah selesai. Silakan lengkapi dokumentasi dan informasi hasil event.',
        url: '/admin/events',
        audience: 'event_admin',
      });
    }
    return due;
  }

  const daysAtPublish = dateDayDifference(item.date, jakartaDateString(new Date(cycleStart)));
  const openMicStages = [
    { days: 7, minimumDaysAtPublish: 7 },
    { days: 3, minimumDaysAtPublish: 5 },
    { days: 1, minimumDaysAtPublish: 3 },
    { days: 0, minimumDaysAtPublish: 1 },
  ];
  if (item.registration_status === 'open' && now < eventStart) {
    for (const { days, minimumDaysAtPublish } of openMicStages) {
      if (daysAtPublish < minimumDaysAtPublish) continue;
      const scheduledAt = eventDateAtNine - days * DAY_MS;
      if (scheduledAt <= cycleStart || scheduledAt >= eventStart || now < scheduledAt || now >= scheduledAt + DUE_WINDOW_MS) continue;
      const message = countdownMessage(kind, days, item.title);
      due.push({ stage: `countdown-h-${days}`, scheduledAt, ...message, url: detailUrl, audience: 'public' });
    }
  }
  const threeHoursBefore = eventStart - 3 * 60 * MINUTE_MS;
  if (item.registration_status === 'open' && threeHoursBefore > cycleStart && now >= threeHoursBefore && now < threeHoursBefore + DUE_WINDOW_MS) {
    due.push({
      stage: 'countdown-h-3-hours',
      scheduledAt: threeHoursBefore,
      title: '⏰ 3 Jam Lagi!',
      body: `${item.title} segera dimulai. Sampai ketemu di Open Mic! 🎤`,
      url: detailUrl,
      audience: 'public',
    });
  }
  const oneDayAfter = eventStart + DAY_MS;
  if (now >= oneDayAfter) {
    due.push({
      stage: 'lineup-h-plus-1',
      scheduledAt: oneDayAfter,
      title: '🎤 Siapa Saja yang Tampil Kemarin?',
      body: `${item.title} sudah selesai! Yuk lihat lineup komika yang tampil kemarin. 👀`,
      url: `${detailUrl}#lineup`,
      audience: 'public',
    });
  }
  return due;
}

async function hasPublishedLineup(adminClient: ReturnType<typeof createClient>, openMicId: string) {
  const { data, error } = await adminClient.from('open_mic_registrations')
    .select('id')
    .eq('open_mic_id', openMicId)
    .eq('status', 'confirmed')
    .eq('attendance_status', 'attended')
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

function hasRole(user: { app_metadata?: Record<string, unknown> }, roles: string[]) {
  const metadata = user.app_metadata ?? {};
  const values = [metadata.role, metadata.roles, metadata.user_roles].flatMap((value) => Array.isArray(value) ? value : [value]);
  return values.some((value) => typeof value === 'string' && roles.includes(value.trim().toLowerCase()));
}

async function loadSubscriptionsForAudience(
  adminClient: ReturnType<typeof createClient>,
  audience: ScheduledNotification['audience'],
): Promise<SubscriptionRow[]> {
  if (audience === 'public') {
    const { data, error } = await adminClient.from('push_subscriptions').select('id, user_id, app_identity').eq('app_identity', 'public');
    if (error) throw error;
    return (data ?? []) as SubscriptionRow[];
  }

  const roles = audience === 'event_admin' ? ['admin', 'event_admin'] : ['admin', 'admin_qr'];
  const userIds: string[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data.users ?? [];
    users.forEach((user) => {
      if (hasRole(user, roles)) userIds.push(user.id);
    });
    if (users.length < 1000) break;
  }
  if (userIds.length === 0) return [];
  const { data, error } = await adminClient.from('push_subscriptions')
    .select('id, user_id, app_identity')
    .eq('app_identity', 'admin')
    .in('user_id', [...new Set(userIds)]);
  if (error) throw error;
  return (data ?? []) as SubscriptionRow[];
}

async function dispatchPendingEvaluatorAssignments(
  adminClient: ReturnType<typeof createClient>,
  supabaseUrl: string,
  webhookSecret: string,
) {
  const { data: assignments, error: assignmentError } = await adminClient.from('evaluator_assignments')
    .select('id, open_mic_id, evaluator_user_id')
    .eq('status', 'active')
    .not('notification_pending_at', 'is', null);
  if (assignmentError) throw assignmentError;

  let sent = 0;
  let duplicates = 0;
  for (const assignment of assignments ?? []) {
    const { data: subscriptions, error: subscriptionError } = await adminClient.from('push_subscriptions')
      .select('id')
      .eq('user_id', assignment.evaluator_user_id)
      .eq('app_identity', 'member');
    if (subscriptionError) throw subscriptionError;
    if (!subscriptions?.length) continue;

    let assignmentSent = true;
    for (const subscription of subscriptions) {
      const { data: previous, error: previousError } = await adminClient.from('push_evaluator_assignment_deliveries')
        .select('id, status, created_at')
        .eq('assignment_id', assignment.id)
        .eq('target_subscription_id', subscription.id)
        .maybeSingle();
      if (previousError) throw previousError;
      let deliveryId: string | null = null;
      if (previous?.status === 'sent') {
        duplicates += 1;
        continue;
      } else if (previous?.status === 'sending') {
        if (Date.parse(previous.created_at) > Date.now() - 5 * MINUTE_MS) {
          duplicates += 1;
          assignmentSent = false;
          continue;
        }
        const { data: stale, error: staleError } = await adminClient.from('push_evaluator_assignment_deliveries')
          .update({ created_at: new Date().toISOString(), error_message: null, completed_at: null })
          .eq('id', previous.id)
          .eq('status', 'sending')
          .lt('created_at', new Date(Date.now() - 5 * MINUTE_MS).toISOString())
          .select('id')
          .maybeSingle();
        if (staleError) throw staleError;
        deliveryId = stale?.id ?? null;
        if (!deliveryId) {
          duplicates += 1;
          assignmentSent = false;
          continue;
        }
      } else if (previous?.status === 'failed') {
        const { data: retry, error: retryError } = await adminClient.from('push_evaluator_assignment_deliveries')
          .update({ status: 'sending', error_message: null, completed_at: null })
          .eq('id', previous.id)
          .eq('status', 'failed')
          .select('id')
          .maybeSingle();
        if (retryError) throw retryError;
        deliveryId = retry?.id ?? null;
        if (!deliveryId) {
          duplicates += 1;
          continue;
        }
      } else if (!previous) {
        const { data: claim, error: claimError } = await adminClient.from('push_evaluator_assignment_deliveries')
          .insert({ assignment_id: assignment.id, target_subscription_id: subscription.id, status: 'sending' })
          .select('id')
          .maybeSingle();
        if (claimError?.code === '23505') {
          duplicates += 1;
          assignmentSent = false;
          continue;
        }
        if (claimError) throw claimError;
        deliveryId = claim?.id ?? null;
        if (!deliveryId) throw new Error('Delivery tugas evaluator tidak berhasil diklaim.');
      }

      try {
        const notificationId = `evaluator-assignment:${assignment.id}:${subscription.id}`;
        const result = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/send-web-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-push-webhook-secret': webhookSecret },
          body: JSON.stringify({
            action: 'scheduled_announcement',
            target_subscription_id: subscription.id,
            target_app_identity: 'member',
            notification_id: notificationId,
            type: 'evaluator-assignment',
            title: '📝 Evaluasi Open Mic Tersedia',
            body: 'Tugas evaluasi Open Mic baru tersedia untuk kamu.',
            url: `/evaluator/${assignment.open_mic_id}`,
            tag: notificationId,
          }),
        });
        const payload = await result.json().catch(() => null) as { sent?: number; error?: string } | null;
        if (!result.ok) throw new Error(payload?.error ?? `Push sender merespons ${result.status}.`);
        const { error: updateError } = await adminClient.from('push_evaluator_assignment_deliveries')
          .update({ status: 'sent', completed_at: new Date().toISOString() })
          .eq('id', deliveryId);
        if (updateError) throw updateError;
        sent += payload?.sent ?? 0;
      } catch (error) {
        assignmentSent = false;
        const message = error instanceof Error ? error.message : 'Push evaluator gagal dikirim.';
        const { error: updateError } = await adminClient.from('push_evaluator_assignment_deliveries')
          .update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() })
          .eq('id', deliveryId);
        if (updateError) console.error('failed to record evaluator push failure', updateError);
        throw error;
      }
    }
    if (assignmentSent) {
      const { error: clearError } = await adminClient.from('evaluator_assignments')
        .update({ notification_pending_at: null })
        .eq('id', assignment.id)
        .eq('status', 'active');
      if (clearError) throw clearError;
    }
  }
  return { sent, duplicates };
}

async function dispatchScheduledNotification(
  adminClient: ReturnType<typeof createClient>,
  item: PublicItem,
  cycle: NotificationCycle,
  kind: EntityKind,
  notification: ScheduledNotification,
  supabaseUrl: string,
  webhookSecret: string,
) {
  const notificationId = `${kind}:${item.id}:${cycle.id}:${notification.stage}`;
  const subscriptions = await loadSubscriptionsForAudience(adminClient, notification.audience);
  if (notification.audience === 'public') {
    const { data: legacyDelivery, error: legacyDeliveryError } = await adminClient.from('push_notification_automation_deliveries')
      .select('id')
      .eq('cycle_id', cycle.id)
      .eq('stage_key', notification.stage)
      .eq('target_key', 'public')
      .eq('status', 'sent')
      .maybeSingle();
    if (legacyDeliveryError) throw legacyDeliveryError;
    if (legacyDelivery) return { duplicates: 1, sent: 0 };
  }
  let sent = 0;
  let duplicates = 0;
  for (const subscription of subscriptions) {
    const targetKey = `${notification.audience}:${subscription.id}`;
    const { data: claim, error: claimError } = await adminClient.from('push_notification_automation_deliveries').insert({
      cycle_id: cycle.id,
      stage_key: notification.stage,
      target_key: targetKey,
      notification_id: `${notificationId}:${subscription.id}`,
      scheduled_at: new Date(notification.scheduledAt).toISOString(),
      status: 'sending',
    }).select('id').maybeSingle();
    let deliveryId = claim?.id ?? null;
    if (claimError?.code === '23505') {
      const { data: previous, error: previousError } = await adminClient.from('push_notification_automation_deliveries')
        .select('id, status, created_at')
        .eq('cycle_id', cycle.id)
        .eq('stage_key', notification.stage)
        .eq('target_key', targetKey)
        .maybeSingle();
      if (previousError) throw previousError;
      if (!previous || previous.status === 'sent'
        || (previous.status === 'sending' && Date.parse(previous.created_at) > Date.now() - 5 * MINUTE_MS)) {
        duplicates += 1;
        continue;
      }
      const { data: retry, error: retryError } = await adminClient.from('push_notification_automation_deliveries')
        .update({
          status: 'sending',
          error_message: null,
          completed_at: null,
          created_at: new Date().toISOString(),
        })
        .eq('id', previous.id)
        .eq('status', previous.status)
        .lt('created_at', new Date(Date.now() - (previous.status === 'failed' ? 0 : 5 * MINUTE_MS)).toISOString())
        .select('id')
        .maybeSingle();
      if (retryError) throw retryError;
      deliveryId = retry?.id ?? null;
      if (!deliveryId) {
        duplicates += 1;
        continue;
      }
    } else if (claimError) {
      throw claimError;
    }
    if (!deliveryId) throw new Error('Delivery reminder tidak berhasil diklaim.');

    try {
      const result = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/send-web-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-push-webhook-secret': webhookSecret },
        body: JSON.stringify({
          action: 'scheduled_announcement',
          target_subscription_id: subscription.id,
          target_app_identity: subscription.app_identity,
          notification_id: `${notificationId}:${subscription.id}`,
          type: `${kind}-reminder`,
          title: notification.title,
          body: notification.body,
          url: notification.url,
          tag: `${notificationId}:${subscription.id}`,
        }),
      });
      const payload = await result.json().catch(() => null) as { sent?: number; error?: string } | null;
      if (!result.ok) throw new Error(payload?.error ?? `Push sender merespons ${result.status}.`);
      const { error: updateError } = await adminClient.from('push_notification_automation_deliveries')
        .update({ status: 'sent', sent_count: payload?.sent ?? 0, completed_at: new Date().toISOString() })
        .eq('id', deliveryId);
      if (updateError) throw updateError;
      sent += payload?.sent ?? 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Push gagal dikirim.';
      const { error: updateError } = await adminClient.from('push_notification_automation_deliveries')
        .update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() })
        .eq('id', deliveryId);
      if (updateError) console.error('failed to record scheduled push failure', updateError);
      throw error;
    }
  }
  return { duplicates, sent };
}

serve(async (request) => {
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) return response({ error: 'Konfigurasi server belum lengkap.' }, 500);
  if (request.headers.get('Authorization') !== `Bearer ${serviceRoleKey}`) return response({ error: 'Unauthorized.' }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const now = Date.now();
  const { data: cycles, error: cycleError } = await adminClient.from('push_notification_automation_cycles')
    .select('id, entity_type, entity_id, published_at')
    .eq('is_active', true);
  if (cycleError) {
    console.error('failed to load public push cycles', cycleError);
    return response({ error: 'Siklus notifikasi tidak dapat dimuat.' }, 500);
  }

  const itemsByKind = new Map<EntityKind, Map<string, PublicItem>>([
    ['event', new Map()],
    ['open-mic', new Map()],
  ]);
  const [eventsResult, openMicsResult] = await Promise.all([
    adminClient.from('events').select('id, title, slug, date, time, status, published').eq('published', true),
    adminClient.from('open_mics').select('id, title, slug, date, time, status, published, registration_status').eq('published', true),
  ]);
  if (eventsResult.error || openMicsResult.error) {
    console.error('failed to load published public events', eventsResult.error ?? openMicsResult.error);
    return response({ error: 'Daftar Event/Open Mic tidak dapat dimuat.' }, 500);
  }
  for (const item of (eventsResult.data ?? []) as PublicItem[]) itemsByKind.get('event')!.set(item.id, item);
  for (const item of (openMicsResult.data ?? []) as PublicItem[]) itemsByKind.get('open-mic')!.set(item.id, item);

  let attempted = 0;
  let sent = 0;
  let duplicates = 0;
  const failures: string[] = [];
  for (const cycle of (cycles ?? []) as NotificationCycle[]) {
    const item = itemsByKind.get(cycle.entity_type)?.get(cycle.entity_id);
    if (!item || item.status === 'cancelled') continue;
    try {
      const notifications = buildNotifications(cycle.entity_type, item, cycle, now);
      for (const notification of notifications) {
        if (cycle.entity_type === 'open-mic' && notification.stage === 'lineup-h-plus-1'
          && !await hasPublishedLineup(adminClient, item.id)) continue;
        attempted += 1;
        const result = await dispatchScheduledNotification(adminClient, item, cycle, cycle.entity_type, notification, supabaseUrl, webhookSecret);
        duplicates += result.duplicates;
        sent += result.sent;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kesalahan tidak diketahui.';
      console.error('scheduled public push failed', { kind: cycle.entity_type, entityId: item.id, message });
      failures.push(`${cycle.entity_type}:${item.id}: ${message}`);
    }
  }
  try {
    const result = await dispatchPendingEvaluatorAssignments(adminClient, supabaseUrl, webhookSecret);
    sent += result.sent;
    duplicates += result.duplicates;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kesalahan notifikasi evaluator tidak diketahui.';
    console.error('scheduled evaluator assignment push failed', message);
    failures.push(`evaluator-assignments: ${message}`);
  }
  return response({ success: failures.length === 0, attempted, sent, duplicates, failures }, failures.length ? 500 : 200);
});
