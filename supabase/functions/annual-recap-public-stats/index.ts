import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { chunkValues, fetchAllPages } from '../_shared/pagination.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type RequestBody = { year?: unknown; admin_preview?: unknown };
type EventRow = { id: string; date: string };
type PaidOrder = { id: string; event_id: string; quantity: number };
type TicketInstance = { event_id: string; ticket_order_id: string; status: string; checked_in_at: string | null };

function json(body: Record<string, unknown>, status = 200, privateResponse = false) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': privateResponse || status >= 400 ? 'no-store' : 'public, max-age=300',
    },
  });
}

function hasRole(metadata: Record<string, unknown> | undefined, role: string) {
  if (!metadata) return false;
  return [metadata.role, metadata.roles, metadata.user_roles].some((candidate) => typeof candidate === 'string'
    ? candidate.trim().toLowerCase() === role
    : Array.isArray(candidate) && candidate.some((entry) => typeof entry === 'string' && entry.trim().toLowerCase() === role));
}

function getJakartaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

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

  if (body.admin_preview !== undefined && typeof body.admin_preview !== 'boolean') {
    return json({ error: 'Mode preview admin tidak valid.' }, 400);
  }
  const adminPreview = body.admin_preview === true;

  const currentYear = Number(getJakartaDate().slice(0, 4));
  if (typeof body.year !== 'number' || !Number.isInteger(body.year) || body.year < 1900 || body.year > currentYear) {
    return json({ error: 'Tahun recap tidak valid.' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Konfigurasi Annual Recap belum tersedia.' }, 500);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  if (adminPreview) {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return json({ error: 'Sesi Admin tidak valid.' }, 401);
    if (!anonKey) return json({ error: 'Konfigurasi autentikasi Annual Recap belum tersedia.' }, 500);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: 'Sesi Admin tidak valid.' }, 401);
    const metadata = authData.user.app_metadata as Record<string, unknown> | undefined;
    if (!hasRole(metadata, 'admin')) return json({ error: 'Preview statistik draft hanya tersedia untuk Admin.' }, 403);
  }

  const fromDate = `${body.year}-01-01`;
  const yearEnd = `${body.year + 1}-01-01`;
  const untilDate = body.year === currentYear ? getJakartaDate() : yearEnd;

  try {
    let recapQuery = serviceClient.from('annual_recaps').select('year').eq('year', body.year);
    if (!adminPreview) recapQuery = recapQuery.eq('published', true);
    const { data: recap, error: recapError } = await recapQuery.maybeSingle();
    if (recapError) return json({ error: 'Status publikasi recap gagal dimuat.' }, 500, adminPreview);
    if (!recap) return json({ error: 'Annual Recap tidak tersedia.' }, 404, adminPreview);

    const { data: eventRows, error: eventError } = await fetchAllPages((from, to) => serviceClient
      .from('events')
      .select('id, date')
      .eq('published', true)
      .neq('status', 'cancelled')
      .gte('date', fromDate)
      .lt('date', untilDate)
      .order('date', { ascending: true })
      .range(from, to));
    if (eventError) return json({ error: 'Data Event gagal dimuat.' }, 500, adminPreview);

    const events = (eventRows ?? []) as EventRow[];
    const eventIds = events.map((event) => event.id);
    if (eventIds.length === 0) return json({ year: body.year, totalTicketsSold: 0, events: [] }, 200, adminPreview);

    const paidOrders: PaidOrder[] = [];
    for (const ids of chunkValues(eventIds)) {
      const { data, error } = await fetchAllPages((from, to) => serviceClient
        .from('ticket_orders')
        .select('id, event_id, quantity')
        .in('status', ['Lunas', 'Terverifikasi', 'Selesai'])
        .in('event_id', ids)
        .order('id', { ascending: true })
        .range(from, to));
      if (error) return json({ error: 'Data tiket gagal dimuat.' }, 500, adminPreview);
      paidOrders.push(...((data ?? []) as PaidOrder[]));
    }

    const orderEventById = new Map(paidOrders.map((order) => [order.id, order.event_id]));
    const ticketsSoldByEvent = new Map<string, number>();
    const ordersWithoutInstances = new Set(paidOrders.map((order) => order.id));
    for (const orderIds of chunkValues(paidOrders.map((order) => order.id))) {
      const { data, error } = await fetchAllPages((from, to) => serviceClient
        .from('ticket_instances')
        .select('event_id, ticket_order_id, status, checked_in_at')
        .in('ticket_order_id', orderIds)
        .order('id', { ascending: true })
        .range(from, to));
      if (error) return json({ error: 'Data tiket terjual gagal dimuat.' }, 500, adminPreview);

      ((data ?? []) as TicketInstance[]).forEach((ticket) => {
        if (orderEventById.get(ticket.ticket_order_id) !== ticket.event_id) return;
        ordersWithoutInstances.delete(ticket.ticket_order_id);
        if (ticket.status === 'active' || ticket.status === 'expired' || ticket.checked_in_at) {
          ticketsSoldByEvent.set(ticket.event_id, (ticketsSoldByEvent.get(ticket.event_id) ?? 0) + 1);
        }
      });
    }

    paidOrders.forEach((order) => {
      if (!ordersWithoutInstances.has(order.id)) return;
      ticketsSoldByEvent.set(order.event_id, (ticketsSoldByEvent.get(order.event_id) ?? 0) + order.quantity);
    });

    const eventStats = events.map((event) => ({ eventId: event.id, ticketsSold: ticketsSoldByEvent.get(event.id) ?? 0 }));
    return json({
      year: body.year,
      totalTicketsSold: eventStats.reduce((total, event) => total + event.ticketsSold, 0),
      events: eventStats,
    }, 200, adminPreview);
  } catch (error) {
    console.error('annual-recap-public-stats failed', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'Statistik Annual Recap gagal diproses.' }, 500);
  }
});