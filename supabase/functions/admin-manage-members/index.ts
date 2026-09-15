import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
function json(body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
function hasRole(metadata: Record<string, unknown> | undefined, role: string): boolean {
  if (!metadata) return false;
  return [metadata.role, metadata.roles, metadata.user_roles].some((candidate) => typeof candidate === 'string' ? candidate.trim().toLowerCase() === role : Array.isArray(candidate) && candidate.some((item) => typeof item === 'string' && item.trim().toLowerCase() === role));
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Konfigurasi server belum lengkap.' }, 500);
  if (!authorization) return json({ error: 'Anda harus login sebagai admin.' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user || !hasRole(authData.user.app_metadata as Record<string, unknown> | undefined, 'admin')) return json({ error: 'Hanya admin yang dapat mengelola akun member.' }, 403);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  let body: { action?: 'list' | 'toggle' | 'delete' | 'update-role'; user_id?: string; active?: boolean; role?: 'member' | 'evaluator' };
  try { body = await request.json(); } catch { return json({ error: 'Data permintaan tidak valid.' }, 400); }

  if (body.action === 'update-role') {
    if (!body.user_id || !body.role) return json({ error: 'Akun dan peran harus dipilih.' }, 400);
    const { data: target, error: targetError } = await adminClient.auth.admin.getUserById(body.user_id);
    if (targetError || !target.user) return json({ error: 'Akun member tidak ditemukan.' }, 404);
    if (hasRole(target.user.app_metadata as Record<string, unknown> | undefined, 'admin')) return json({ error: 'Peran akun admin tidak dapat diubah dari menu ini.' }, 400);

    const appMetadata = { ...(target.user.app_metadata as Record<string, unknown> | undefined) };
    if (body.role === 'evaluator') {
      appMetadata.role = 'member';
      appMetadata.roles = ['member', 'evaluator'];
    } else {
      appMetadata.role = 'member';
      appMetadata.roles = ['member'];
    }
    delete appMetadata.user_roles;
    const { data, error } = await adminClient.auth.admin.updateUserById(body.user_id, { app_metadata: appMetadata });
    if (error || !data.user) return json({ error: error?.message ?? 'Peran akun gagal diubah.' }, 400);
    return json({ user: { id: data.user.id, role: body.role, roles: appMetadata.roles } });
  }

  if (body.action === 'toggle') {
    if (!body.user_id || typeof body.active !== 'boolean') return json({ error: 'Data status akun tidak lengkap.' }, 400);
    const { data: target, error: targetError } = await adminClient.auth.admin.getUserById(body.user_id);
    if (targetError || !target.user) return json({ error: 'Akun member tidak ditemukan.' }, 404);
    if (target.user.app_metadata?.role === 'admin') return json({ error: 'Akun admin tidak dapat dinonaktifkan dari menu ini.' }, 400);
    const { data, error } = await adminClient.auth.admin.updateUserById(body.user_id, { ban_duration: body.active ? 'none' : '876000h' });
    if (error || !data.user) return json({ error: error?.message ?? 'Status akun gagal diubah.' }, 400);
    return json({ user: { id: data.user.id, email: data.user.email, active: !data.user.banned_until || new Date(data.user.banned_until) <= new Date() } });
  }

  if (body.action === 'delete') {
    if (!body.user_id) return json({ error: 'Akun member tidak dipilih.' }, 400);
    const { data: target, error: targetError } = await adminClient.auth.admin.getUserById(body.user_id);
    if (targetError || !target.user) return json({ error: 'Akun member tidak ditemukan.' }, 404);
    if (hasRole(target.user.app_metadata as Record<string, unknown> | undefined, 'admin')) return json({ error: 'Akun admin tidak dapat dihapus dari menu ini.' }, 400);
    const { error: unlinkError } = await adminClient.from('komika').update({ user_id: null }).eq('user_id', body.user_id);
    if (unlinkError) return json({ error: `Profil komika gagal dilepas: ${unlinkError.message}` }, 400);
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(body.user_id);
    if (deleteError) return json({ error: deleteError.message }, 400);
    return json({ deleted: true, user_id: body.user_id });
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

  const memberUsers = users.filter((user) => hasRole(user.app_metadata, 'member') || hasRole(user.app_metadata, 'evaluator'));
  const { data: profiles, error: profilesError } = await adminClient.from('komika').select('id, user_id, full_name, stage_name, photo, status').in('user_id', memberUsers.map((user) => user.id));
  if (profilesError) return json({ error: profilesError.message }, 400);
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));

  return json({ members: memberUsers.map((user) => {
    const profile = profileMap.get(user.id);
    return { id: user.id, email: user.email, created_at: user.created_at, active: !user.banned_until || new Date(user.banned_until) <= new Date(), role: hasRole(user.app_metadata, 'evaluator') ? 'evaluator' : 'member', profile };
  }) });
});
