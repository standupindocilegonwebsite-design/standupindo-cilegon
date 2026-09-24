import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function hasRole(metadata: Record<string, unknown> | undefined, role: string): boolean {
  if (!metadata) return false;
  return [metadata.role, metadata.roles, metadata.user_roles].some((candidate) => typeof candidate === 'string'
    ? candidate.trim().toLowerCase() === role
    : Array.isArray(candidate) && candidate.some((item) => typeof item === 'string' && item.trim().toLowerCase() === role));
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeInstagram(value: unknown): string {
  return normalizeText(value)
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '');
}

function normalizeWhatsapp(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

type KomikaIdentity = {
  full_name: string | null;
  stage_name: string | null;
  instagram_url: string | null;
  whatsapp: string | null;
};

type OpenMicRegistrationIdentity = KomikaIdentity & { id: string; komika_id: string | null };

function isStrongIdentityMatch(profile: KomikaIdentity, registration: OpenMicRegistrationIdentity): boolean {
  const instagramMatches = Boolean(normalizeInstagram(profile.instagram_url))
    && normalizeInstagram(profile.instagram_url) === normalizeInstagram(registration.instagram);
  const whatsappMatches = Boolean(normalizeWhatsapp(profile.whatsapp))
    && normalizeWhatsapp(profile.whatsapp) === normalizeWhatsapp(registration.whatsapp);
  const namesMatch = Boolean(normalizeText(profile.full_name) && normalizeText(profile.stage_name))
    && normalizeText(profile.full_name) === normalizeText(registration.full_name)
    && normalizeText(profile.stage_name) === normalizeText(registration.stage_name);

  return instagramMatches || whatsappMatches || namesMatch;
}

async function linkUnassignedHistory(adminClient: ReturnType<typeof createClient>, komikaId: string) {
  const { data: profile } = await adminClient
    .from('komika')
    .select('full_name, stage_name, instagram_url, whatsapp')
    .eq('id', komikaId)
    .maybeSingle();
  if (!profile) return;

  const { data: registrations } = await adminClient
    .from('open_mic_registrations')
    .select('id, komika_id, full_name, stage_name, instagram, whatsapp')
    .is('komika_id', null);
  const candidates = ((registrations ?? []) as OpenMicRegistrationIdentity[]).filter((registration) => isStrongIdentityMatch(profile as KomikaIdentity, registration));
  if (candidates.length === 0) return;

  await adminClient
    .from('open_mic_registrations')
    .update({ komika_id: komikaId })
    .in('id', candidates.map((candidate) => candidate.id))
    .is('komika_id', null);
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return response({ error: 'Konfigurasi server belum lengkap.' }, 500);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return response({ error: 'Anda harus login sebagai admin.' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  const appMetadata = authData.user?.app_metadata as Record<string, unknown> | undefined;
  if (authError || !authData.user || (!hasRole(appMetadata, 'admin') && !hasRole(appMetadata, 'open_mic_admin'))) {
    return response({ error: 'Hanya Admin Penuh atau Admin Open Mic yang dapat membuat akun member.' }, 403);
  }

  let body: { email?: string; password?: string; komika_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return response({ error: 'Data permintaan tidak valid.' }, 400);
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? '';
  if (!email || !email.includes('@')) return response({ error: 'Email member tidak valid.' }, 400);
  if (password.length < 6) return response({ error: 'Password minimal 6 karakter.' }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'member', roles: ['member'] },
  });
  if (createError || !created.user) return response({ error: createError?.message ?? 'Akun gagal dibuat.' }, 400);

  if (body.komika_id) {
    const { error: linkError } = await adminClient
      .from('komika')
      .update({ user_id: created.user.id })
      .eq('id', body.komika_id);

    if (linkError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return response({ error: `Akun dibatalkan karena profil komika gagal dihubungkan: ${linkError.message}` }, 400);
    }

    await linkUnassignedHistory(adminClient, body.komika_id);
  }

  return response({ user_id: created.user.id, email: created.user.email });
});
