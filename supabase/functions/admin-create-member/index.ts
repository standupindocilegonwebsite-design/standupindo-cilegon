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
  if (authError || !authData.user || authData.user.app_metadata?.role !== 'admin') {
    return response({ error: 'Hanya admin yang dapat membuat akun member.' }, 403);
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
    app_metadata: { role: 'member' },
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
  }

  return response({ user_id: created.user.id, email: created.user.email });
});
