import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { chunkValues, fetchAllPages } from '../_shared/pagination.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type RequestBody = {
  event_id?: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function hasRole(metadata: Record<string, unknown> | undefined, role: string) {
  if (!metadata) return false;
  return [metadata.role, metadata.roles, metadata.user_roles].some((candidate) => typeof candidate === 'string'
    ? candidate.trim().toLowerCase() === role
    : Array.isArray(candidate) && candidate.some((entry) => typeof entry === 'string' && entry.trim().toLowerCase() === role));
}

function maskWhatsapp(number: string) {
  const digits = number.replace(/\D/g, '');
  if (digits.length <= 4) return '••••';
  return `${digits.slice(0, 2)}${'•'.repeat(Math.max(2, digits.length - 4))}${digits.slice(-2)}`;
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return json({ error: 'Sesi Admin tidak valid.' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: 'Sesi Admin tidak valid.' }, 401);

  const metadata = authData.user.app_metadata as Record<string, unknown> | undefined;
  const isAdmin = hasRole(metadata, 'admin');
  if (!isAdmin && !hasRole(metadata, 'admin_qr')) return json({ error: 'Akses laporan check-in ditolak.' }, 403);

  let body: RequestBody;
  try {
    const parsed: unknown = await request.json();
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ error: 'Data permintaan tidak valid.' }, 400);
    }
    body = parsed as RequestBody;
  } catch {
    return json({ error: 'Data permintaan tidak valid.' }, 400);
  }

  if (body.event_id !== undefined && (typeof body.event_id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.event_id))) {
    return json({ error: 'Event yang dipilih tidak valid.' }, 400);
  }

  try {
    const { data: scopes, error: scopeError } = isAdmin
      ? { data: [], error: null }
      : await serviceClient.from('admin_event_scopes')
        .select('event_id, scope_all')
        .eq('user_id', authData.user.id)
        .eq('role', 'admin_qr');
    if (scopeError) return json({ error: 'Scope Event laporan gagal dimuat.' }, 500);

    const allEventsAllowed = isAdmin || (scopes?.some((scope) => scope.scope_all) ?? false);
    const scopedEventIds = [...new Set((scopes ?? [])
      .map((scope) => scope.event_id)
      .filter((id): id is string => Boolean(id)))];
    const scopedEvents: Array<{ id: string; title: string; date: string; venue: string }> = [];

    if (allEventsAllowed || scopedEventIds.length > 0) {
      const eventIdChunks: Array<string[] | null> = allEventsAllowed ? [null] : chunkValues(scopedEventIds);
      for (const ids of eventIdChunks) {
        const { data, error } = await fetchAllPages((from, to) => {
          let query = serviceClient.from('events').select('id, title, date, venue')
            .order('date', { ascending: true }).order('id', { ascending: true });
          if (ids) query = query.in('id', ids);
          return query.range(from, to);
        });
        if (error) return json({ error: 'Event dalam scope laporan gagal dimuat.' }, 500);
        scopedEvents.push(...(data ?? []));
      }
    }

    scopedEvents.sort((first, second) => first.date.localeCompare(second.date));
    if (body.event_id && !scopedEvents.some((event) => event.id === body.event_id)) {
      return json({ error: 'Event tidak ditemukan atau berada di luar scope Admin QR Scanner.' }, 403);
    }

    const requestedEvents = body.event_id
      ? scopedEvents.filter((event) => event.id === body.event_id)
      : scopedEvents;
    const requestedEventIds = scopedEvents.map((event) => event.id);
    const paidOrders: Array<{
      id: string;
      event_id: string;
      ticket_category: string;
      full_name: string;
      whatsapp: string;
    }> = [];

    for (const ids of chunkValues(requestedEventIds)) {
      const { data, error } = await fetchAllPages((from, to) => serviceClient.from('ticket_orders')
        .select('id, event_id, ticket_category, full_name, whatsapp')
        .eq('status', 'Lunas')
        .in('event_id', ids)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to));
      if (error) return json({ error: 'Order lunas untuk laporan gagal dimuat.' }, 500);
      paidOrders.push(...(data ?? []));
    }

    const paidOrdersById = new Map(paidOrders.map((order) => [order.id, order]));
    const paidOrderIds = paidOrders.map((order) => order.id);
    const ticketInstances: Array<{
      event_id: string;
      ticket_order_id: string;
      event_ticket_id: string | null;
      status: string;
      checked_in_at: string | null;
    }> = [];

    for (const ids of chunkValues(paidOrderIds)) {
      const { data, error } = await fetchAllPages((from, to) => serviceClient.from('ticket_instances')
        .select('event_id, ticket_order_id, event_ticket_id, status, checked_in_at')
        .in('ticket_order_id', ids)
        .order('id', { ascending: true })
        .range(from, to));
      if (error) return json({ error: 'Data tiket individual untuk laporan gagal dimuat.' }, 500);
      ticketInstances.push(...(data ?? []));
    }

    const sellableTickets = ticketInstances.filter((ticket) => {
      const order = paidOrdersById.get(ticket.ticket_order_id);
      return order?.event_id === ticket.event_id && (ticket.status === 'active' || ticket.status === 'expired' || Boolean(ticket.checked_in_at));
    });
    const countsByEvent = new Map<string, { tickets_sold: number; checked_in: number }>();
    sellableTickets.forEach((ticket) => {
      const counts = countsByEvent.get(ticket.event_id) ?? { tickets_sold: 0, checked_in: 0 };
      counts.tickets_sold += 1;
      if (ticket.checked_in_at) counts.checked_in += 1;
      countsByEvent.set(ticket.event_id, counts);
    });

    const events = requestedEvents.map((event) => {
      const counts = countsByEvent.get(event.id) ?? { tickets_sold: 0, checked_in: 0 };
      const notCheckedIn = counts.tickets_sold - counts.checked_in;
      return {
        ...event,
        ...counts,
        not_checked_in: notCheckedIn,
        attendance_percent: counts.tickets_sold ? (counts.checked_in / counts.tickets_sold) * 100 : 0,
      };
    });

    const tickets = body.event_id
      ? sellableTickets.flatMap((ticket) => {
        if (ticket.event_id !== body.event_id) return [];
        const order = paidOrdersById.get(ticket.ticket_order_id);
        if (!order) return [];
        return [{
          full_name: order.full_name,
          whatsapp: maskWhatsapp(order.whatsapp),
          ticket_category: order.ticket_category,
          status: ticket.checked_in_at ? 'Hadir' : 'Belum Hadir',
        }];
      })
      : [];

    return json({ events, available_events: scopedEvents, tickets });
  } catch (error) {
    console.error('ticketing-check-in-report failed', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'Laporan check-in gagal diproses.' }, 500);
  }
});
