import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MANAGED_ROLES = ['open_mic_admin', 'event_admin', 'admin_ticket', 'admin_qr'] as const;
const SCOPED_ROLES = ['admin_ticket', 'admin_qr'] as const;
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
  if (authError || !authData.user) return json({ error: 'Sesi admin tidak valid.' }, 401);
  const callerMetadata = authData.user.app_metadata as Record<string, unknown> | undefined;
  const callerIsAdmin = hasRole(callerMetadata, 'admin');
  const callerIsEventAdmin = hasRole(callerMetadata, 'event_admin');
  if (!callerIsAdmin && !callerIsEventAdmin) return json({ error: 'Hanya Admin Penuh atau Admin Event yang dapat mengelola akun ini.' }, 403);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  let body: { action?: 'list' | 'create' | 'toggle' | 'delete'; user_id?: string; email?: string; password?: string; role?: string; active?: boolean; scope_all?: boolean; event_ids?: string[] };
  try { body = await request.json(); } catch { return json({ error: 'Data permintaan tidak valid.' }, 400); }

  if (body.action === 'create') {
    const email = body.email?.trim().toLowerCase();
    if (!email || !email.includes('@')) return json({ error: 'Email admin tidak valid.' }, 400);
    if (!body.password || body.password.length < 6) return json({ error: 'Password minimal 6 karakter.' }, 400);
    if (!isManagedRole(body.role)) return json({ error: 'Role admin operasional tidak valid.' }, 400);
    if (callerIsEventAdmin && !SCOPED_ROLES.includes(body.role as typeof SCOPED_ROLES[number])) {
      return json({ error: 'Admin Event hanya dapat membuat Admin Tiket atau Admin QR Scanner.' }, 403);
    }

    let scopeRows: Array<{ user_id: string; role: string; event_id: string | null; scope_all: boolean; granted_by: string }> = [];
    if (SCOPED_ROLES.includes(body.role as typeof SCOPED_ROLES[number])) {
      const scopeAll = callerIsEventAdmin || body.scope_all === true;
      const eventIds = callerIsEventAdmin
        ? []
        : [...new Set((body.event_ids ?? []).filter((id) => typeof id === 'string'))];
      if (!scopeAll && eventIds.length === 0) return json({ error: 'Pilih minimal satu Event atau pilih semua Event.' }, 400);
      if (scopeAll && eventIds.length > 0) return json({ error: 'Pilih semua Event atau Event tertentu, bukan keduanya.' }, 400);
      if (!scopeAll) {
        const { data: allowedEvents, error: eventError } = await adminClient.from('events').select('id').in('id', eventIds);
        if (eventError || (allowedEvents?.length ?? 0) !== eventIds.length) return json({ error: 'Satu atau beberapa Event tidak tersedia.' }, 400);
      }
      scopeRows = scopeAll
        ? [{ user_id: '', role: body.role, event_id: null, scope_all: true, granted_by: authData.user.id }]
        : eventIds.map((eventId) => ({ user_id: '', role: body.role as string, event_id: eventId, scope_all: false, granted_by: authData.user.id }));
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      app_metadata: { role: body.role, roles: [body.role] },
    });
    if (error || !data.user) {
      const message = error?.message ?? 'Akun admin gagal dibuat.';
      const safeMessage = /already (been )?registered|already exists|already been taken/i.test(message)
        ? 'Email sudah digunakan oleh akun lain.'
        : message;
      return json({ error: safeMessage }, 400);
    }
    if (scopeRows.length) {
      const rows = scopeRows.map((row) => ({ ...row, user_id: data.user.id }));
      const { error: scopeError } = await adminClient.from('admin_event_scopes').insert(rows);
      if (scopeError) {
        const { error: rollbackError } = await adminClient.auth.admin.deleteUser(data.user.id);
        if (rollbackError) {
          return json({ error: 'Scope Event gagal disimpan dan akun sementara gagal dihapus. Hubungi administrator untuk pemeriksaan.' }, 500);
        }
        const scopeMessage = scopeError.code === '23505'
          ? 'Scope Event duplikat.'
          : scopeError.code === '23503'
            ? 'Event untuk scope tidak valid.'
            : scopeError.code === '42501'
              ? 'Database menolak penyimpanan scope Event.'
              : 'Database gagal menyimpan scope Event.';
        return json({ error: `Akun dibatalkan: ${scopeMessage} Akun baru telah di-rollback.` }, 400);
      }
    }
    return json({ user: { id: data.user.id, email: data.user.email, role: body.role, active: true } });
  }

  if (body.action === 'toggle' || body.action === 'delete') {
    if (!body.user_id) return json({ error: 'Akun admin tidak dipilih.' }, 400);
    const { data: target, error: targetError } = await adminClient.auth.admin.getUserById(body.user_id);
    if (targetError || !target.user) return json({ error: 'Akun admin tidak ditemukan.' }, 404);
    if (hasRole(target.user.app_metadata as Record<string, unknown> | undefined, 'admin')) return json({ error: 'Akun admin utama tidak dapat diubah dari menu ini.' }, 400);
    if (!isManagedRole((target.user.app_metadata as Record<string, unknown> | undefined)?.role)) return json({ error: 'Akun ini bukan admin operasional.' }, 400);
    if (callerIsEventAdmin) {
      if (!SCOPED_ROLES.includes((target.user.app_metadata as Record<string, unknown>).role as typeof SCOPED_ROLES[number])) return json({ error: 'Admin Event hanya dapat mengelola akun Admin Tiket atau Admin QR Scanner.' }, 403);
      const { data: ownGrant, error: grantError } = await adminClient.from('admin_event_scopes').select('id').eq('user_id', body.user_id).eq('granted_by', authData.user.id).limit(1).maybeSingle();
      if (grantError || !ownGrant) return json({ error: 'Akun ini tidak berada dalam kewenangan Anda.' }, 403);
    }

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

  let managedUsers = users.filter((user) => isManagedRole(user.app_metadata?.role));
  if (callerIsEventAdmin) {
    const { data: grants, error: grantError } = await adminClient.from('admin_event_scopes').select('user_id').eq('granted_by', authData.user.id);
    if (grantError) return json({ error: grantError.message }, 400);
    const grantedIds = new Set((grants ?? []).map((grant) => grant.user_id));
    managedUsers = managedUsers.filter((user) => grantedIds.has(user.id) && SCOPED_ROLES.includes(user.app_metadata?.role as typeof SCOPED_ROLES[number]));
  }
  const managedIds = managedUsers.map((user) => user.id);
  const { data: grants } = managedIds.length
    ? await adminClient.from('admin_event_scopes').select('user_id, role, event_id, scope_all').in('user_id', managedIds)
    : { data: [] };
  const scopesByUser = new Map<string, Array<{ role: string; event_id: string | null; scope_all: boolean }>>();
  (grants ?? []).forEach((grant) => scopesByUser.set(grant.user_id, [...(scopesByUser.get(grant.user_id) ?? []), { role: grant.role, event_id: grant.event_id, scope_all: grant.scope_all }]));

  return json({ admins: managedUsers.map((user) => ({
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    role: user.app_metadata?.role,
    active: !user.banned_until || new Date(user.banned_until) <= new Date(),
    scopes: scopesByUser.get(user.id) ?? [],
  })) });
});
