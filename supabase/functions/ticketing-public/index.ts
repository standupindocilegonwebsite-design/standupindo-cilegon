import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { accessCodeHash, decryptSecret, normalizeWhatsapp, randomToken, sha256 } from '../_shared/ticketing.ts';
import { chunkValues, fetchAllPages } from '../_shared/pagination.ts';
import { MIDTRANS_MERCHANT_ID, MIDTRANS_SNAP_API_URL, MIDTRANS_STATUS_API_BASE_URL } from '../_shared/midtrans.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const PROOF_BUCKET = 'ticket-payment-proofs';

type RequestBody = {
  action?: string;
  order_number?: string;
  event_id?: string;
  ticket_id?: string;
  order_id?: string;
  full_name?: string;
  email?: string;
  whatsapp?: string;
  quantity?: number;
  notes?: string;
  voucher_code?: string;
  payment_channel?: 'manual' | 'midtrans';
  payment_amount?: number;
  proof_path?: string;
  file_name?: string;
  file_type?: string;
  session_token?: string;
  access_code?: string;
  device_tag?: string;
  replace_existing?: boolean;
};

type PublicTicketAvailability = {
  id: string;
  quota: number | null;
};

type TicketOrderReservation = {
  ticket_id: string;
  quantity: number;
  status: string;
  expires_at: string | null;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function constantTimeEquals(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function sha512(value: string) {
  const digest = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const encryptionKey = Deno.env.get('TICKET_ACCESS_CODE_ENCRYPTION_KEY');
  const accessCodePepper = Deno.env.get('TICKET_ACCESS_CODE_PEPPER');
  const rateLimitPepper = Deno.env.get('TICKET_ACCESS_RATE_LIMIT_PEPPER');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Konfigurasi Ticketing server belum lengkap.' }, 500);

  const authorization = request.headers.get('Authorization');
  const publicClient = createClient(supabaseUrl, anonKey, authorization ? { global: { headers: { Authorization: authorization } } } : undefined);
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  let body: RequestBody;
  try { body = await request.json(); } catch { return json({ error: 'Data permintaan tidak valid.' }, 400); }

  try {
    if (body.action === 'ticket-availability') {
      if (!body.event_id) return json({ error: 'Event wajib dipilih.' }, 400);

      const { data: event, error: eventError } = await serviceClient.from('events')
        .select('id').eq('id', body.event_id).eq('published', true).eq('status', 'upcoming').maybeSingle();
      if (eventError) return json({ error: 'Status ketersediaan tiket gagal diperiksa.' }, 500);
      if (!event) return json({ error: 'Event tidak menerima pemesanan tiket.' }, 404);

      const { data: tickets, error: ticketError } = await serviceClient.from('event_tickets')
        .select('id, quota').eq('event_id', event.id).eq('status', 'active').eq('available_public', true);
      if (ticketError) return json({ error: 'Status ketersediaan tiket gagal diperiksa.' }, 500);

      const limitedTickets = (tickets ?? []) as PublicTicketAvailability[];
      const limitedTicketIds = limitedTickets.filter((ticket) => ticket.quota !== null).map((ticket) => ticket.id);
      const quantitiesByTicket = new Map<string, { confirmed: number; reserved: number }>();
      const confirmedStatuses = new Set(['Lunas', 'Terverifikasi', 'Selesai']);
      const reservationStatuses = ['Draft Pembayaran', 'Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar'];
      const now = Date.now();

      for (const ticketIds of chunkValues(limitedTicketIds)) {
        const { data: orders, error: orderError } = await fetchAllPages((from, to) => serviceClient.from('ticket_orders')
          .select('ticket_id, quantity, status, expires_at')
          .in('ticket_id', ticketIds)
          .in('status', [...reservationStatuses, ...confirmedStatuses])
          .range(from, to));
        if (orderError) return json({ error: 'Status ketersediaan tiket gagal diperiksa.' }, 500);

        for (const order of (orders ?? []) as TicketOrderReservation[]) {
          const counts = quantitiesByTicket.get(order.ticket_id) ?? { confirmed: 0, reserved: 0 };
          if (confirmedStatuses.has(order.status)) {
            counts.confirmed += order.quantity;
          } else if (!order.expires_at || new Date(order.expires_at).getTime() > now) {
            counts.reserved += order.quantity;
          }
          quantitiesByTicket.set(order.ticket_id, counts);
        }
      }

      const availability = limitedTickets.map((ticket) => {
        if (ticket.quota === null) {
          return { ticket_id: ticket.id, sold_out: false, temporarily_unavailable: false, remaining_tickets: null };
        }
        const counts = quantitiesByTicket.get(ticket.id) ?? { confirmed: 0, reserved: 0 };
        return {
          ticket_id: ticket.id,
          sold_out: counts.confirmed >= ticket.quota,
          temporarily_unavailable: counts.confirmed < ticket.quota && counts.confirmed + counts.reserved >= ticket.quota,
          remaining_tickets: Math.max(0, ticket.quota - counts.confirmed - counts.reserved),
        };
      });
      return json({ availability });
    }

    if (body.action === 'create-order') {
      if (!body.order_number || !body.event_id || !body.ticket_id || !body.full_name || !body.email || !body.whatsapp || !body.quantity) {
        return json({ error: 'Lengkapi Event, tiket, nama, email, WhatsApp, dan jumlah tiket.' }, 400);
      }
      const { data, error } = await publicClient.rpc('create_ticket_order_priced_with_payment', {
        p_order_number: body.order_number,
        p_event_id: body.event_id,
        p_ticket_id: body.ticket_id,
        p_full_name: body.full_name,
        p_email: body.email ?? null,
        p_whatsapp: body.whatsapp,
        p_quantity: body.quantity,
        p_notes: body.notes ?? null,
        p_voucher_code: body.voucher_code ?? null,
        p_payment_channel: body.payment_channel ?? 'manual',
      });
      if (error || !data) return json({ error: error?.message ?? 'Order gagal dibuat.' }, 400);
      return json({
        order_id: data.id,
        order_number: data.order_number,
        total_price: data.total_price,
        price_breakdown: data.price_breakdown,
      });
    }

    if (body.action === 'create-midtrans-transaction') {
      if (!body.order_id || !body.whatsapp) return json({ error: 'Order dan nomor WhatsApp wajib diisi.' }, 400);
      const serverKey = Deno.env.get('MIDTRANS_SECRET_KEY');
      if (!serverKey) return json({ error: 'Konfigurasi Midtrans Sandbox belum lengkap.' }, 503);

      const { data: order, error: orderError } = await serviceClient.from('ticket_orders')
        .select('id, order_number, event_id, ticket_id, full_name, email, whatsapp, ticket_category, quantity, total_price, status, expires_at, payment_channel, payment_mode_snapshot')
        .eq('id', body.order_id).maybeSingle();
      if (orderError || !order || normalizeWhatsapp(body.whatsapp) !== order.whatsapp) {
        return json({ error: 'Order tidak ditemukan untuk nomor tersebut.' }, 404);
      }
      if (order.payment_channel !== 'midtrans' || !['midtrans', 'both'].includes(order.payment_mode_snapshot)) {
        return json({ error: 'Order ini tidak menggunakan pembayaran Midtrans.' }, 409);
      }
      if (!Number.isInteger(order.total_price) || order.total_price <= 0) {
        return json({ error: 'Nominal order tidak dapat diproses melalui Midtrans.' }, 409);
      }
      if (order.status !== 'Menunggu Pembayaran' || !order.expires_at || new Date(order.expires_at).getTime() <= Date.now()) {
        return json({ error: 'Batas pembayaran order sudah berakhir.' }, 410);
      }
      const { data: event, error: eventError } = await serviceClient.from('events')
        .select('slug').eq('id', order.event_id).maybeSingle();
      if (eventError || !event || !order.ticket_id) return json({ error: 'Event order tidak ditemukan.' }, 404);

      const providerOrderId = `SIC-${order.id.replaceAll('-', '')}`;
      const { data: existingTransaction, error: transactionLoadError } = await serviceClient.from('ticket_midtrans_transactions')
        .select('id, provider_order_id, snap_token, redirect_url, transaction_status, allocation_status, expires_at, updated_at')
        .eq('ticket_order_id', order.id).maybeSingle();
      if (transactionLoadError) return json({ error: 'Transaksi pembayaran gagal dimuat.' }, 500);
      if (existingTransaction?.allocation_status === 'issued') return json({ error: 'Pembayaran order sudah berhasil.' }, 409);
      if (existingTransaction?.allocation_status === 'needs_admin_review') return json({ error: 'Transaksi order sedang diperiksa Admin.' }, 409);
      if (existingTransaction?.snap_token && existingTransaction.expires_at
        && new Date(existingTransaction.expires_at).getTime() > Date.now()) {
        return json({ token: existingTransaction.snap_token, redirect_url: existingTransaction.redirect_url });
      }
      if (existingTransaction?.transaction_status === 'creating'
        && Date.now() - new Date(existingTransaction.updated_at).getTime() < 90_000) {
        return json({ error: 'Checkout sedang disiapkan. Coba lagi sebentar.' }, 409);
      }

      if (existingTransaction && !existingTransaction.snap_token) {
        let priorStatusResponse: Response;
        try {
          priorStatusResponse = await fetch(
            `${MIDTRANS_STATUS_API_BASE_URL}/${encodeURIComponent(providerOrderId)}/status`,
            { headers: { Authorization: `Basic ${btoa(`${serverKey}:`)}`, Accept: 'application/json' }, signal: AbortSignal.timeout(5000) },
          );
        } catch {
          return json({ error: 'Status transaksi sebelumnya belum dapat dipastikan. Checkout tidak dibuat ulang demi mencegah pembayaran ganda.' }, 503);
        }
        if (priorStatusResponse.status !== 404) {
          if (!priorStatusResponse.ok) return json({ error: 'Status transaksi sebelumnya belum dapat diverifikasi.' }, 503);
          const priorStatus = await priorStatusResponse.json().catch(() => null) as {
            order_id?: string;
            transaction_id?: string;
            transaction_status?: string;
            status_code?: string;
            gross_amount?: string;
            merchant_id?: string;
            fraud_status?: string;
            payment_type?: string;
          } | null;
          if (!priorStatus || priorStatus.order_id !== providerOrderId || priorStatus.merchant_id !== MIDTRANS_MERCHANT_ID) {
            return json({ error: 'Identitas transaksi sebelumnya tidak cocok. Checkout tidak dibuat ulang.' }, 409);
          }
          const priorAmount = Number(priorStatus.gross_amount);
          const priorStatusName = priorStatus.transaction_status?.toLowerCase();
          const needsReview = !Number.isSafeInteger(priorAmount) || priorAmount !== order.total_price;
          await serviceClient.from('ticket_midtrans_transactions').update({
            provider_transaction_id: priorStatus.transaction_id ?? null,
            transaction_status: priorStatusName && ['creating', 'created', 'pending', 'capture', 'settlement', 'deny', 'cancel', 'expire', 'failure', 'refund', 'partial_refund', 'chargeback', 'partial_chargeback', 'authorize'].includes(priorStatusName) ? priorStatusName : 'failure',
            fraud_status: priorStatus.fraud_status ?? null,
            payment_type: priorStatus.payment_type ?? null,
            ...(needsReview ? { allocation_status: 'needs_admin_review', review_reason: 'Nominal transaksi provider tidak cocok setelah pembuatan checkout ambigu.' } : {}),
            updated_at: new Date().toISOString(),
          }).eq('id', existingTransaction.id);
          if (needsReview) return json({ error: 'Transaksi sebelumnya memiliki nominal tidak cocok dan perlu diperiksa Admin.' }, 409);
          if (priorStatus.status_code && priorStatus.gross_amount) {
            const signatureKey = await sha512(`${providerOrderId}${priorStatus.status_code}${priorStatus.gross_amount}${serverKey}`);
            await serviceClient.functions.invoke('midtrans-notification', {
              body: {
                order_id: providerOrderId,
                status_code: priorStatus.status_code,
                gross_amount: priorStatus.gross_amount,
                merchant_id: priorStatus.merchant_id,
                signature_key: signatureKey,
              },
            });
          }
          return json({ error: 'Transaksi sebelumnya sudah tercatat di Midtrans. Periksa status pesanan atau hubungi Admin sebelum mencoba pembayaran lagi.' }, 409);
        }
      }

      if (existingTransaction) {
        const { data, error } = await serviceClient.from('ticket_midtrans_transactions')
          .update({ transaction_status: 'creating', snap_token: null, redirect_url: null, updated_at: new Date().toISOString() })
          .eq('id', existingTransaction.id)
          .eq('provider_order_id', providerOrderId)
          .eq('transaction_status', existingTransaction.transaction_status)
          .eq('updated_at', existingTransaction.updated_at)
          .select('id').maybeSingle();
        if (error || !data) return json({ error: 'Checkout sedang diproses oleh permintaan lain.' }, 409);
      } else {
        const { error } = await serviceClient.from('ticket_midtrans_transactions').insert({
          ticket_order_id: order.id,
          provider_order_id: providerOrderId,
          gross_amount: order.total_price,
          currency: 'IDR',
          transaction_status: 'creating',
          expires_at: order.expires_at,
        });
        if (error) {
          if (error.code === '23505') return json({ error: 'Checkout sedang diproses oleh permintaan lain.' }, 409);
          return json({ error: 'Checkout Midtrans gagal disiapkan.' }, 500);
        }
      }

      const firstName = order.full_name.trim().split(/\s+/)[0] || order.full_name;
      const lastName = order.full_name.trim().split(/\s+/).slice(1).join(' ');
      const expiresAt = new Date();
      const startTime = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      }).format(expiresAt).replace('T', ' ');
      const remainingMinutes = Math.max(1, Math.floor((new Date(order.expires_at).getTime() - Date.now()) / 60_000));
      const requestBody = {
        transaction_details: { order_id: providerOrderId, gross_amount: order.total_price },
        item_details: [{ id: order.id, price: order.total_price, quantity: 1, name: `Tiket ${order.ticket_category} (${order.quantity})` }],
        customer_details: {
          first_name: firstName,
          ...(lastName ? { last_name: lastName } : {}),
          email: order.email,
          phone: order.whatsapp,
        },
        callbacks: {
          finish: `https://standupindocilegon.id/event/${encodeURIComponent(event.slug)}/tiket/${encodeURIComponent(order.ticket_id)}?midtransOrderId=${encodeURIComponent(order.id)}`,
        },
        expiry: { start_time: `${startTime} +0700`, unit: 'minute', duration: remainingMinutes },
        page_expiry: { duration: 15, unit: 'minutes' },
      };

      try {
        const response = await fetch(MIDTRANS_SNAP_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${serverKey}:`)}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(12000),
        });
        const result = await response.json().catch(() => null) as { token?: string; redirect_url?: string } | null;
        if (!response.ok || !result?.token || !result.redirect_url) {
          await serviceClient.from('ticket_midtrans_transactions')
            .update({ transaction_status: 'failure', updated_at: new Date().toISOString() })
            .eq('ticket_order_id', order.id)
            .eq('transaction_status', 'creating');
          console.error('Midtrans Snap token request failed', response.status);
          return json({ error: 'Checkout Midtrans belum dapat dibuat. Coba lagi sebelum batas pembayaran berakhir.' }, 502);
        }
        const { error: saveError } = await serviceClient.from('ticket_midtrans_transactions')
          .update({ snap_token: result.token, redirect_url: result.redirect_url, updated_at: new Date().toISOString() })
          .eq('ticket_order_id', order.id);
        if (saveError) return json({ error: 'Checkout dibuat tetapi gagal disimpan. Silakan coba lagi.' }, 500);
        return json({ token: result.token, redirect_url: result.redirect_url });
      } catch (error) {
        await serviceClient.from('ticket_midtrans_transactions')
          .update({ transaction_status: 'failure', updated_at: new Date().toISOString() })
          .eq('ticket_order_id', order.id)
          .eq('transaction_status', 'creating');
        console.error('Midtrans Snap request failed', error instanceof Error ? error.message : 'Unknown error');
        return json({ error: 'Layanan pembayaran belum dapat dijangkau.' }, 502);
      }
    }

    if (body.action === 'midtrans-payment-status') {
      if (!body.order_id || !body.whatsapp) return json({ error: 'Order dan nomor WhatsApp wajib diisi.' }, 400);
      const { data: order, error: orderError } = await serviceClient.from('ticket_orders')
        .select('id, order_number, event_id, ticket_id, full_name, email, whatsapp, ticket_category, quantity, total_price, status, expires_at, payment_method_snapshot, payment_channel')
        .eq('id', body.order_id).maybeSingle();
      if (orderError || !order || normalizeWhatsapp(body.whatsapp) !== order.whatsapp) {
        return json({ error: 'Order tidak ditemukan untuk nomor tersebut.' }, 404);
      }
      if (order.payment_channel !== 'midtrans') return json({ error: 'Order ini bukan pembayaran Midtrans.' }, 409);
      const { data: transaction, error: transactionError } = await serviceClient.from('ticket_midtrans_transactions')
        .select('provider_order_id, gross_amount, transaction_status, allocation_status, review_reason, expires_at')
        .eq('ticket_order_id', order.id).maybeSingle();
      if (transactionError) return json({ error: 'Status transaksi gagal dimuat.' }, 500);
      if (transaction && ['pending', 'issued'].includes(transaction.allocation_status)) {
        const serverKey = Deno.env.get('MIDTRANS_SECRET_KEY');
        if (!serverKey) return json({ error: 'Kunci server Midtrans belum dikonfigurasi.' }, 503);
        let statusResponse: Response;
        try {
          statusResponse = await fetch(
            `${MIDTRANS_STATUS_API_BASE_URL}/${encodeURIComponent(transaction.provider_order_id)}/status`,
            { headers: { Authorization: `Basic ${btoa(`${serverKey}:`)}`, Accept: 'application/json' }, signal: AbortSignal.timeout(5000) },
          );
        } catch {
          return json({ error: 'Status pembayaran Midtrans tidak dapat dijangkau. Coba periksa lagi.' }, 503);
        }
        if (statusResponse.status === 401) {
          return json({ error: 'Kredensial Midtrans ditolak. Periksa Server Key dan mode Sandbox/Production di pengaturan Supabase.' }, 503);
        }
        if (statusResponse.status !== 404 && !statusResponse.ok) {
          return json({ error: 'Status API Midtrans gagal memverifikasi pembayaran.' }, 503);
        }
        if (statusResponse.ok) {
          const status = await statusResponse.json().catch(() => null) as {
            order_id?: string;
            status_code?: string;
            gross_amount?: string;
            merchant_id?: string;
          } | null;
          if (!status || status.order_id !== transaction.provider_order_id
            || status.merchant_id !== MIDTRANS_MERCHANT_ID || !status.status_code || !status.gross_amount) {
            return json({ error: 'Identitas transaksi dari Midtrans tidak cocok dengan order.' }, 502);
          }
          const signatureKey = await sha512(`${status.order_id}${status.status_code}${status.gross_amount}${serverKey}`);
          const { error: reconcileError } = await serviceClient.functions.invoke('midtrans-notification', {
            body: {
              order_id: status.order_id,
              status_code: status.status_code,
              gross_amount: status.gross_amount,
              merchant_id: status.merchant_id,
              signature_key: signatureKey,
            },
          });
          if (reconcileError) {
            console.error('Midtrans status reconciliation failed');
            return json({ error: 'Status Midtrans ditemukan, tetapi order belum berhasil disinkronkan. Coba lagi atau hubungi Admin.' }, 503);
          }
        }
      }
      const [{ data: refreshedOrder }, { data: refreshedTransaction }] = await Promise.all([
        serviceClient.from('ticket_orders')
          .select('id, order_number, event_id, ticket_id, full_name, email, whatsapp, ticket_category, quantity, total_price, status, expires_at, payment_method_snapshot, payment_channel')
          .eq('id', order.id).maybeSingle(),
        serviceClient.from('ticket_midtrans_transactions')
          .select('transaction_status, allocation_status, review_reason, expires_at')
          .eq('ticket_order_id', order.id).maybeSingle(),
      ]);
      return json({ order: refreshedOrder ?? order, transaction: refreshedTransaction ?? transaction ?? null });
    }

    if (body.action === 'order-payment') {
      if (!body.order_id || !body.whatsapp) return json({ error: 'Order dan nomor WhatsApp wajib diisi.' }, 400);
      const { data: order, error } = await serviceClient.from('ticket_orders')
        .select('id, order_number, event_id, full_name, email, whatsapp, ticket_category, quantity, total_price, status, expires_at, payment_method_snapshot')
        .eq('id', body.order_id).maybeSingle();
      if (error || !order || normalizeWhatsapp(body.whatsapp) !== order.whatsapp) return json({ error: 'Order tidak ditemukan untuk nomor tersebut.' }, 404);
      if (['Draft Pembayaran', 'Menunggu Pembayaran'].includes(order.status) && order.expires_at && new Date(order.expires_at).getTime() <= Date.now()) {
        await serviceClient.from('ticket_orders').update({ status: 'Expired', updated_at: new Date().toISOString() }).eq('id', order.id).in('status', ['Draft Pembayaran', 'Menunggu Pembayaran']);
        return json({ error: 'Batas pembayaran order sudah berakhir.', status: 'Expired' }, 410);
      }
      if (!['Draft Pembayaran', 'Menunggu Pembayaran'].includes(order.status) || !order.expires_at) {
        return json({ error: 'Batas pembayaran order sudah berakhir.' }, 410);
      }
      const { data: event } = await serviceClient.from('events').select('title, status').eq('id', order.event_id).maybeSingle();
      if (!event || event.status !== 'upcoming') return json({ error: 'Event tidak menerima pembayaran baru.' }, 409);
      return json({ order, event_title: event.title, payment: order.payment_method_snapshot });
    }

    if (body.action === 'recover-order') {
      if (!body.order_number?.trim() || !body.whatsapp || !body.event_id) return json({ error: 'Nomor order, WhatsApp, dan Event wajib diisi.' }, 400);
      const { data: order, error } = await serviceClient.from('ticket_orders')
        .select('id, order_number, event_id, full_name, email, whatsapp, ticket_category, quantity, total_price, status, expires_at, payment_method_snapshot')
        .eq('order_number', body.order_number.trim()).eq('event_id', body.event_id).maybeSingle();
      if (error || !order || normalizeWhatsapp(body.whatsapp) !== order.whatsapp) return json({ error: 'Order tidak ditemukan untuk nomor dan Event tersebut.' }, 404);

      if (['Draft Pembayaran', 'Menunggu Pembayaran'].includes(order.status) && order.expires_at && new Date(order.expires_at).getTime() <= Date.now()) {
        const { error: expireError } = await serviceClient.from('ticket_orders')
          .update({ status: 'Expired', updated_at: new Date().toISOString() }).eq('id', order.id).in('status', ['Draft Pembayaran', 'Menunggu Pembayaran']);
        if (expireError) return json({ error: 'Status masa pembayaran order gagal diperbarui.' }, 500);
        order.status = 'Expired';
      }
      const { data: event, error: eventError } = await serviceClient.from('events')
        .select('title, status').eq('id', order.event_id).maybeSingle();
      if (eventError || !event) return json({ error: 'Event order tidak ditemukan.' }, 404);
      if (['Draft Pembayaran', 'Menunggu Pembayaran'].includes(order.status) && event.status !== 'upcoming') {
        return json({ error: 'Event tidak lagi menerima pembayaran untuk order ini.' }, 409);
      }
      return json({ order, event_title: event.title, event_status: event.status });
    }

    if (body.action === 'create-proof-upload') {
      if (!body.order_id || !body.whatsapp || !body.file_name || !body.file_type) return json({ error: 'Data bukti pembayaran belum lengkap.' }, 400);
      const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
      if (!allowedTypes.has(body.file_type)) return json({ error: 'Gunakan file JPG, PNG, atau WEBP.' }, 400);
      const extension = body.file_type === 'image/png' ? 'png' : body.file_type === 'image/webp' ? 'webp' : 'jpg';
      const { data: order, error: orderError } = await serviceClient.from('ticket_orders')
        .select('id, whatsapp, status, expires_at').eq('id', body.order_id).maybeSingle();
      if (orderError || !order || normalizeWhatsapp(body.whatsapp) !== order.whatsapp) return json({ error: 'Order tidak ditemukan untuk nomor tersebut.' }, 404);
      if (!['Draft Pembayaran', 'Menunggu Pembayaran'].includes(order.status) || !order.expires_at || new Date(order.expires_at).getTime() <= Date.now()) return json({ error: 'Order sudah tidak menerima bukti pembayaran.' }, 409);
      const proofPath = `${order.id}/${crypto.randomUUID()}.${extension}`;
      const { data, error } = await serviceClient.storage.from(PROOF_BUCKET).createSignedUploadUrl(proofPath, { upsert: false });
      if (error || !data) return json({ error: 'Link upload bukti pembayaran gagal dibuat.' }, 500);
      return json({ path: proofPath, token: data.token, signed_url: data.signedUrl });
    }

    if (body.action === 'submit-payment') {
      if (!body.order_id || !body.whatsapp || body.payment_amount == null || !body.proof_path) return json({ error: 'Nominal dan bukti pembayaran wajib diisi.' }, 400);
      if (!body.proof_path.startsWith(`${body.order_id}/`)) return json({ error: 'Bukti pembayaran tidak sesuai order.' }, 400);
      const proofName = body.proof_path.split('/').at(-1);
      const { data: uploadedFiles, error: storageError } = await serviceClient.storage.from(PROOF_BUCKET).list(body.order_id);
      if (storageError || !uploadedFiles?.some((file) => file.name === proofName)) return json({ error: 'File bukti pembayaran belum berhasil diupload.' }, 400);
      const { error } = await serviceClient.rpc('submit_ticket_payment', {
        p_order_id: body.order_id,
        p_whatsapp: body.whatsapp,
        p_payment_amount: body.payment_amount,
        p_payment_proof_path: body.proof_path,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ status: 'Menunggu Verifikasi' });
    }

    if (body.action === 'login') {
      if (!encryptionKey || !accessCodePepper || !rateLimitPepper) return json({ error: 'Login tiket belum dikonfigurasi.' }, 500);
      const whatsapp = normalizeWhatsapp(body.whatsapp ?? '');
      const code = (body.access_code ?? '').trim().toUpperCase();
      const deviceTag = body.device_tag ?? '';
      if (whatsapp.length < 10 || whatsapp.length > 15 || !/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-?[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/.test(code) || deviceTag.length < 12) {
        return json({ error: 'Nomor WhatsApp, Kode Akses, atau identitas perangkat tidak valid.' }, 400);
      }
      const forwardedIp = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
      const { data: loginAllowed, error: rateLimitError } = await serviceClient.rpc('record_ticket_access_login_attempt', {
        p_phone_key_hash: await sha256(`phone:${whatsapp}:${rateLimitPepper}`),
        p_ip_key_hash: await sha256(`ip:${forwardedIp}:${rateLimitPepper}`),
        p_success: false,
      });
      if (rateLimitError) return json({ error: 'Login tiket belum dapat diproses.' }, 500);
      if (!loginAllowed) return json({ error: 'Terlalu banyak percobaan dari nomor ini atau jaringan yang sama. Tunggu beberapa menit sebelum mencoba lagi.' }, 429);
      const { data: codes, error } = await fetchAllPages((from, to) => serviceClient.from('ticket_access_codes')
        .select('id, event_id, access_code_hash, access_code_ciphertext, status, revoke_reason')
        .eq('whatsapp_normalized', whatsapp).order('id', { ascending: true }).range(from, to));
      if (error) return json({ error: 'Kode Akses belum dapat diverifikasi.' }, 500);
      let matchedCode = null;
      for (const candidate of codes ?? []) {
        const candidateHash = await accessCodeHash(candidate.event_id, whatsapp, code, accessCodePepper);
        if (constantTimeEquals(candidateHash, candidate.access_code_hash)) { matchedCode = candidate; break; }
      }
      if (!matchedCode) return json({ error: 'Nomor WhatsApp atau Kode Akses tidak sesuai.' }, 401);
      await serviceClient.rpc('record_ticket_access_login_attempt', {
        p_phone_key_hash: await sha256(`phone:${whatsapp}:${rateLimitPepper}`),
        p_ip_key_hash: await sha256(`ip:${forwardedIp}:${rateLimitPepper}`),
        p_success: true,
      });
      if (matchedCode.status !== 'active' && matchedCode.revoke_reason === 'event_completed') {
        return json({ error_code: 'event_completed', error: 'Kode Akses sudah tidak berlaku karena Event telah selesai' }, 410);
      }
      if (matchedCode.status !== 'active') return json({ error: 'Kode Akses sudah tidak berlaku.' }, 410);
      const { data: event, error: eventError } = await serviceClient.from('events').select('id, title, date, time, venue, status, poster').eq('id', matchedCode.event_id).maybeSingle();
      if (eventError || !event) return json({ error: 'Event untuk Kode Akses tidak ditemukan.' }, 404);
      if (event.status === 'completed') return json({ error_code: 'event_completed', error: 'Kode Akses sudah tidak berlaku karena Event telah selesai' }, 410);

      const sessionToken = randomToken();
      const { data: sessionResult, error: sessionError } = await serviceClient.rpc('create_ticket_access_session', {
        p_access_code_id: matchedCode.id,
        p_device_tag_hash: await sha256(deviceTag),
        p_session_token_hash: await sha256(sessionToken),
        p_replace_existing: Boolean(body.replace_existing),
      });
      if (sessionError) return json({ error: sessionError.message }, 400);
      const session = Array.isArray(sessionResult) ? sessionResult[0] : sessionResult;
      if (session?.session_state === 'session_conflict') return json({ session_conflict: true, event_title: event.title }, 409);
      return json({ session_token: sessionToken, event, session_expires_at: session?.idle_expires_at });
    }

    if (body.action === 'get-tickets') {
      if (!encryptionKey || !body.session_token) return json({ error: 'Sesi tiket tidak valid.' }, 401);
      const tokenHash = await sha256(body.session_token);
      const { data: session, error: sessionError } = await serviceClient.from('ticket_access_sessions')
        .select('id, access_code_id, idle_expires_at, revoked_at').eq('session_token_hash', tokenHash).maybeSingle();
      if (sessionError || !session || session.revoked_at || new Date(session.idle_expires_at).getTime() <= Date.now()) return json({ error_code: 'session_expired', error: 'Sesi tiket sudah berakhir. Silakan login kembali.' }, 401);
      const { data: accessCode } = await serviceClient.from('ticket_access_codes')
        .select('id, event_id, whatsapp_normalized, status, revoke_reason').eq('id', session.access_code_id).maybeSingle();
      if (!accessCode || accessCode.status !== 'active') {
        const completed = accessCode?.revoke_reason === 'event_completed';
        return json({ error_code: completed ? 'event_completed' : 'session_expired', error: completed ? 'Kode Akses sudah tidak berlaku karena Event telah selesai' : 'Kode Akses sudah tidak berlaku.' }, 410);
      }
      const { data: event, error: eventError } = await serviceClient.from('events').select('id, title, date, time, venue, location, status, poster, event_rules').eq('id', accessCode.event_id).maybeSingle();
      if (eventError || !event) return json({ error: 'Event tidak ditemukan.' }, 404);
      if (event.status === 'completed') return json({ error_code: 'event_completed', error: 'Kode Akses sudah tidak berlaku karena Event telah selesai' }, 410);

      const { data: checkinSettings, error: checkinSettingsError } = await serviceClient.from('event_checkin_settings')
        .select('closes_at').eq('event_id', event.id).maybeSingle();
      if (checkinSettingsError) return json({ error: 'Periode check-in Event gagal dimuat.' }, 500);
      if (checkinSettings && new Date(checkinSettings.closes_at).getTime() <= Date.now()) {
        const { error: ticketExpiryError } = await serviceClient.from('ticket_instances')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('event_id', event.id).eq('status', 'active').is('checked_in_at', null);
        if (ticketExpiryError) return json({ error: 'Tiket yang masa check-in-nya berakhir gagal diperbarui.' }, 500);
      }

      const { data: orders, error: orderError } = await fetchAllPages((from, to) => serviceClient.from('ticket_orders')
        .select('id, order_number, full_name, ticket_category, quantity, unit_price, total_price, status, created_at')
        .eq('event_id', event.id).eq('access_code_id', accessCode.id).eq('whatsapp', accessCode.whatsapp_normalized)
        .in('status', ['Lunas']).order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to));
      if (orderError) return json({ error: 'Order tiket gagal dimuat.' }, 500);
      const orderIds = (orders ?? []).map((order) => order.id);
      const instances: Array<{ id: string; ticket_order_id: string; sequence_no: number; status: string; checked_in_at: string | null; qr_token_ciphertext: string }> = [];
      for (const ids of chunkValues(orderIds)) {
        const { data, error } = await fetchAllPages((from, to) => serviceClient.from('ticket_instances')
          .select('id, ticket_order_id, sequence_no, status, checked_in_at, qr_token_ciphertext')
          .in('ticket_order_id', ids).order('sequence_no', { ascending: true }).order('id', { ascending: true }).range(from, to));
        if (error) return json({ error: 'Tiket gagal dimuat.' }, 500);
        instances.push(...(data ?? []));
      }
      const tickets = await Promise.all((instances ?? []).map(async (ticket) => ({
        id: ticket.id,
        ticket_order_id: ticket.ticket_order_id,
        sequence_no: ticket.sequence_no,
        status: ticket.checked_in_at ? 'Sudah Digunakan' : ticket.status === 'expired' ? 'Expired' : ticket.status !== 'active' ? 'Tidak Aktif' : event.status === 'cancelled' ? 'Event Dibatalkan' : 'Belum Digunakan',
        checked_in_at: ticket.checked_in_at,
        qr_token: await decryptSecret(ticket.qr_token_ciphertext, encryptionKey),
      })));
      return json({ event, orders: orders ?? [], tickets, event_cancelled: event.status === 'cancelled', session_expires_at: session.idle_expires_at });
    }

    if (body.action === 'get-ticket-history') {
      if (!body.session_token) return json({ error_code: 'session_expired', error: 'Sesi tiket tidak valid.' }, 401);
      const tokenHash = await sha256(body.session_token);
      const { data: session, error: sessionError } = await serviceClient.from('ticket_access_sessions')
        .select('access_code_id, idle_expires_at, revoked_at').eq('session_token_hash', tokenHash).maybeSingle();
      if (sessionError) return json({ error: 'Sesi tiket gagal diverifikasi.' }, 500);
      if (!session || session.revoked_at || new Date(session.idle_expires_at).getTime() <= Date.now()) {
        return json({ error_code: 'session_expired', error: 'Sesi tiket sudah berakhir. Silakan login kembali.' }, 401);
      }
      const { data: accessCode, error: accessCodeError } = await serviceClient.from('ticket_access_codes')
        .select('event_id, whatsapp_normalized, status').eq('id', session.access_code_id).maybeSingle();
      if (accessCodeError) return json({ error: 'Kode Akses gagal diverifikasi.' }, 500);
      if (!accessCode || accessCode.status !== 'active') {
        return json({ error_code: 'session_expired', error: 'Kode Akses sudah tidak berlaku.' }, 410);
      }
      const { data: orders, error: orderError } = await fetchAllPages((from, to) => serviceClient.from('ticket_orders')
        .select('id, event_id, order_number, ticket_category, quantity, total_price, status, created_at')
        .eq('whatsapp', accessCode.whatsapp_normalized).eq('status', 'Lunas')
        .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to));
      if (orderError) return json({ error: 'Riwayat order tiket gagal dimuat.' }, 500);
      const eventIds = [...new Set((orders ?? []).map((order) => order.event_id))];
      const historyEvents = [];
      for (const ids of chunkValues(eventIds)) {
        const { data, error } = await fetchAllPages((from, to) => serviceClient.from('events')
          .select('id, title, date, time, venue, status, poster').in('id', ids)
          .order('date', { ascending: false }).range(from, to));
        if (error) return json({ error: 'Informasi Event pada riwayat gagal dimuat.' }, 500);
        historyEvents.push(...(data ?? []));
      }
      const eventsById = new Map(historyEvents.map((event) => [event.id, event]));
      const history = (orders ?? []).map((order) => ({ ...order, event: eventsById.get(order.event_id) ?? null }));
      return json({ history, session_expires_at: session.idle_expires_at });
    }

    if (body.action === 'touch-session') {
      if (!body.session_token) return json({ error_code: 'session_expired', error: 'Sesi tiket tidak valid.' }, 401);
      const tokenHash = await sha256(body.session_token);
      const now = new Date().toISOString();
      const nextIdleExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const { data: touched, error } = await serviceClient.from('ticket_access_sessions')
        .update({ last_seen_at: now, idle_expires_at: nextIdleExpiry })
        .eq('session_token_hash', tokenHash).is('revoked_at', null).gt('idle_expires_at', now)
        .select('id').maybeSingle();
      if (error || !touched) return json({ error_code: 'session_expired', error: 'Sesi tiket sudah berakhir. Silakan login kembali.' }, 401);
      return json({ session_expires_at: nextIdleExpiry });
    }

    if (body.action === 'logout') {
      if (!body.session_token) return json({ revoked: false });
      const { data, error } = await serviceClient.rpc('revoke_ticket_access_session', { p_session_token_hash: await sha256(body.session_token) });
      if (error) return json({ error: 'Sesi tiket gagal diakhiri.' }, 500);
      return json({ revoked: Boolean(data) });
    }

    return json({ error: 'Action Ticketing tidak dikenal.' }, 400);
  } catch (error) {
    console.error('ticketing-public failed', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: error instanceof Error ? error.message : 'Permintaan Ticketing gagal.' }, 400);
  }
});