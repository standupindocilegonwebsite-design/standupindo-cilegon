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
  guest_token?: string | null;
  endpoint?: string;
  subscription?: SubscriptionPayload;
};

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

  if (action === 'test') {
    const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');
    if (!webhookSecret) return response({ error: 'Konfigurasi pengiriman notifikasi belum lengkap.' }, 500);
    const guestToken = body.guest_token?.trim() || null;
    if (!userId && !guestToken) return response({ error: 'Token perangkat wajib diisi.' }, 400);

    try {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      let subscription: { id: string } | null = null;
      let subscriptionError: { message: string } | null = null;
      if (userId) {
        const result = await adminClient.from('push_subscriptions').select('id')
          .eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
        subscription = result.data;
        subscriptionError = result.error;
        if (!subscription && guestToken && !subscriptionError) {
          const guestResult = await adminClient.from('push_subscriptions').select('id')
            .is('user_id', null).eq('guest_token_hash', await sha256(guestToken))
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          subscription = guestResult.data;
          subscriptionError = guestResult.error;
        }
      } else {
        const result = await adminClient.from('push_subscriptions').select('id')
          .is('user_id', null).eq('guest_token_hash', await sha256(guestToken!))
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
          target_user_id: userId ?? undefined,
          target_subscription_id: userId ? undefined : subscription.id,
          title: 'Test Web Push',
          body: 'Notifikasi Web Push Standupindo Cilegon berhasil diterima.',
          url: '/',
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

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
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
    .select('id, user_id, guest_token_hash')
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (lookupError) return response({ error: 'Subscription tidak dapat diperiksa.' }, 500);

  if (action === 'delete') {
    if (!existing) return response({ success: true });
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
    const ownsAuthenticated = Boolean(userId && existing.user_id === userId);
    const ownsGuest = Boolean(!userId && guestTokenHash && existing.user_id === null && existing.guest_token_hash === guestTokenHash);
    const canClaimOwnGuestSubscription = Boolean(userId && existing.user_id === null && guestTokenHash && existing.guest_token_hash === guestTokenHash);
    if (!ownsAuthenticated && !ownsGuest && !canClaimOwnGuestSubscription) return response({ error: 'Endpoint sudah dimiliki subscription lain.' }, 403);

    const { error } = await adminClient.from('push_subscriptions').update({
      user_id: userId,
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
    endpoint,
    p256dh,
    auth,
    expiration_time: parseExpiration(subscription?.expirationTime),
    guest_token_hash: userId ? null : guestTokenHash,
  });
  if (error) return response({ error: 'Subscription gagal disimpan.' }, 500);
  return response({ success: true });
});
