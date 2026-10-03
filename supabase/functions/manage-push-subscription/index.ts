import { createClient } from 'supabase';
import { serve } from 'server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type SubscriptionPayload = {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: { p256dh?: string; auth?: string };
};

type RequestBody = {
  action?: 'public_key' | 'upsert' | 'delete' | 'test';
  app_identity?: 'public' | 'admin' | 'member';
  guest_token?: string | null;
  endpoint?: string;
  subscription?: SubscriptionPayload;
};

type PushAppIdentity = 'public' | 'admin' | 'member';

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getAuthenticatedUserId(supabaseUrl: string, anonKey: string, authorization: string | null): Promise<string | null> {
  if (!authorization) return null;
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (token === anonKey) return null;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Error('Sesi login tidak valid.');
  return data.user.id;
}

function userHasRole(user: { app_metadata?: Record<string, unknown> }, roles: string[]) {
  const metadata = user.app_metadata ?? {};
  const values = [metadata.role, metadata.roles, metadata.user_roles].flatMap((value) => Array.isArray(value) ? value : [value]);
  return values.some((value) => typeof value === 'string' && roles.includes(value.trim().toLowerCase()));
}

async function validateAppIdentityAccess(
  adminClient: ReturnType<typeof createClient>,
  userId: string | null,
  appIdentity: PushAppIdentity,
) {
  if (appIdentity === 'public') return true;
  if (!userId) return false;
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error) throw error;
  if (!data.user) return false;
  return appIdentity === 'admin'
    ? userHasRole(data.user, ['admin', 'open_mic_admin', 'event_admin', 'admin_ticket', 'admin_qr'])
    : userHasRole(data.user, ['admin', 'member', 'evaluator']);
}

function parseExpiration(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function validateEndpoint(endpoint: string | undefined): string {
  if (!endpoint) throw new Error('Endpoint subscription wajib diisi.');
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') throw new Error('Endpoint subscription tidak valid.');
  return endpoint;
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return response({ error: 'Konfigurasi server belum lengkap.' }, 500);

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return response({ error: 'Data permintaan tidak valid.' }, 400);
  }

  const action = body.action;
  if (action !== 'public_key' && action !== 'upsert' && action !== 'delete' && action !== 'test') {
    return response({ error: 'Action subscription tidak valid.' }, 400);
  }

  let userId: string | null = null;
  try {
    userId = await getAuthenticatedUserId(supabaseUrl, anonKey, request.headers.get('Authorization'));
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'Sesi login tidak valid.' }, 401);
  }

  if (action === 'public_key') {
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    if (!publicKey) return response({ error: 'Konfigurasi Web Push server belum lengkap.' }, 500);
    return response({ public_key: publicKey });
  }

  const appIdentity = body.app_identity;
  if (appIdentity !== 'public' && appIdentity !== 'admin' && appIdentity !== 'member') {
    return response({ error: 'Identitas aplikasi Push tidak valid.' }, 400);
  }
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  try {
    if (!await validateAppIdentityAccess(adminClient, userId, appIdentity)) {
      return response({ error: 'Akun ini tidak memiliki akses ke aplikasi Push yang dipilih.' }, 403);
    }
  } catch (error) {
    console.error('failed to validate push app access', error);
    return response({ error: 'Akses aplikasi Push tidak dapat diverifikasi.' }, 500);
  }

  if (action === 'test') {
    const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');
    if (!webhookSecret) return response({ error: 'Konfigurasi pengiriman notifikasi belum lengkap.' }, 500);
    const guestToken = body.guest_token?.trim() || null;
    if (!userId && !guestToken) return response({ error: 'Token perangkat wajib diisi.' }, 400);

    try {
      let subscription: { id: string } | null = null;
      let subscriptionError: { message: string } | null = null;
      if (userId) {
        const result = await adminClient.from('push_subscriptions').select('id')
          .eq('user_id', userId).eq('app_identity', appIdentity)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        subscription = result.data;
        subscriptionError = result.error;
        if (!subscription && guestToken && !subscriptionError) {
          const guestResult = await adminClient.from('push_subscriptions').select('id')
            .is('user_id', null).eq('guest_token_hash', await sha256(guestToken)).eq('app_identity', appIdentity)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          subscription = guestResult.data;
          subscriptionError = guestResult.error;
        }
      } else {
        const result = await adminClient.from('push_subscriptions').select('id')
          .is('user_id', null).eq('guest_token_hash', await sha256(guestToken!)).eq('app_identity', appIdentity)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        subscription = result.data;
        subscriptionError = result.error;
      }
      if (subscriptionError) return response({ error: 'Subscription perangkat tidak dapat diperiksa.' }, 500);
      if (!subscription) return response({ error: 'Subscription perangkat tidak ditemukan.' }, 404);

      const result = await fetch(`${supabaseUrl}/functions/v1/send-web-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-push-webhook-secret': webhookSecret,
        },
        body: JSON.stringify({
          action: 'test',
          app_identity: appIdentity,
          target_subscription_id: subscription.id,
          title: 'Test Web Push',
          body: 'Notifikasi Web Push Standupindo Cilegon berhasil diterima.',
          url: appIdentity === 'admin' ? '/admin' : appIdentity === 'member' ? '/member' : '/',
        }),
      });
      const payload = await result.json().catch(() => null) as { error?: string; sent?: number } | null;
      if (!result.ok) return response({ error: payload?.error ?? 'Notifikasi uji gagal dikirim.' }, result.status);
      return response({ success: true, sent: payload?.sent ?? 0 });
    } catch (error) {
      console.error('failed to request test web push', error);
      return response({ error: 'Server tidak dapat menghubungi layanan pengiriman notifikasi.' }, 502);
    }
  }

  let endpoint: string;
  try {
    endpoint = validateEndpoint(body.endpoint ?? body.subscription?.endpoint);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'Endpoint subscription tidak valid.' }, 400);
  }
  const guestToken = body.guest_token?.trim() || null;
  if (guestToken && !/^[a-f0-9]{64}$/i.test(guestToken)) return response({ error: 'Token perangkat tidak valid.' }, 400);
  const guestTokenHash = guestToken ? await sha256(guestToken) : null;

  const { data: existing, error: lookupError } = await adminClient
    .from('push_subscriptions')
    .select('id, user_id, guest_token_hash, app_identity')
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (lookupError) return response({ error: 'Subscription tidak dapat diperiksa.' }, 500);

  if (action === 'delete') {
    if (!existing) return response({ success: true });
    if (existing.app_identity !== appIdentity) return response({ error: 'Subscription bukan milik aplikasi ini.' }, 403);
    const ownsAuthenticated = Boolean(userId && existing.user_id === userId);
    const ownsDevice = Boolean(guestTokenHash && existing.guest_token_hash === guestTokenHash);
    if (!ownsAuthenticated && !ownsDevice) return response({ error: 'Subscription bukan milik pemilik yang sah.' }, 403);

    const { error } = await adminClient.from('push_subscriptions').delete().eq('id', existing.id);
    if (error) return response({ error: 'Subscription gagal dihapus.' }, 500);
    return response({ success: true });
  }

  const subscription = body.subscription;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!p256dh || !auth) return response({ error: 'Kunci subscription tidak lengkap.' }, 400);
  if (!userId && !guestTokenHash) return response({ error: 'Token perangkat wajib diisi.' }, 400);

  if (existing) {
    if (existing.app_identity !== appIdentity) return response({ error: 'Endpoint sudah digunakan aplikasi lain pada perangkat ini.' }, 409);
    const ownsAuthenticated = Boolean(userId && existing.user_id === userId);
    const ownsGuest = Boolean(!userId && guestTokenHash && existing.user_id === null && existing.guest_token_hash === guestTokenHash);
    const canClaimOwnGuestSubscription = Boolean(userId && existing.user_id === null && guestTokenHash && existing.guest_token_hash === guestTokenHash);
    if (!ownsAuthenticated && !ownsGuest && !canClaimOwnGuestSubscription) return response({ error: 'Endpoint sudah dimiliki subscription lain.' }, 403);

    const { error } = await adminClient.from('push_subscriptions').update({
      user_id: userId,
      app_identity: appIdentity,
      p256dh,
      auth,
      expiration_time: parseExpiration(subscription?.expirationTime),
      guest_token_hash: userId ? null : guestTokenHash,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id);
    if (error) return response({ error: 'Subscription gagal diperbarui.' }, 500);
    return response({ success: true });
  }

  const { error } = await adminClient.from('push_subscriptions').insert({
    user_id: userId,
    app_identity: appIdentity,
    endpoint,
    p256dh,
    auth,
    expiration_time: parseExpiration(subscription?.expirationTime),
    guest_token_hash: userId ? null : guestTokenHash,
  });
  if (error) return response({ error: 'Subscription gagal disimpan.' }, 500);
  return response({ success: true });
});
