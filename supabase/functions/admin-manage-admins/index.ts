import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const MANAGED_ROLES = ['open_mic_admin', 'event_admin'] as const;
type ManagedRole = typeof MANAGED_ROLES[number];

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function hasRole(metadata: Record<string, unknown> | undefined, role: string): boolean {
  if (!metadata) return false;
  return [metadata.role, metadata.roles, metadata.user_roles].some((candidate) => typeof candidate === 'string'
    ? candidate.trim().toLowerCase() === role
    : Array.isArray(candidate) && candidate.some((item) => typeof item === 'string' && item.trim().toLowerCase() === role));
}

function isManagedRole(value: unknown): value is ManagedRole {
  return typeof value === 'string' && MANAGED_ROLES.includes(value as ManagedRole);
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Konfigurasi server belum lengkap.' }, 500);
  if (!authorization) return json({ error: 'Anda harus login sebagai admin utama.' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user || !hasRole(authData.user.app_metadata as Record<string, unknown> | undefined, 'admin')) {
    return json({ error: 'Hanya admin utama yang dapat mengelola akun admin operasional.' }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  let body: { action?: 'list' | 'create' | 'toggle' | 'delete'; user_id?: string; email?: string; password?: string; role?: string; active?: boolean };
  try { body = await request.json(); } catch { return json({ error: 'Data permintaan tidak valid.' }, 400); }

  if (body.action === 'create') {
    const email = body.email?.trim().toLowerCase();
    if (!email || !email.includes('@')) return json({ error: 'Email admin tidak valid.' }, 400);
    if (!body.password || body.password.length < 6) return json({ error: 'Password minimal 6 karakter.' }, 400);
    if (!isManagedRole(body.role)) return json({ error: 'Role admin operasional tidak valid.' }, 400);

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      app_metadata: { role: body.role, roles: [body.role] },
    });
    if (error || !data.user) return json({ error: error?.message ?? 'Akun admin gagal dibuat.' }, 400);
    return json({ user: { id: data.user.id, email: data.user.email, role: body.role, active: true } });
  }

  if (body.action === 'toggle' || body.action === 'delete') {
    if (!body.user_id) return json({ error: 'Akun admin tidak dipilih.' }, 400);
    const { data: target, error: targetError } = await adminClient.auth.admin.getUserById(body.user_id);
    if (targetError || !target.user) return json({ error: 'Akun admin tidak ditemukan.' }, 404);
    if (hasRole(target.user.app_metadata as Record<string, unknown> | undefined, 'admin')) return json({ error: 'Akun admin utama tidak dapat diubah dari menu ini.' }, 400);
    if (!isManagedRole((target.user.app_metadata as Record<string, unknown> | undefined)?.role)) return json({ error: 'Akun ini bukan admin operasional.' }, 400);

    if (body.action === 'delete') {
      const { error } = await adminClient.auth.admin.deleteUser(body.user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ deleted: true, user_id: body.user_id });
    }

    if (typeof body.active !== 'boolean') return json({ error: 'Status akun tidak valid.' }, 400);
    const { data, error } = await adminClient.auth.admin.updateUserById(body.user_id, { ban_duration: body.active ? 'none' : '876000h' });
    if (error || !data.user) return json({ error: error?.message ?? 'Status akun gagal diubah.' }, 400);
    return json({ user: { id: data.user.id, email: data.user.email, active: !data.user.banned_until || new Date(data.user.banned_until) <= new Date() } });
  }

  const users: Array<{ id: string; email?: string; created_at: string; banned_until?: string | null; app_metadata?: Record<string, unknown> }> = [];
  let page = 1;
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return json({ error: error.message }, 400);
    users.push(...data.users.map((user) => ({ id: user.id, email: user.email, created_at: user.created_at, banned_until: user.banned_until, app_metadata: user.app_metadata as Record<string, unknown> })));
    if (data.users.length < 1000) break;
    page += 1;
  }

  return json({ admins: users
    .filter((user) => isManagedRole(user.app_metadata?.role))
    .map((user) => ({ id: user.id, email: user.email, created_at: user.created_at, role: user.app_metadata?.role, active: !user.banned_until || new Date(user.banned_until) <= new Date() })) });
});
