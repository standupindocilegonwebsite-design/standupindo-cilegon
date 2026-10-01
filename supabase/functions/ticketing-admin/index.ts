import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { accessCodeHash, createAccessCode, encryptSecret, normalizeWhatsapp, randomToken, sha256, decryptSecret, whatsappAccessCodeHash } from '../_shared/ticketing.ts';
import { chunkValues, fetchAllPages } from '../_shared/pagination.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const PROOF_BUCKET = 'ticket-payment-proofs';

type RequestBody = {
  action?: string;
  order_id?: string;
  event_id?: string;
  resolution?: 'Lunas' | 'Ditolak';
  qr_token?: string;
  access_code_id?: string;
  payment_method_id?: string;
  payment_method?: { id?: string; event_id?: string; recipient_name?: string; bank_name?: string; account_number?: string; qris_storage_path?: string; note?: string };
  file_name?: string;
  file_type?: string;
  event_filter?: string;
  activity_type?: 'thanks' | 'upcoming_event' | 'promo';
  maintenance_log_id?: string;
  recipient_name?: string;
  recipient_whatsapp?: string;
  message?: string;
  ticket_order_id?: string;
  scope_role?: 'admin_ticket' | 'admin_qr';
  order_number?: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function hasRole(metadata: Record<string, unknown> | undefined, role: string) {
  if (!metadata) return false;
  return [metadata.role, metadata.roles, metadata.user_roles].some((candidate) => typeof candidate === 'string'
    ? candidate.trim().toLowerCase() === role
    : Array.isArray(candidate) && candidate.some((entry) => typeof entry === 'string' && entry.trim().toLowerCase() === role));
}

function getTicketPageUrl(originHeader: string | null) {
  if (!originHeader) return null;
  try {
    const origin = new URL(originHeader);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) return null;
    return new URL('/tiket', origin.origin).toString();
  } catch {
    return null;
  }
}

function accessMessage(name: string, eventTitle: string, orderNumber: string, code: string, ticketPageUrl: string) {
  return `Halo *${name}*, pembayaran tiket *${eventTitle}* untuk Order *#${orderNumber}* sudah terverifikasi.\n\n*Kode Akses: ${code}*\n\nLihat tiket: ${ticketPageUrl}\n\nGunakan nomor WhatsApp yang terdaftar dan Kode Akses tersebut untuk melihat tiket.`;
}

function whatsappUrl(number: string, message: string) {
  const normalized = normalizeWhatsapp(number);
  return normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}` : null;
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const encryptionKey = Deno.env.get('TICKET_ACCESS_CODE_ENCRYPTION_KEY');
  const accessCodePepper = Deno.env.get('TICKET_ACCESS_CODE_PEPPER');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) return json({ error: 'Sesi Admin tidak valid.' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: 'Sesi Admin tidak valid.' }, 401);
  const metadata = authData.user.app_metadata as Record<string, unknown> | undefined;
  const isAdmin = hasRole(metadata, 'admin');
  const isTicketAdmin = hasRole(metadata, 'admin_ticket');
  const isQrScanner = hasRole(metadata, 'admin_qr');
  let body: RequestBody;
  try { body = await request.json(); } catch { return json({ error: 'Data permintaan tidak valid.' }, 400); }

  async function hasEventScope(eventId: string, role: 'admin_ticket' | 'admin_qr') {
    if (isAdmin) return true;
    if (!hasRole(metadata, role)) return false;
    const { data, error } = await serviceClient.from('admin_event_scopes').select('id')
      .eq('user_id', authData.user.id).eq('role', role)
      .or(`scope_all.eq.true,event_id.eq.${eventId}`).limit(1).maybeSingle();
    return !error && Boolean(data);
  }

  try {
    if (body.action === 'delete-expired-order') {
      if (!isAdmin && !isTicketAdmin) return json({ error: 'Akses hapus order ditolak.' }, 403);
      if (!body.order_id) return json({ error: 'Order tidak dipilih.' }, 400);
      const { data: order, error: orderError } = await serviceClient.from('ticket_orders')
        .select('id, event_id, status, payment_proof_path').eq('id', body.order_id).maybeSingle();
      if (orderError) return json({ error: 'Data order gagal dimuat.' }, 500);
      if (!order || order.status !== 'Expired') return json({ error: 'Hanya order berstatus Expired yang dapat dihapus.' }, 409);
      if (!await hasEventScope(order.event_id, 'admin_ticket')) return json({ error: 'Order berada di luar scope Admin Tiket.' }, 403);

      const { error: deleteError } = await serviceClient.from('ticket_orders').delete().eq('id', order.id).eq('status', 'Expired');
      if (deleteError) return json({ error: 'Order gagal dihapus. Pastikan order tidak memiliki tiket yang sudah diterbitkan.' }, 409);

      let proofCleanupWarning: string | undefined;
      if (order.payment_proof_path) {
        const { error: storageError } = await serviceClient.storage.from(PROOF_BUCKET).remove([order.payment_proof_path]);
        if (storageError) proofCleanupWarning = 'Order sudah dihapus, tetapi file bukti pembayaran gagal dibersihkan.';
      }
      return json({ deleted: true, warning: proofCleanupWarning });
    }

    if (body.action === 'expire-orders') {
      if (isAdmin) {
        const { data, error } = await serviceClient.rpc('expire_unpaid_ticket_orders');
        if (error) return json({ error: error.message }, 500);
        return json({ expired_count: data ?? 0 });
      }
      if (!isTicketAdmin) return json({ error: 'Akses expiry order ditolak.' }, 403);
      const { data: scopes, error: scopeError } = await serviceClient.from('admin_event_scopes')
        .select('event_id, scope_all').eq('user_id', authData.user.id).eq('role', 'admin_ticket');
      if (scopeError) return json({ error: 'Scope Event gagal dimuat.' }, 500);
      let eventIds: string[];
      if (scopes?.some((scope) => scope.scope_all)) {
        const { data: allEvents, error: eventError } = await serviceClient.from('events').select('id');
        if (eventError) return json({ error: 'Event gagal dimuat.' }, 500);
        eventIds = (allEvents ?? []).map((event) => event.id);
      } else {
        eventIds = [...new Set((scopes ?? []).map((scope) => scope.event_id).filter((id): id is string => Boolean(id)))];
      }
      if (!eventIds.length) return json({ expired_count: 0 });
      const { data, error } = await serviceClient.rpc('expire_ticket_orders_for_events', { p_event_ids: eventIds });
      if (error) return json({ error: error.message }, 500);
      return json({ expired_count: data ?? 0 });
    }

    if (body.action === 'audience') {
      if (!isAdmin && !hasRole(metadata, 'event_admin')) return json({ error: 'Akses Penonton ditolak.' }, 403);
      const paidStatuses = ['Lunas'];
      const { data: paidOrders, error: orderError } = await fetchAllPages((from, to) => {
        let orderQuery = serviceClient.from('ticket_orders')
          .select('id, order_number, event_id, full_name, whatsapp, ticket_category, quantity, total_price, status, created_at')
          .in('status', paidStatuses).order('created_at', { ascending: false }).order('id', { ascending: true });
        if (body.event_filter && body.event_filter !== 'all') orderQuery = orderQuery.eq('event_id', body.event_filter);
        return orderQuery.range(from, to);
      });
      if (orderError) return json({ error: 'Database Penonton gagal dimuat.' }, 500);
      const orders = paidOrders ?? [];
      const eventIds = [...new Set(orders.map((order) => order.event_id))];
      const orderIds = orders.map((order) => order.id);
      const eventRows: Array<{ id: string; title: string; date: string; status: string }> = [];
      for (const ids of chunkValues(eventIds)) {
        const { data, error } = await fetchAllPages((from, to) => serviceClient.from('events')
          .select('id, title, date, status').in('id', ids).order('id', { ascending: true }).range(from, to));
        if (error) return json({ error: 'Histori Event gagal dimuat.' }, 500);
        eventRows.push(...(data ?? []));
      }
      const instances: Array<{ ticket_order_id: string; status: string; checked_in_at: string | null }> = [];
      for (const ids of chunkValues(orderIds)) {
        const { data, error } = await fetchAllPages((from, to) => serviceClient.from('ticket_instances')
          .select('ticket_order_id, status, checked_in_at').in('ticket_order_id', ids).order('id', { ascending: true }).range(from, to));
        if (error) return json({ error: 'Histori check-in gagal dimuat.' }, 500);
        instances.push(...(data ?? []));
      }
      const eventById = new Map((eventRows ?? []).map((event) => [event.id, event]));
      const instancesByOrder = new Map<string, Array<{ status: string; checked_in_at: string | null }>>();
      (instances ?? []).forEach((instance) => instancesByOrder.set(instance.ticket_order_id, [...(instancesByOrder.get(instance.ticket_order_id) ?? []), instance]));
      const audience = new Map<string, {
        whatsapp: string;
        full_name: string;
        events: Map<string, { event_id: string; title: string; status: string; date: string; order_count: number; order_numbers: string[]; ticket_count: number; checked_in: number }>;
      }>();

      orders.forEach((order) => {
        const whatsapp = normalizeWhatsapp(order.whatsapp);
        if (!whatsapp) return;
        const event = eventById.get(order.event_id);
        if (!event) return;
        const person = audience.get(whatsapp) ?? { whatsapp, full_name: order.full_name, events: new Map() };
        const eventEntry = person.events.get(order.event_id) ?? { event_id: event.id, title: event.title, status: event.status, date: event.date, order_count: 0, order_numbers: [], ticket_count: 0, checked_in: 0 };
        const orderInstances = instancesByOrder.get(order.id) ?? [];
        eventEntry.order_count += 1;
        if (order.order_number) eventEntry.order_numbers.push(order.order_number);
        eventEntry.ticket_count += orderInstances.length ? orderInstances.filter((ticket) => ticket.status === 'active' || ticket.checked_in_at).length : order.quantity;
        eventEntry.checked_in += orderInstances.filter((ticket) => Boolean(ticket.checked_in_at)).length;
        person.events.set(order.event_id, eventEntry);
        audience.set(whatsapp, person);
      });

      const guests = Array.from(audience.values()).map((person) => {
        const events = Array.from(person.events.values()).map((event) => ({
          ...event,
          not_checked_in: Math.max(0, event.ticket_count - event.checked_in),
        }));
        return {
          whatsapp: person.whatsapp,
          full_name: person.full_name,
          events,
          event_count: events.length,
          total_tickets: events.reduce((sum, event) => sum + event.ticket_count, 0),
          total_checked_in: events.reduce((sum, event) => sum + event.checked_in, 0),
          total_not_checked_in: events.reduce((sum, event) => sum + event.not_checked_in, 0),
        };
      }).sort((first, second) => first.full_name.localeCompare(second.full_name, 'id', { sensitivity: 'base' }));

      return json({ guests, total_buyers: guests.length, total_tickets: guests.reduce((sum, guest) => sum + guest.total_tickets, 0), total_checked_in: guests.reduce((sum, guest) => sum + guest.total_checked_in, 0) });
    }

    if (body.action === 'ticket-list') {
      if (!isAdmin && !isTicketAdmin) return json({ error: 'Akses daftar tiket ditolak.' }, 403);
      let scopedEventIds: string[] | null = null;
      if (!isAdmin) {
        const { data: scopes, error: scopeError } = await serviceClient.from('admin_event_scopes')
          .select('event_id, scope_all').eq('user_id', authData.user.id).eq('role', 'admin_ticket');
        if (scopeError) return json({ error: 'Scope Event gagal dimuat.' }, 500);
        if (!scopes?.some((scope) => scope.scope_all)) scopedEventIds = [...new Set((scopes ?? []).map((scope) => scope.event_id).filter((id): id is string => Boolean(id)))];
      }
      const ticketRows: Array<{ id: string; event_id: string; ticket_order_id: string; event_ticket_id: string; sequence_no: number; status: string; checked_in_at: string | null; issued_at: string }> = [];
      const ticketEventChunks = scopedEventIds === null ? [null] : chunkValues(scopedEventIds);
      for (const eventIds of ticketEventChunks) {
        const { data, error } = await fetchAllPages((from, to) => {
          let ticketQuery = serviceClient.from('ticket_instances')
            .select('id, event_id, ticket_order_id, event_ticket_id, sequence_no, status, checked_in_at, issued_at')
            .order('issued_at', { ascending: false }).order('id', { ascending: true });
          if (eventIds) ticketQuery = ticketQuery.in('event_id', eventIds);
          return ticketQuery.range(from, to);
        });
        if (error) return json({ error: 'Daftar tiket gagal dimuat.' }, 500);
        ticketRows.push(...(data ?? []));
      }
      ticketRows.sort((first, second) => second.issued_at.localeCompare(first.issued_at));
      const orderIds = [...new Set(ticketRows.map((ticket) => ticket.ticket_order_id))];
      const eventIds = [...new Set(ticketRows.map((ticket) => ticket.event_id))];
      const orders: Array<{ id: string; order_number: string | null; full_name: string; whatsapp: string; ticket_category: string; status: string }> = [];
      for (const ids of chunkValues(orderIds)) {
        const { data, error } = await fetchAllPages((from, to) => serviceClient.from('ticket_orders')
          .select('id, order_number, full_name, whatsapp, ticket_category, status').in('id', ids).order('id', { ascending: true }).range(from, to));
        if (error) return json({ error: 'Detail order gagal dimuat.' }, 500);
        orders.push(...(data ?? []));
      }
      const events: Array<{ id: string; title: string; status: string; date: string }> = [];
      for (const ids of chunkValues(eventIds)) {
        const { data, error } = await fetchAllPages((from, to) => serviceClient.from('events')
          .select('id, title, status, date').in('id', ids).order('id', { ascending: true }).range(from, to));
        if (error) return json({ error: 'Detail Event gagal dimuat.' }, 500);
        events.push(...(data ?? []));
      }
      const orderById = new Map((orders ?? []).map((order) => [order.id, order]));
      const eventById = new Map((events ?? []).map((event) => [event.id, event]));
      const tickets = ticketRows.filter((ticket) => orderById.get(ticket.ticket_order_id)?.status === 'Lunas').map((ticket) => ({
        ...ticket,
        order: orderById.get(ticket.ticket_order_id),
        event: eventById.get(ticket.event_id),
      }));
      return json({ tickets });
    }

    if (body.action === 'maintenance-list') {
      if (!isAdmin && !hasRole(metadata, 'event_admin')) return json({ error: 'Akses maintenance audience ditolak.' }, 403);
      let query = serviceClient.from('ticket_maintenance_logs').select('*, sends:ticket_maintenance_sends(sent_at, sent_by)').order('created_at', { ascending: false });
      if (body.event_filter && body.event_filter !== 'all') query = query.eq('event_id', body.event_filter);
      const { data, error } = await query;
      if (error) return json({ error: 'Aktivitas WhatsApp gagal dimuat.' }, 500);
      return json({ activities: (data ?? []).map((activity) => ({ ...activity, sends: [...(activity.sends ?? [])].sort((first, second) => second.sent_at.localeCompare(first.sent_at)) })) });
    }

    if (body.action === 'maintenance-create') {
      if (!isAdmin && !hasRole(metadata, 'event_admin')) return json({ error: 'Akses maintenance audience ditolak.' }, 403);
      if (!body.event_id || !body.activity_type || !body.recipient_name?.trim() || !body.message?.trim()) return json({ error: 'Lengkapi Event, jenis aktivitas, nama, dan pesan.' }, 400);
      const normalizedPhone = normalizeWhatsapp(body.recipient_whatsapp ?? '');
      if (normalizedPhone.length < 10 || normalizedPhone.length > 15) return json({ error: 'Nomor WhatsApp tidak valid.' }, 400);
      const { data: event } = await serviceClient.from('events').select('id').eq('id', body.event_id).maybeSingle();
      if (!event) return json({ error: 'Event tidak ditemukan.' }, 404);
      const { data, error } = await serviceClient.from('ticket_maintenance_logs').insert({
        event_id: body.event_id,
        ticket_order_id: body.ticket_order_id ?? null,
        activity_type: body.activity_type,
        recipient_name: body.recipient_name.trim(),
        whatsapp_normalized: normalizedPhone,
        message: body.message.trim(),
      }).select().single();
      if (error || !data) return json({ error: error?.message ?? 'Aktivitas WhatsApp gagal disimpan.' }, 400);
      return json({ activity: data });
    }

    if (body.action === 'maintenance-mark-sent') {
      if (!isAdmin && !hasRole(metadata, 'event_admin')) return json({ error: 'Akses maintenance audience ditolak.' }, 403);
      if (!body.maintenance_log_id) return json({ error: 'Aktivitas tidak dipilih.' }, 400);
      const { data: activity } = await serviceClient.from('ticket_maintenance_logs').select('id, event_id').eq('id', body.maintenance_log_id).maybeSingle();
      if (!activity) return json({ error: 'Aktivitas tidak ditemukan.' }, 404);
      const { data, error } = await serviceClient.rpc('mark_ticket_maintenance_sent', { p_maintenance_log_id: activity.id, p_actor_id: authData.user.id });
      if (error) return json({ error: error.message }, 400);
      const result = Array.isArray(data) ? data[0] : data;
      return json({ marked_sent: true, sent_at: result?.sent_at, send_count: result?.send_count });
    }

    if (body.action === 'create-qris-upload') {
      if (!isAdmin && !isTicketAdmin) return json({ error: 'Akses upload QRIS ditolak.' }, 403);
      if (!body.event_id || !body.file_type) return json({ error: 'Event dan file QRIS wajib dipilih.' }, 400);
      if (!await hasEventScope(body.event_id, 'admin_ticket')) return json({ error: 'Event di luar scope Admin Tiket.' }, 403);
      const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
      const extension = extensions[body.file_type];
      if (!extension) return json({ error: 'Gunakan QRIS JPG, PNG, atau WEBP.' }, 400);
      const path = `payment-methods/${body.event_id}/${crypto.randomUUID()}.${extension}`;
      const { data, error } = await serviceClient.storage.from('standupindo-media').createSignedUploadUrl(path, { upsert: false });
      if (error || !data) return json({ error: 'Link upload QRIS gagal dibuat.' }, 500);
      return json({ path, token: data.token, signed_url: data.signedUrl });
    }

    if (body.action === 'payment-methods') {
      if (!isAdmin && !isTicketAdmin) return json({ error: 'Akses informasi pembayaran ditolak.' }, 403);
      const { data: methods, error: methodError } = await serviceClient.from('event_payment_methods').select('*').order('updated_at', { ascending: false });
      if (methodError) return json({ error: 'Informasi pembayaran gagal dimuat.' }, 500);
      const visibleMethods = isAdmin ? methods ?? [] : await Promise.all((methods ?? []).map(async (method) => await hasEventScope(method.event_id, 'admin_ticket') ? method : null)).then((rows) => rows.filter(Boolean));
      const eventIds = [...new Set(visibleMethods.map((method) => method.event_id))];
      const { data: events } = eventIds.length ? await serviceClient.from('events').select('id, title, date, status').in('id', eventIds) : { data: [] };
      return json({ methods: visibleMethods, events: events ?? [] });
    }

    if (body.action === 'save-payment-method') {
      if (!isAdmin && !isTicketAdmin) return json({ error: 'Akses pengelolaan pembayaran ditolak.' }, 403);
      const method = body.payment_method as { id?: string; event_id?: string; recipient_name?: string; bank_name?: string; account_number?: string; qris_storage_path?: string; note?: string } | undefined;
      if (!method?.event_id || !method.recipient_name?.trim()) return json({ error: 'Event dan nama penerima wajib diisi.' }, 400);
      if (!await hasEventScope(method.event_id, 'admin_ticket')) return json({ error: 'Event di luar scope Admin Tiket.' }, 403);
      const accountNumber = method.account_number?.trim() || null;
      const qrisPath = method.qris_storage_path?.trim() || null;
      if (!accountNumber && !qrisPath) return json({ error: 'Isi nomor rekening atau upload QRIS.' }, 400);
      if (qrisPath && !qrisPath.startsWith(`payment-methods/${method.event_id}/`)) return json({ error: 'Lokasi QRIS tidak valid untuk Event ini.' }, 400);
      const payload = {
        event_id: method.event_id,
        recipient_name: method.recipient_name.trim(),
        bank_name: method.bank_name?.trim() || null,
        account_number: accountNumber,
        qris_storage_path: qrisPath,
        note: method.note?.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const query = method.id
        ? await serviceClient.from('event_payment_methods').update(payload).eq('id', method.id).eq('event_id', method.event_id).select().maybeSingle()
        : await serviceClient.from('event_payment_methods').insert(payload).select().single();
      if (query.error || !query.data) return json({ error: query.error?.message ?? 'Informasi pembayaran gagal disimpan.' }, 400);
      return json({ method: query.data });
    }

    if (body.action === 'activate-payment-method' || body.action === 'deactivate-payment-method') {
      if (!isAdmin && !isTicketAdmin) return json({ error: 'Akses pengelolaan pembayaran ditolak.' }, 403);
      if (!body.payment_method_id) return json({ error: 'Pilih informasi pembayaran.' }, 400);
      const { data: method } = await serviceClient.from('event_payment_methods').select('id, event_id').eq('id', body.payment_method_id).maybeSingle();
      if (!method || !await hasEventScope(method.event_id, 'admin_ticket')) return json({ error: 'Informasi pembayaran tidak ditemukan atau di luar scope.' }, 404);
      if (body.action === 'activate-payment-method') {
        const { error } = await serviceClient.rpc('set_ticket_payment_method_active', { p_method_id: method.id, p_actor_id: authData.user.id });
        if (error) return json({ error: error.message }, 400);
      } else {
        const { error } = await serviceClient.from('event_payment_methods').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', method.id);
        if (error) return json({ error: error.message }, 400);
      }
      return json({ updated: true });
    }

    if (body.action === 'delete-payment-method') {
      if (!isAdmin && !isTicketAdmin) return json({ error: 'Akses pengelolaan pembayaran ditolak.' }, 403);
      if (!body.payment_method_id) return json({ error: 'Pilih informasi pembayaran.' }, 400);
      const { data: method, error: methodError } = await serviceClient.from('event_payment_methods')
        .select('id, event_id').eq('id', body.payment_method_id).maybeSingle();
      if (methodError) return json({ error: 'Informasi pembayaran gagal dimuat.' }, 500);
      if (!method || !await hasEventScope(method.event_id, 'admin_ticket')) return json({ error: 'Informasi pembayaran tidak ditemukan atau di luar scope.' }, 404);
      const { error } = await serviceClient.from('event_payment_methods').delete().eq('id', method.id).eq('event_id', method.event_id);
      if (error) return json({ error: error.message }, 400);
      return json({ deleted: true });
    }

    if (body.action === 'proof-url') {
      if (!body.order_id || (!isAdmin && !isTicketAdmin)) return json({ error: 'Akses bukti pembayaran ditolak.' }, 403);
      const { data: order } = await serviceClient.from('ticket_orders').select('id, event_id, payment_proof_path').eq('id', body.order_id).maybeSingle();
      if (!order || !order.payment_proof_path) return json({ error: 'Bukti pembayaran tidak ditemukan.' }, 404);
      if (!await hasEventScope(order.event_id, 'admin_ticket')) return json({ error: 'Event di luar scope akun ini.' }, 403);
      const { data, error } = await serviceClient.storage.from(PROOF_BUCKET).createSignedUrl(order.payment_proof_path, 300);
      if (error || !data) return json({ error: 'Bukti pembayaran belum dapat dibuka.' }, 500);
      return json({ signed_url: data.signedUrl, expires_in: 300 });
    }

    if (body.action === 'resolve-order') {
      if (!encryptionKey || !accessCodePepper) return json({ error: 'Secret Ticketing belum dikonfigurasi.' }, 500);
      if (!body.order_id || !body.resolution || (!isAdmin && !isTicketAdmin)) return json({ error: 'Akses verifikasi order ditolak.' }, 403);
      let ticketPageUrl: string | undefined;
      if (body.resolution === 'Lunas') {
        const pageUrl = getTicketPageUrl(request.headers.get('origin'));
        if (!pageUrl) return json({ error: 'Domain halaman tiket tidak dapat ditentukan dari request.' }, 400);
        ticketPageUrl = pageUrl;
      }
      const { data: order, error: orderError } = await serviceClient.from('ticket_orders')
        .select('id, order_number, event_id, full_name, whatsapp, quantity, total_price, payment_amount, status')
        .eq('id', body.order_id).maybeSingle();
      if (orderError || !order) return json({ error: 'Order tidak ditemukan.' }, 404);
      if (!await hasEventScope(order.event_id, 'admin_ticket')) return json({ error: 'Event di luar scope akun ini.' }, 403);

      let qrTokens: Array<{ hash: string; ciphertext: string }> = [];
      if (body.resolution === 'Lunas') {
        qrTokens = await Promise.all(Array.from({ length: order.quantity }, async () => {
          const token = randomToken();
          return { hash: await sha256(token), ciphertext: await encryptSecret(token, encryptionKey) };
        }));
      }

      let codeHash: string | null = null;
      let phoneCodeHash: string | null = null;
      let codeCiphertext: string | null = null;
      let resolutionData: unknown = null;
      let resolutionError: { message: string } | null = null;
      const normalizedPhone = normalizeWhatsapp(order.whatsapp);
      const { data: priorCodes } = body.resolution === 'Lunas'
        ? await serviceClient.from('ticket_access_codes').select('whatsapp_code_hash').eq('whatsapp_normalized', normalizedPhone)
        : { data: [] };
      const usedCodeHashes = new Set((priorCodes ?? []).map((entry) => entry.whatsapp_code_hash));

      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (body.resolution === 'Lunas') {
          const code = createAccessCode();
          phoneCodeHash = await whatsappAccessCodeHash(normalizedPhone, code, accessCodePepper);
          if (usedCodeHashes.has(phoneCodeHash)) continue;
          codeHash = await accessCodeHash(order.event_id, normalizedPhone, code, accessCodePepper);
          codeCiphertext = await encryptSecret(code, encryptionKey);
        }
        const result = await serviceClient.rpc('resolve_ticket_order_payment', {
          p_order_id: order.id,
          p_resolution: body.resolution,
          p_actor_id: authData.user.id,
          p_access_code_hash: codeHash,
          p_whatsapp_code_hash: phoneCodeHash,
          p_access_code_ciphertext: codeCiphertext,
          p_qr_tokens: qrTokens,
        });
        resolutionData = result.data;
        resolutionError = result.error;
        if (!resolutionError || body.resolution !== 'Lunas' || !resolutionError.message.includes('Access Code sudah pernah digunakan')) break;
      }
      if (resolutionError) return json({ error: resolutionError.message }, 400);
      const result = Array.isArray(resolutionData) ? resolutionData[0] : resolutionData;
      if (body.resolution === 'Ditolak') return json({ status: 'Ditolak' });
      if (!ticketPageUrl) return json({ error: 'Domain halaman tiket tidak dapat ditentukan dari request.' }, 500);
      const { data: codeRecord, error: codeError } = await serviceClient.from('ticket_access_codes')
        .select('access_code_ciphertext, last_sent_at, send_count').eq('id', result.resolved_access_code_id).maybeSingle();
      if (codeError || !codeRecord) return json({ error: 'Order lunas, tetapi Kode Akses belum dapat dibaca untuk pengiriman.' }, 500);
      const accessCode = await decryptSecret(codeRecord.access_code_ciphertext, encryptionKey);
      const { data: event } = await serviceClient.from('events').select('title').eq('id', order.event_id).maybeSingle();
      return json({
        status: 'Lunas',
        access_code_id: result.resolved_access_code_id,
        access_code: accessCode,
        last_sent_at: codeRecord.last_sent_at,
        send_count: codeRecord.send_count,
        whatsapp_url: whatsappUrl(order.whatsapp, accessMessage(order.full_name, event?.title ?? 'Event', order.order_number ?? order.id, accessCode, ticketPageUrl)),
        ticket_count: result.issued_ticket_count,
      });
    }

    if (body.action === 'resend-access-code') {
      if (!encryptionKey || !body.order_id || (!isAdmin && !isTicketAdmin)) return json({ error: 'Akses resend ditolak.' }, 403);
      const ticketPageUrl = getTicketPageUrl(request.headers.get('origin'));
      if (!ticketPageUrl) return json({ error: 'Domain halaman tiket tidak dapat ditentukan dari request.' }, 400);
      const { data: order } = await serviceClient.from('ticket_orders')
        .select('id, order_number, event_id, full_name, whatsapp, status, access_code_id')
        .eq('id', body.order_id).maybeSingle();
      if (!order || order.status !== 'Lunas' || !order.access_code_id) return json({ error: 'Order belum memiliki Access Code aktif.' }, 409);
      if (!await hasEventScope(order.event_id, 'admin_ticket')) return json({ error: 'Event di luar scope akun ini.' }, 403);
      const { data: codeRecord } = await serviceClient.from('ticket_access_codes')
        .select('access_code_ciphertext, status, last_sent_at, send_count').eq('id', order.access_code_id).maybeSingle();
      if (!codeRecord || codeRecord.status !== 'active') return json({ error: 'Access Code sudah tidak aktif.' }, 410);
      const accessCode = await decryptSecret(codeRecord.access_code_ciphertext, encryptionKey);
      const { data: event } = await serviceClient.from('events').select('title').eq('id', order.event_id).maybeSingle();
      return json({ access_code_id: order.access_code_id, access_code: accessCode, whatsapp_url: whatsappUrl(order.whatsapp, accessMessage(order.full_name, event?.title ?? 'Event', order.order_number ?? order.id, accessCode, ticketPageUrl)), last_sent_at: codeRecord.last_sent_at, send_count: codeRecord.send_count });
    }

    if (body.action === 'mark-access-code-sent') {
      if (!body.access_code_id || (!isAdmin && !isTicketAdmin)) return json({ error: 'Akses pencatatan pengiriman ditolak.' }, 403);
      const { data: code } = await serviceClient.from('ticket_access_codes').select('id, event_id, status').eq('id', body.access_code_id).maybeSingle();
      if (!code || code.status !== 'active') return json({ error: 'Access Code tidak aktif.' }, 410);
      if (!await hasEventScope(code.event_id, 'admin_ticket')) return json({ error: 'Event di luar scope akun ini.' }, 403);
      const { data, error } = await serviceClient.rpc('mark_ticket_access_code_sent', { p_access_code_id: code.id, p_actor_id: authData.user.id });
      if (error) return json({ error: error.message }, 400);
      const result = Array.isArray(data) ? data[0] : data;
      return json({ marked_sent: true, last_sent_at: result?.last_sent_at, send_count: result?.send_count });
    }

    if (body.action === 'check-in') {
      if (!body.event_id || !body.qr_token || (!isAdmin && !isQrScanner)) return json({ error: 'Akses scanner ditolak.' }, 403);
      const { data, error } = await userClient.rpc('check_in_ticket', {
        p_event_id: body.event_id,
        p_qr_token_hash: await sha256(body.qr_token),
      });
      if (error) return json({ error: error.message }, 403);
      return json(data as Record<string, unknown>);
    }

    if (body.action === 'manual-check-in') {
      if (!body.event_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.event_id)
        || !body.order_number?.trim() || (!isAdmin && !isQrScanner)) {
        return json({ error: 'Event dan nomor order wajib valid.' }, 400);
      }
      if (!await hasEventScope(body.event_id, 'admin_qr')) return json({ error: 'Event di luar scope Admin QR.' }, 403);
      if (!encryptionKey) return json({ error: 'Secret Ticketing belum dikonfigurasi.' }, 500);

      const { data: order, error: orderError } = await serviceClient.from('ticket_orders')
        .select('id').eq('event_id', body.event_id).eq('order_number', body.order_number.trim()).maybeSingle();
      if (orderError) return json({ error: 'Order tiket gagal dimuat.' }, 500);
      if (!order) return json({ error: 'Order tidak ditemukan untuk Event ini.' }, 404);

      const { data: tickets, error: ticketsError } = await fetchAllPages((from, to) => serviceClient.from('ticket_instances')
        .select('qr_token_ciphertext, status, checked_in_at, sequence_no')
        .eq('event_id', body.event_id).eq('ticket_order_id', order.id)
        .order('sequence_no', { ascending: true }).range(from, to));
      if (ticketsError) return json({ error: 'Tiket order gagal dimuat.' }, 500);
      const candidates = (tickets ?? []).filter((ticket) => ticket.status === 'active' && !ticket.checked_in_at);
      if (!candidates.length) return json({ ok: false, status: 'already_used', message: 'Semua tiket pada order ini sudah digunakan atau tidak aktif.' });

      for (const ticket of candidates) {
        const qrToken = await decryptSecret(ticket.qr_token_ciphertext, encryptionKey);
        const { data, error } = await userClient.rpc('check_in_ticket', {
          p_event_id: body.event_id,
          p_qr_token_hash: await sha256(qrToken),
        });
        if (error) return json({ error: error.message }, 403);
        const checkInResult = data as Record<string, unknown>;
        if (checkInResult.status !== 'already_used') return json(checkInResult);
      }
      return json({ ok: false, status: 'already_used', message: 'Semua tiket pada order ini sudah digunakan.' });
    }

    if (body.action === 'scanner-summary') {
      if (body.scope_role !== undefined && body.scope_role !== 'admin_qr' && body.scope_role !== 'admin_ticket') {
        return json({ error: 'Scope ringkasan tiket tidak valid.' }, 400);
      }
      const scopeRole = body.scope_role ?? (isQrScanner ? 'admin_qr' : 'admin_ticket');
      if (!isAdmin && !(scopeRole === 'admin_qr' ? isQrScanner : isTicketAdmin)) {
        return json({ error: 'Akses ringkasan tiket ditolak.' }, 403);
      }
      let scopedEventIds: string[] | null = null;
      if (!isAdmin) {
        const { data: scopes, error: scopeError } = await serviceClient.from('admin_event_scopes')
          .select('event_id, scope_all').eq('user_id', authData.user.id).eq('role', scopeRole);
        if (scopeError) return json({ error: 'Scope Event scanner gagal dimuat.' }, 500);
        if (scopes?.some((scope) => scope.scope_all)) scopedEventIds = null;
        else scopedEventIds = [...new Set((scopes ?? []).map((scope) => scope.event_id).filter((id): id is string => Boolean(id)))];
      }
      const scopedEvents: Array<{ id: string; title: string; date: string; status: string }> = [];
      const summaryEventChunks = scopedEventIds === null ? [null] : chunkValues(scopedEventIds);
      for (const ids of summaryEventChunks) {
        const { data, error } = await fetchAllPages((from, to) => {
          let eventQuery = serviceClient.from('events').select('id, title, date, status')
            .order('date', { ascending: true }).order('id', { ascending: true });
          if (ids) eventQuery = eventQuery.in('id', ids);
          return eventQuery.range(from, to);
        });
        if (error) return json({ error: 'Event scanner gagal dimuat.' }, 500);
        scopedEvents.push(...(data ?? []));
      }
      scopedEvents.sort((first, second) => first.date.localeCompare(second.date));
      const eventIds = (scopedEvents ?? []).map((event) => event.id);
      const instances: Array<{ id: string; event_id: string; status: string; checked_in_at: string | null }> = [];
      for (const ids of chunkValues(eventIds)) {
        const { data, error } = await fetchAllPages((from, to) => serviceClient.from('ticket_instances')
          .select('id, event_id, status, checked_in_at').in('event_id', ids).order('id', { ascending: true }).range(from, to));
        if (error) return json({ error: 'Statistik tiket gagal dimuat.' }, 500);
        instances.push(...(data ?? []));
      }
      const byEvent = new Map<string, { total: number; checked_in: number }>();
      (instances ?? []).forEach((ticket) => {
        if (ticket.status !== 'active' && !ticket.checked_in_at) return;
        const counts = byEvent.get(ticket.event_id) ?? { total: 0, checked_in: 0 };
        counts.total += 1;
        if (ticket.checked_in_at) counts.checked_in += 1;
        byEvent.set(ticket.event_id, counts);
      });
      const eventSummaries = (scopedEvents ?? []).map((event) => ({ ...event, ...(byEvent.get(event.id) ?? { total: 0, checked_in: 0 }) }));
      let attendees: Array<{
        full_name: string;
        order_number: string | null;
        sequence_no: number;
        checked_in_at: string | null;
      }> = [];
      if (body.event_id) {
        const selectedEvent = scopedEvents.find((event) => event.id === body.event_id);
        if (!selectedEvent) return json({ error: 'Event di luar scope Admin QR atau tidak ditemukan.' }, 403);
        const { data: paidOrders, error: paidOrdersError } = await fetchAllPages((from, to) => serviceClient.from('ticket_orders')
          .select('id, order_number, full_name')
          .eq('event_id', selectedEvent.id).eq('status', 'Lunas')
          .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to));
        if (paidOrdersError) return json({ error: 'Daftar order lunas gagal dimuat.' }, 500);
        const orderIds = (paidOrders ?? []).map((order) => order.id);
        const attendeeTickets: Array<{ ticket_order_id: string; sequence_no: number; status: string; checked_in_at: string | null }> = [];
        for (const ids of chunkValues(orderIds)) {
          const { data, error } = await fetchAllPages((from, to) => serviceClient.from('ticket_instances')
            .select('ticket_order_id, sequence_no, status, checked_in_at')
            .eq('event_id', selectedEvent.id).in('ticket_order_id', ids)
            .order('ticket_order_id', { ascending: true }).order('sequence_no', { ascending: true }).range(from, to));
          if (error) return json({ error: 'Daftar tiket Event gagal dimuat.' }, 500);
          attendeeTickets.push(...(data ?? []));
        }
        const ordersById = new Map((paidOrders ?? []).map((order) => [order.id, order]));
        attendees = attendeeTickets
          .filter((ticket) => ticket.status === 'active' || ticket.checked_in_at)
          .flatMap((ticket) => {
            const order = ordersById.get(ticket.ticket_order_id);
            return order ? [{
              full_name: order.full_name,
              order_number: order.order_number,
              sequence_no: ticket.sequence_no,
              checked_in_at: ticket.checked_in_at,
            }] : [];
          });
      }
      return json({
        events: eventSummaries,
        total_tickets: eventSummaries.reduce((sum, event) => sum + event.total, 0),
        checked_in: eventSummaries.reduce((sum, event) => sum + event.checked_in, 0),
        not_checked_in: eventSummaries.reduce((sum, event) => sum + event.total - event.checked_in, 0),
        attendees,
      });
    }

    return json({ error: 'Action Admin Ticketing tidak dikenal.' }, 400);
  } catch (error) {
    console.error('ticketing-admin failed', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: error instanceof Error ? error.message : 'Operasi Ticketing gagal.' }, 400);
  }
});