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
  gate_id?: string | null;
  gates_enabled?: boolean;
  time_restricted?: boolean;
  opens_at?: string;
  closes_at?: string;
  gates?: Array<{ id?: string; name: string; category_ids: string[] }>;
  resolution?: 'Lunas' | 'Ditolak';
  qr_token?: string;
  access_code_id?: string;
  payment_method_id?: string;
  payment_method?: { id?: string; event_id?: string; event_ids?: string[]; recipient_name?: string; bank_name?: string; account_number?: string; qris_storage_path?: string; note?: string; is_default?: boolean };
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
  ticket_id?: string;
  full_name?: string;
  include_stats?: boolean;
  email?: string;
  quantity?: number;
  free_pass_reason?: string;
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

function createTicketOrderNumber(eventTitle: string) {
  const words = eventTitle.toUpperCase().replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter(Boolean);
  const letters = words.join('');
  const prefix = (words.length >= 3 ? words.slice(0, 3).map((word) => word[0]).join('') : letters.slice(0, 3)).padEnd(3, 'X').slice(0, 3);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randomValues = crypto.getRandomValues(new Uint32Array(6));
  const code = Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('');
  return `${prefix}-${code}`;
}

function freePassMessage(name: string, eventTitle: string, orderNumber: string, code: string, ticketPageUrl: string) {
  return `Halo *${name}*, kamu mendapatkan *Free Pass* untuk event *${eventTitle}*.\n\nOrder *#${orderNumber}* · Kode Akses: *${code}*\n\nBuka tiket: ${ticketPageUrl}\n\nMasuk menggunakan nomor WhatsApp yang terdaftar dan Kode Akses tersebut untuk melihat QR tiket.`;
}

function freePassConfirmationEmailHtml(order: {
  full_name: string;
  whatsapp: string;
  ticket_category: string;
  quantity: number;
  order_number: string;
}, event: {
  title: string;
  date: string | null;
  time: string | null;
  venue: string | null;
  location: string | null;
}, accessCode: string, ticketPageUrl: string) {
  const email = paymentConfirmationEmailHtml({ ...order, total_price: 0 }, event, accessCode, ticketPageUrl, true);
  const safeEventTitle = event.title.replace(/[\r\n]+/g, ' ').trim();
  email.subject = `FREE PASS ${safeEventTitle} - TIKET KAMU SUDAH SIAP`;
  email.text = `Halo ${order.full_name},\n\nKamu mendapatkan tiket Free Pass untuk ${event.title}.\n\nDetail Tiket:\nEvent: ${event.title}\nKategori: ${order.ticket_category}\nJumlah tiket: ${order.quantity}\n\nAkses Tiket:\nNomor WhatsApp: ${order.whatsapp}\nKode Akses: ${accessCode}\n\nGunakan Nomor WhatsApp dan Kode Akses tersebut untuk melihat tiket melalui website.\nBuka Tiket Saya: ${ticketPageUrl}\n\nSTANDUPINDO CILEGON`;
  return email;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function paymentConfirmationEmailHtml(order: {
  full_name: string;
  whatsapp: string;
  ticket_category: string;
  quantity: number;
  total_price: number;
}, event: {
  title: string;
  date: string | null;
  time: string | null;
  venue: string | null;
  location: string | null;
}, accessCode: string, ticketPageUrl: string, isFreePass = false) {
  const name = escapeHtml(order.full_name);
  const eventTitle = event.title.replace(/[\r\n]+/g, ' ').trim();
  const escapedEventTitle = escapeHtml(eventTitle);
  const category = escapeHtml(order.ticket_category);
  const whatsapp = escapeHtml(order.whatsapp);
  const code = escapeHtml(accessCode);
  const ticketUrl = escapeHtml(ticketPageUrl);
  const logoUrl = escapeHtml(new URL('/assets/images/Logo%20Standupindo%20Cilegon%20Biru.png', ticketPageUrl).toString());
  const total = `Rp ${order.total_price.toLocaleString('id-ID')}`;
  const parsedDate = event.date ? Date.parse(`${event.date}T00:00:00Z`) : Number.NaN;
  const eventDate = Number.isNaN(parsedDate)
    ? ''
    : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parsedDate);
  const eventTime = event.time?.trim() ?? '';
  const eventLocation = [event.venue?.trim(), event.location?.trim()]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
    .join(' · ');
  const detailRow = (label: string, value: string, last = false, emphasize = false) => `
    <tr>
      <td style="padding:${last ? '13px 0 5px' : '9px 0'};color:#64748b;${last ? '' : 'border-bottom:1px solid #edf1f6;'}width:42%">${label}</td>
      <td style="padding:${last ? '13px 0 5px' : '9px 0'};color:${emphasize ? '#102a56' : '#172033'};font-weight:700;${last ? 'font-size:18px;line-height:24px;' : 'border-bottom:1px solid #edf1f6;'}">${value}</td>
    </tr>`;
  const eventRows = [
    eventDate ? detailRow('Tanggal', escapeHtml(eventDate)) : '',
    eventTime ? detailRow('Waktu', escapeHtml(eventTime)) : '',
    eventLocation ? detailRow('Lokasi', escapeHtml(eventLocation)) : '',
  ].join('');
  const paymentRow = isFreePass ? '' : detailRow('Total pembayaran', total, true, true);
  const intro = isFreePass
    ? `Halo <strong style="color:#172033">${name}</strong>, kamu mendapatkan tiket Free Pass untuk <strong style="color:#172033">${escapedEventTitle}</strong>.`
    : `Halo <strong style="color:#172033">${name}</strong>, pembayaran tiket kamu sudah dikonfirmasi dan berstatus <strong style="color:#16834a">LUNAS</strong>.`;
  const statusLabel = isFreePass ? 'FREE PASS' : 'PAYMENT SUCCESS';
  const heading = isFreePass ? 'Free Pass Berhasil!' : 'Pembayaran Berhasil!';
  const detailStatus = isFreePass ? '● FREE PASS' : '● TERKONFIRMASI';
  const preheader = isFreePass
    ? `Kamu mendapatkan tiket Free Pass untuk ${eventTitle}.`
    : 'Pembayaran tiket kamu sudah dikonfirmasi dan berstatus lunas.';

  return {
    subject: `Pembayaran Tiket ${eventTitle} Berhasil — Lunas`,
    html: `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>${isFreePass ? 'Free Pass' : 'Pembayaran Berhasil'} - Standupindo Cilegon</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;margin:0;padding:24px 0">
    <tr><td align="center" style="padding:0 12px">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#fff;border-radius:18px;overflow:hidden">
        <tr><td style="padding:24px 28px;background-color:#fff;border-bottom:1px solid #e7edf5">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td valign="middle" style="width:58px"><img src="${logoUrl}" width="52" height="52" alt="Standupindo Cilegon" style="display:block;width:52px;height:52px;object-fit:contain;border:0"></td>
            <td valign="middle" style="padding-left:12px"><div style="font-size:17px;line-height:22px;font-weight:800;color:#102a56">STANDUPINDO</div><div style="font-size:11px;line-height:17px;letter-spacing:1.4px;color:#64748b">CILEGON · OFFICIAL TICKETING</div></td>
            <td align="right" valign="middle"><span style="display:inline-block;padding:8px 10px;border-radius:20px;background-color:${isFreePass ? '#fff7df' : '#e8f8ef'};color:${isFreePass ? '#9a6700' : '#16834a'};font-size:10px;line-height:12px;font-weight:800;letter-spacing:.5px">${statusLabel}</span></td>
          </tr></table>
        </td></tr>
        <tr><td align="center" style="padding:34px 28px 28px">
          <div style="width:54px;height:54px;line-height:54px;border-radius:50%;background-color:#e7f8ee;color:#169653;font-size:30px;font-weight:700;text-align:center;margin:0 auto 18px">✓</div>
          <h1 style="margin:0 0 12px;font-size:27px;line-height:34px;color:#102a56">${heading}</h1>
          <p style="margin:0;max-width:440px;font-size:15px;line-height:24px;color:#526176">${intro}</p>
        </td></tr>
        <tr><td style="padding:0 28px 24px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e2eaf4;border-radius:14px;overflow:hidden">
            <tr><td style="padding:18px 20px;background-color:#f8fbff;border-bottom:1px solid #e2eaf4">
              <div style="font-size:11px;line-height:16px;font-weight:800;letter-spacing:1.2px;color:#64748b;margin-bottom:5px">DETAIL TIKET</div>
              <div style="font-size:19px;line-height:26px;font-weight:800;color:#102a56">${escapedEventTitle}</div>
              <div style="margin-top:10px"><span style="display:inline-block;padding:6px 10px;border-radius:20px;background-color:${isFreePass ? '#fff7df' : '#e8f8ef'};color:${isFreePass ? '#9a6700' : '#16834a'};font-size:10px;line-height:12px;font-weight:800;letter-spacing:.5px">${detailStatus}</span></div>
            </td></tr>
            <tr><td style="padding:8px 20px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:13px;line-height:19px">
              ${detailRow('Nama pemesan', name)}${eventRows}${detailRow('Kategori', category)}${detailRow('Jumlah tiket', String(order.quantity))}${paymentRow}
            </table></td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 28px 24px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#102a56;border-radius:14px"><tr><td style="padding:20px">
            <div style="font-size:16px;line-height:22px;color:#fff;font-weight:800;margin-bottom:6px">Akses Tiket</div>
            <div style="font-size:13px;line-height:20px;color:#dbe7f8;margin-bottom:16px">Gunakan informasi berikut untuk membuka tiket digital kamu di website.</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
              <td style="padding:12px;background-color:#1b3a6b;border-radius:9px 0 0 9px;width:50%"><div style="font-size:11px;line-height:16px;color:#b8c9e3;margin-bottom:4px">Nomor WhatsApp</div><div style="font-size:15px;line-height:21px;color:#fff;font-weight:800;word-break:break-word">${whatsapp}</div></td>
              <td style="padding:12px;background-color:#1b3a6b;border-radius:0 9px 9px 0;width:50%;border-left:1px solid #102a56"><div style="font-size:11px;line-height:16px;color:#b8c9e3;margin-bottom:4px">Kode Akses</div><div style="font-size:15px;line-height:21px;color:#fff;font-weight:800;letter-spacing:1px;word-break:break-word">${code}</div></td>
            </tr></table>
          </td></tr></table>
        </td></tr>
        <tr><td align="center" style="padding:0 28px 32px">
          <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#526176">Tiket kamu sudah siap. Buka halaman <strong>Tiket Saya</strong> untuk melihat tiket digital.</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="#1264e8" style="border-radius:9px"><a href="${ticketUrl}" style="display:inline-block;padding:14px 28px;border-radius:9px;background-color:#1264e8;color:#fff;text-decoration:none;font-size:14px;line-height:18px;font-weight:800">Buka Tiket Saya&nbsp; →</a></td></tr></table>
          <p style="margin:18px 0 0;font-size:11px;line-height:18px;color:#7b8798">Jika tombol tidak dapat dibuka, gunakan tautan berikut:<br><a href="${ticketUrl}" style="color:#1264e8;text-decoration:underline;word-break:break-word">${ticketUrl}</a></p>
        </td></tr>
        <tr><td style="padding:20px 28px;background-color:#f8fbff;border-top:1px solid #e7edf5"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
          <td valign="middle" style="width:44px"><img src="${logoUrl}" width="38" height="38" alt="Standupindo" style="display:block;width:38px;height:38px;object-fit:contain;border:0"></td>
          <td valign="middle" style="padding-left:10px"><div style="font-size:12px;line-height:18px;color:#64748b">Official Ticketing</div><div style="font-size:13px;line-height:19px;color:#102a56;font-weight:800">Standupindo Cilegon</div></td>
          <td align="right" valign="middle" style="font-size:10px;line-height:16px;color:#94a3b8">Email otomatis<br>Mohon tidak membalas email ini.</td>
        </tr></table></td></tr>
      </table>
      <div style="max-width:560px;padding:16px 8px 0;font-size:10px;line-height:16px;color:#94a3b8;text-align:center">© Standupindo Cilegon · Official Ticketing</div>
    </td></tr>
  </table>
</body>
</html>`,
    text: `Halo ${order.full_name}, pembayaran tiket ${eventTitle} sudah dikonfirmasi dan berstatus lunas.\n\nDetail Tiket:\nEvent: ${eventTitle}\nNama pemesan: ${order.full_name}\n${eventDate ? `Tanggal: ${eventDate}\n` : ''}${eventTime ? `Waktu: ${eventTime}\n` : ''}${eventLocation ? `Lokasi: ${eventLocation}\n` : ''}Kategori: ${order.ticket_category}\nJumlah tiket: ${order.quantity}\nTotal pembayaran: ${total}\n\nAkses Tiket:\nNomor WhatsApp: ${order.whatsapp}\nKode Akses: ${accessCode}\n\nBuka Tiket Saya: ${ticketPageUrl}\n\nSTANDUPINDO CILEGON`,
  };
}
async function resendErrorMessage(response: Response, secrets: string[]) {
  let detail = '';

  try {
    const payload: unknown = await response.clone().json();
    if (typeof payload === 'string') {
      detail = payload;
    } else if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const record = payload as Record<string, unknown>;
      const fields = ['message', 'error', 'name', 'type', 'code'] as const;
      const parts: string[] = [];
      for (const field of fields) {
        const value = record[field];
        if (typeof value === 'string' || typeof value === 'number') {
          parts.push(`${field}: ${value}`);
        } else if (field === 'error' && value && typeof value === 'object' && !Array.isArray(value)) {
          const error = value as Record<string, unknown>;
          for (const nestedField of ['message', 'name', 'type', 'code'] as const) {
            const nestedValue = error[nestedField];
            if (typeof nestedValue === 'string' || typeof nestedValue === 'number') {
              parts.push(`${nestedField}: ${nestedValue}`);
            }
          }
        }
      }
      detail = [...new Set(parts)].join('; ');
    }
  } catch {
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
  }

  for (const secret of secrets) {
    if (secret) detail = detail.split(secret).join('[redacted]');
  }

  return `Resend HTTP ${response.status}: ${(detail.trim() || 'No error details returned.').slice(0, 1000)}`.slice(0, 1000);
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
  async function publishCheckInUpdate(eventId: string) {
    const channel = serviceClient.channel(`ticket-checkins-${eventId}`);
    try {
      const status = await channel.send({
        type: 'broadcast',
        event: 'check-in-updated',
        payload: {},
      });
      if (status !== 'ok') console.error('ticket check-in broadcast failed', status);
    } catch (error) {
      console.error('ticket check-in broadcast failed', error instanceof Error ? error.message : 'Unknown error');
    }
  }
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

  async function expireUnusedTickets(eventId: string) {
    const { error } = await serviceClient.from('ticket_instances')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('event_id', eventId).eq('status', 'active').is('checked_in_at', null);
    return error;
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
        eventEntry.ticket_count += orderInstances.length ? orderInstances.filter((ticket) => ticket.status === 'active' || ticket.status === 'expired' || ticket.checked_in_at).length : order.quantity;
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
      const orders: Array<{ id: string; order_number: string | null; full_name: string; whatsapp: string; ticket_category: string; status: string; order_type: 'paid' | 'free_pass'; sale_channel: 'online' | 'ots' | 'free_pass'; free_pass_reason: string | null }> = [];
      for (const ids of chunkValues(orderIds)) {
        const { data, error } = await fetchAllPages((from, to) => serviceClient.from('ticket_orders')
          .select('id, order_number, full_name, whatsapp, ticket_category, status, order_type, sale_channel, free_pass_reason').in('id', ids).order('id', { ascending: true }).range(from, to));
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
      const { data: assignments, error: assignmentError } = await serviceClient
        .from('event_payment_method_assignments')
        .select('payment_method_id, event_id, is_active');
      if (assignmentError) return json({ error: 'Event penggunaan informasi pembayaran gagal dimuat.' }, 500);
      const scopedAssignments = await Promise.all((assignments ?? []).map(async (assignment) => (
        isAdmin || await hasEventScope(assignment.event_id, 'admin_ticket') ? assignment : null
      )));
      const visibleAssignments = scopedAssignments.filter((assignment): assignment is NonNullable<typeof assignment> => Boolean(assignment));
      const visibleMethodIds = [...new Set(visibleAssignments.map((assignment) => assignment.payment_method_id))];
      const visibleEventIds = [...new Set(visibleAssignments.map((assignment) => assignment.event_id))];
      const { data: visibleEvents, error: eventError } = visibleEventIds.length
        ? await serviceClient.from('events').select('id, title, date, status').in('id', visibleEventIds)
        : { data: [], error: null };
      if (eventError) return json({ error: 'Event penggunaan informasi pembayaran gagal dimuat.' }, 500);
      const eventById = new Map((visibleEvents ?? []).map((event) => [event.id, event]));
      const visibleMethods = (methods ?? []).filter((method) => visibleMethodIds.includes(method.id)).map((method) => {
        const methodAssignments = (assignments ?? []).filter((assignment) => assignment.payment_method_id === method.id);
        const visibleMethodAssignments = visibleAssignments.filter((assignment) => assignment.payment_method_id === method.id);
        return {
          ...method,
          events: visibleMethodAssignments.map((assignment) => ({
            ...eventById.get(assignment.event_id),
            is_active: assignment.is_active,
          })),
          can_edit: isAdmin || (!method.is_default && visibleMethodAssignments.length === methodAssignments.length),
          can_delete: isAdmin || (!method.is_default && visibleMethodAssignments.length === methodAssignments.length),
        };
      });
      return json({ methods: visibleMethods, events: visibleEvents ?? [], supports_multi_event: true, can_manage_default: isAdmin || isTicketAdmin });
    }

    if (body.action === 'save-payment-method') {
      if (!isAdmin && !isTicketAdmin) return json({ error: 'Akses pengelolaan pembayaran ditolak.' }, 403);
      const method = body.payment_method;
      const eventIds = method?.event_ids;
      if (!Array.isArray(eventIds) || !eventIds.length || eventIds.some((eventId) => typeof eventId !== 'string') || !method?.recipient_name?.trim()) {
        return json({ error: 'Pilih minimal satu Event dan isi nama penerima.' }, 400);
      }
      if (new Set(eventIds).size !== eventIds.length) return json({ error: 'Event yang dipilih tidak boleh duplikat.' }, 400);
      if (!(await Promise.all(eventIds.map((eventId) => hasEventScope(eventId, 'admin_ticket')))).every(Boolean)) {
        return json({ error: 'Satu atau lebih Event berada di luar scope Admin Tiket.' }, 403);
      }
      const accountNumber = method.account_number?.trim() || null;
      const qrisPath = method.qris_storage_path?.trim() || null;
      if (!accountNumber && !qrisPath) return json({ error: 'Isi nomor rekening atau upload QRIS.' }, 400);
      let eventIdsToSave = [...eventIds];
      let previousQrisPath: string | null = null;
      let previousIsDefault = false;
      if (method.id) {
        const { data: existing, error: existingError } = await serviceClient.from('event_payment_methods')
          .select('id, qris_storage_path, is_default').eq('id', method.id).maybeSingle();
        if (existingError) return json({ error: 'Informasi pembayaran gagal dimuat.' }, 500);
        if (!existing) return json({ error: 'Informasi pembayaran tidak ditemukan.' }, 404);
        previousQrisPath = existing.qris_storage_path;
        previousIsDefault = existing.is_default;
        const { data: existingAssignments, error: existingAssignmentError } = await serviceClient
          .from('event_payment_method_assignments').select('event_id').eq('payment_method_id', method.id);
        if (existingAssignmentError) return json({ error: 'Event penggunaan informasi pembayaran gagal dimuat.' }, 500);
        if (!existingAssignments?.length) return json({ error: 'Informasi pembayaran tidak memiliki Event.' }, 409);
        const visibleExisting = await Promise.all(existingAssignments.map(async (assignment) => (
          isAdmin || await hasEventScope(assignment.event_id, 'admin_ticket') ? assignment.event_id : null
        )));
        if (!visibleExisting.some(Boolean)) return json({ error: 'Informasi pembayaran tidak ditemukan atau di luar scope.' }, 404);
        if (!isAdmin && previousIsDefault) return json({ error: 'Informasi rekening default hanya dapat diedit Admin utama.' }, 403);
        if (!isAdmin && visibleExisting.some((eventId) => !eventId)) {
          return json({ error: 'Informasi ini juga digunakan Event di luar scope akun Anda dan tidak dapat diedit.' }, 403);
        }
        eventIdsToSave = [...new Set([...eventIdsToSave, ...visibleExisting.filter((eventId): eventId is string => Boolean(eventId) && !eventIds.includes(eventId))])];
      }
      const requestedDefault = typeof method.is_default === 'boolean' ? method.is_default : previousIsDefault;
      const qrisBelongsToSelection = qrisPath && eventIdsToSave.some((eventId) => qrisPath.startsWith(`payment-methods/${eventId}/`));
      if (qrisPath && qrisPath !== previousQrisPath && !qrisBelongsToSelection) return json({ error: 'Lokasi QRIS tidak valid untuk Event yang dipilih.' }, 400);
      const { data: savedMethodId, error: saveError } = await serviceClient.rpc('save_ticket_payment_method', {
        p_method_id: method.id ?? null,
        p_event_ids: eventIdsToSave,
        p_recipient_name: method.recipient_name.trim(),
        p_bank_name: method.bank_name?.trim() || null,
        p_account_number: accountNumber,
        p_qris_storage_path: qrisPath,
        p_note: method.note?.trim() || null,
      });
      if (saveError || !savedMethodId) return json({ error: saveError?.message ?? 'Informasi pembayaran gagal disimpan.' }, 400);
      if ((isAdmin || isTicketAdmin) && (requestedDefault || previousIsDefault)) {
        const { error: defaultError } = await serviceClient.rpc('set_default_ticket_payment_method', {
          p_method_id: requestedDefault ? savedMethodId : null,
        });
        if (defaultError) return json({ error: `Informasi tersimpan, tetapi status default gagal diperbarui: ${defaultError.message}` }, 400);
      }
      return json({ method_id: savedMethodId });
    }

    if (body.action === 'activate-payment-method' || body.action === 'deactivate-payment-method') {
      if (!isAdmin && !isTicketAdmin) return json({ error: 'Akses pengelolaan pembayaran ditolak.' }, 403);
      if (!body.payment_method_id || !body.event_id) return json({ error: 'Pilih informasi pembayaran dan Event.' }, 400);
      if (!await hasEventScope(body.event_id, 'admin_ticket')) return json({ error: 'Event di luar scope Admin Tiket.' }, 403);
      if (body.action === 'activate-payment-method') {
        const { error } = await serviceClient.rpc('set_ticket_payment_method_active', {
          p_method_id: body.payment_method_id,
          p_event_id: body.event_id,
          p_actor_id: authData.user.id,
        });
        if (error) return json({ error: error.message }, 400);
      } else {
        const { data, error } = await serviceClient.from('event_payment_method_assignments')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('payment_method_id', body.payment_method_id).eq('event_id', body.event_id)
          .select('payment_method_id').maybeSingle();
        if (error) return json({ error: error.message }, 400);
        if (!data) return json({ error: 'Informasi pembayaran tidak ditugaskan ke Event ini.' }, 404);
      }
      return json({ updated: true });
    }

    if (body.action === 'delete-payment-method') {
      if (!isAdmin && !isTicketAdmin) return json({ error: 'Akses pengelolaan pembayaran ditolak.' }, 403);
      if (!body.payment_method_id) return json({ error: 'Pilih informasi pembayaran.' }, 400);
      const { data: paymentMethod, error: methodError } = await serviceClient.from('event_payment_methods')
        .select('is_default').eq('id', body.payment_method_id).maybeSingle();
      if (methodError) return json({ error: 'Informasi pembayaran gagal dimuat.' }, 500);
      if (!paymentMethod) return json({ error: 'Informasi pembayaran tidak ditemukan.' }, 404);
      if (!isAdmin && paymentMethod.is_default) return json({ error: 'Informasi pembayaran default hanya dapat dihapus Admin utama.' }, 403);
      const { data: assignedEvents, error: assignmentError } = await serviceClient.from('event_payment_method_assignments')
        .select('event_id').eq('payment_method_id', body.payment_method_id);
      if (assignmentError) return json({ error: 'Event penggunaan informasi pembayaran gagal dimuat.' }, 500);
      if (!assignedEvents?.length) return json({ error: 'Informasi pembayaran tidak ditemukan.' }, 404);
      const allEventsInScope = await Promise.all(assignedEvents.map((assignment) => hasEventScope(assignment.event_id, 'admin_ticket')));
      if (!allEventsInScope.every(Boolean)) return json({ error: 'Informasi ini juga dipakai Event di luar scope. Hapus atau ubah penugasan Event tersebut terlebih dahulu.' }, 403);
      const { error } = await serviceClient.from('event_payment_methods').delete().eq('id', body.payment_method_id);
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
        .select('id, order_number, event_id, full_name, email, whatsapp, ticket_category, quantity, total_price, payment_amount, status')
        .eq('id', body.order_id).maybeSingle();
      if (orderError || !order) return json({ error: 'Order tidak ditemukan.' }, 404);
      const previousStatus = order.status;
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
      const { data: event } = await serviceClient.from('events')
        .select('title, date, time, venue, location').eq('id', order.event_id).maybeSingle();

      if (previousStatus !== 'Lunas' && result?.resolved_status === 'Lunas') {
        const recipientEmail = typeof order.email === 'string' ? order.email.trim() : '';
        const { data: emailLog, error: emailLogError } = await serviceClient.from('ticket_email_logs')
          .insert({
            order_id: order.id,
            recipient_email: recipientEmail || null,
            status: recipientEmail ? 'pending' : 'skipped',
            error_message: recipientEmail ? null : 'Email pembeli tidak tersedia pada order.',
          })
          .select('id')
          .maybeSingle();

        if (emailLogError?.code === '23505') {
          // A unique log already exists, so this order has already had its email attempt.
        } else if (emailLogError || !emailLog) {
          console.error('ticket payment confirmation email could not be reserved');
        } else if (recipientEmail) {
          const resendApiKey = Deno.env.get('RESEND_API_KEY');
          if (!resendApiKey) {
            const { error: logUpdateError } = await serviceClient.from('ticket_email_logs')
              .update({ status: 'failed', error_message: 'Konfigurasi Resend belum tersedia.' })
              .eq('id', emailLog.id);
            if (logUpdateError) console.error('ticket payment email failure could not be saved');
          } else if (!event?.title) {
            const { error: logUpdateError } = await serviceClient.from('ticket_email_logs')
              .update({ status: 'failed', error_message: 'Informasi Event tidak tersedia.' })
              .eq('id', emailLog.id);
            if (logUpdateError) console.error('ticket payment email failure could not be saved');
          } else {
            const emailContent = paymentConfirmationEmailHtml({
              full_name: order.full_name,
              whatsapp: order.whatsapp,
              ticket_category: order.ticket_category,
              quantity: order.quantity,
              total_price: order.total_price,
            }, event, accessCode, 'https://standupindocilegon.id/tiket');
            try {
              const resendResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${resendApiKey}`,
                  'Content-Type': 'application/json',
                  'Idempotency-Key': `ticket-payment-confirmation/${order.id}`,
                  'User-Agent': 'standupindo-cilegon-ticketing/1.0',
                },
                body: JSON.stringify({
                  from: 'Standupindo Cilegon <noreply@standupindocilegon.id>',
                  to: [recipientEmail],
                  subject: emailContent.subject,
                  html: emailContent.html,
                  text: emailContent.text,
                }),
                signal: AbortSignal.timeout(10000),
              });
              const resendResult = await resendResponse.clone().json().catch(() => null) as { id?: string } | null;
              if (!resendResponse.ok) {
                const errorMessage = await resendErrorMessage(resendResponse, [resendApiKey, accessCode]);
                const { error: logUpdateError } = await serviceClient.from('ticket_email_logs')
                  .update({ status: 'failed', error_message: errorMessage })
                  .eq('id', emailLog.id);
                if (logUpdateError) console.error('ticket payment email failure could not be saved');
              } else {
                const { error: sentLogError } = await serviceClient.from('ticket_email_logs')
                  .update({
                    status: 'sent',
                    resend_message_id: typeof resendResult?.id === 'string' ? resendResult.id : null,
                    error_message: null,
                    sent_at: new Date().toISOString(),
                  })
                  .eq('id', emailLog.id);
                if (sentLogError) console.error('ticket payment confirmation email sent but its log could not be updated');
              }
            } catch {
              const { error: logUpdateError } = await serviceClient.from('ticket_email_logs')
                .update({ status: 'failed', error_message: 'Koneksi ke layanan Resend gagal atau melewati batas waktu.' })
                .eq('id', emailLog.id);
              if (logUpdateError) console.error('ticket payment email failure could not be saved');
            }
          }
        }
      }

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

    if (body.action === 'issue-ots-sale') {
      if (!encryptionKey || !accessCodePepper) return json({ error: 'Secret Ticketing belum dikonfigurasi.' }, 500);
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!body.event_id || !uuidPattern.test(body.event_id) || !body.ticket_id || !uuidPattern.test(body.ticket_id)
        || !body.full_name?.trim() || body.full_name.trim().length > 160 || !body.whatsapp?.trim()
        || !Number.isInteger(body.quantity) || (body.quantity ?? 0) < 1 || (body.quantity ?? 0) > 10
        || (!isAdmin && !isTicketAdmin)) {
        return json({ error: 'Lengkapi Event, kategori, nama maksimal 160 karakter, WhatsApp, dan jumlah 1–10.' }, 400);
      }
      const ticketPageUrl = getTicketPageUrl(request.headers.get('origin'));
      if (!ticketPageUrl) return json({ error: 'Domain halaman tiket tidak dapat ditentukan dari request.' }, 400);
      if (!await hasEventScope(body.event_id, 'admin_ticket')) return json({ error: 'Event berada di luar scope Admin Tiket.' }, 403);

      const [{ data: event, error: eventError }, { data: category, error: categoryError }] = await Promise.all([
        serviceClient.from('events').select('id, title, status, date, time, venue, location, poster, event_rules').eq('id', body.event_id).maybeSingle(),
        serviceClient.from('event_tickets').select('id, event_id, name, status, available_ots, ots_price')
          .eq('id', body.ticket_id).eq('event_id', body.event_id).maybeSingle(),
      ]);
      if (eventError || categoryError) return json({ error: 'Informasi Event atau kategori gagal dimuat.' }, 500);
      if (!event || event.status !== 'upcoming' || !category || category.status !== 'active'
        || !category.available_ots || category.ots_price === null) {
        return json({ error: 'Event atau kategori tiket tidak tersedia untuk penjualan OTS.' }, 404);
      }

      const normalizedPhone = normalizeWhatsapp(body.whatsapp);
      if (normalizedPhone.length < 10 || normalizedPhone.length > 15) return json({ error: 'Nomor WhatsApp penerima tidak valid.' }, 400);
      const { data: previousCodes, error: previousCodesError } = await serviceClient.from('ticket_access_codes')
        .select('whatsapp_code_hash').eq('whatsapp_normalized', normalizedPhone);
      if (previousCodesError) return json({ error: 'Riwayat Kode Akses gagal dimuat.' }, 500);
      const usedCodeHashes = new Set((previousCodes ?? []).map((entry) => entry.whatsapp_code_hash));

      let issuedData: unknown = null;
      let issueError: { message: string; code?: string } | null = null;
      let orderNumber = '';
      let qrTokenValues: string[] = [];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        orderNumber = createTicketOrderNumber(event.title);
        const accessCode = createAccessCode();
        const phoneCodeHash = await whatsappAccessCodeHash(normalizedPhone, accessCode, accessCodePepper);
        if (usedCodeHashes.has(phoneCodeHash)) continue;
        const codeHash = await accessCodeHash(body.event_id, normalizedPhone, accessCode, accessCodePepper);
        const codeCiphertext = await encryptSecret(accessCode, encryptionKey);
        qrTokenValues = Array.from({ length: body.quantity! }, () => randomToken());
        const qrTokens = await Promise.all(qrTokenValues.map(async (token) => {
          return { hash: await sha256(token), ciphertext: await encryptSecret(token, encryptionKey) };
        }));
        const result = await serviceClient.rpc('issue_ticket_ots', {
          p_order_number: orderNumber,
          p_event_id: body.event_id,
          p_ticket_id: body.ticket_id,
          p_full_name: body.full_name.trim(),
          p_whatsapp: normalizedPhone,
          p_quantity: body.quantity,
          p_actor_id: authData.user.id,
          p_access_code_hash: codeHash,
          p_whatsapp_code_hash: phoneCodeHash,
          p_access_code_ciphertext: codeCiphertext,
          p_qr_tokens: qrTokens,
        });
        issuedData = result.data;
        issueError = result.error;
        if (!issueError || issueError.code !== '23505') break;
      }
      if (issueError) return json({ error: issueError.message }, 400);
      const issued = Array.isArray(issuedData) ? issuedData[0] : issuedData as Record<string, unknown> | null;
      if (!issued?.issued_order_id || typeof issued.resolved_access_code_id !== 'string') {
        return json({ error: 'Penjualan OTS tidak berhasil diterbitkan.' }, 500);
      }

      const { data: codeRecord, error: codeError } = await serviceClient.from('ticket_access_codes')
        .select('access_code_ciphertext').eq('id', issued.resolved_access_code_id).maybeSingle();
      if (codeError || !codeRecord) return json({ error: 'Tiket terbit, tetapi Kode Akses belum dapat dibaca.' }, 500);
      const accessCode = await decryptSecret(codeRecord.access_code_ciphertext, encryptionKey);
      const { data: ticketRows, error: ticketRowsError } = await serviceClient.from('ticket_instances')
        .select('id, sequence_no, qr_token_ciphertext')
        .eq('ticket_order_id', issued.issued_order_id)
        .order('sequence_no', { ascending: true });
      if (ticketRowsError || !ticketRows || ticketRows.length !== body.quantity) {
        return json({ error: `Order ${orderNumber} sudah terbit, tetapi data QR tiket untuk PDF gagal dimuat. Jangan buat order ulang; muat ulang daftar tiket dan hubungi admin jika QR belum tersedia.` }, 500);
      }
      const tickets = await Promise.all(ticketRows.map(async (ticket) => ({
        id: ticket.id,
        sequence_no: ticket.sequence_no,
        qr_token: await decryptSecret(ticket.qr_token_ciphertext, encryptionKey),
      })));
      const message = `Halo *${body.full_name.trim()}*, tiket OTS untuk *${event.title}* sudah berhasil dibuat.\n\nOrder *#${orderNumber}* · ${body.quantity} tiket ${category.name}\nKode Akses: *${accessCode}*\n\nBuka tiket dan QR: ${ticketPageUrl}\n\nMasuk menggunakan nomor WhatsApp yang terdaftar dan Kode Akses tersebut.`;
      return json({
        order_number: orderNumber,
        access_code: accessCode,
        whatsapp_url: whatsappUrl(normalizedPhone, message),
        whatsapp_message: message,
        ticket_count: body.quantity,
        unit_price: category.ots_price,
        total_price: category.ots_price * body.quantity,
        tickets,
        event: {
          title: event.title,
          date: event.date,
          time: event.time ?? '',
          venue: event.venue ?? '',
          location: event.location,
          poster: event.poster,
          event_rules: event.event_rules,
        },
        category: category.name,
        full_name: body.full_name.trim(),
      });
    }

    if (body.action === 'issue-free-pass') {
      if (!encryptionKey || !accessCodePepper) return json({ error: 'Secret Ticketing belum dikonfigurasi.' }, 500);
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!body.event_id || !uuidPattern.test(body.event_id) || !body.ticket_id || !uuidPattern.test(body.ticket_id)
        || !body.full_name?.trim() || body.full_name.trim().length > 160 || !body.whatsapp?.trim()
        || !body.free_pass_reason?.trim() || !Number.isInteger(body.quantity) || (body.quantity ?? 0) < 1
        || (body.quantity ?? 0) > 10 || (!isAdmin && !isTicketAdmin)) {
        return json({ error: 'Lengkapi Event, kategori, nama maksimal 160 karakter, WhatsApp, jumlah 1–10, dan alasan Free Pass.' }, 400);
      }
      const ticketPageUrl = getTicketPageUrl(request.headers.get('origin'));
      if (!ticketPageUrl) return json({ error: 'Domain halaman tiket tidak dapat ditentukan dari request.' }, 400);
      if (body.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
        return json({ error: 'Alamat email penerima tidak valid.' }, 400);
      }
      if (body.free_pass_reason.trim().length > 300) {
        return json({ error: 'Alasan Free Pass maksimal 300 karakter.' }, 400);
      }
      if (!await hasEventScope(body.event_id, 'admin_ticket')) return json({ error: 'Event berada di luar scope Admin Tiket.' }, 403);

      const [{ data: event, error: eventError }, { data: category, error: categoryError }] = await Promise.all([
        serviceClient.from('events').select('id, title, status, date, time, venue, location').eq('id', body.event_id).maybeSingle(),
        serviceClient.from('event_tickets').select('id, event_id, name, status').eq('id', body.ticket_id).eq('event_id', body.event_id).maybeSingle(),
      ]);
      if (eventError || categoryError) return json({ error: 'Informasi Event atau kategori gagal dimuat.' }, 500);
      if (!event || !category || category.status !== 'active') return json({ error: 'Event atau kategori tiket tidak tersedia.' }, 404);

      const normalizedPhone = normalizeWhatsapp(body.whatsapp);
      if (normalizedPhone.length < 10 || normalizedPhone.length > 15) return json({ error: 'Nomor WhatsApp penerima tidak valid.' }, 400);
      const { data: previousCodes, error: previousCodesError } = await serviceClient.from('ticket_access_codes')
        .select('whatsapp_code_hash').eq('whatsapp_normalized', normalizedPhone);
      if (previousCodesError) return json({ error: 'Riwayat Kode Akses gagal dimuat.' }, 500);
      const usedCodeHashes = new Set((previousCodes ?? []).map((entry) => entry.whatsapp_code_hash));

      let issuedData: unknown = null;
      let issueError: { message: string; code?: string } | null = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const orderNumber = createTicketOrderNumber(event.title);
        const accessCode = createAccessCode();
        const phoneCodeHash = await whatsappAccessCodeHash(normalizedPhone, accessCode, accessCodePepper);
        if (usedCodeHashes.has(phoneCodeHash)) continue;
        const codeHash = await accessCodeHash(body.event_id, normalizedPhone, accessCode, accessCodePepper);
        const codeCiphertext = await encryptSecret(accessCode, encryptionKey);
        const qrTokens = await Promise.all(Array.from({ length: body.quantity! }, async () => {
          const token = randomToken();
          return { hash: await sha256(token), ciphertext: await encryptSecret(token, encryptionKey) };
        }));
        const result = await serviceClient.rpc('issue_ticket_free_pass', {
          p_order_number: orderNumber,
          p_event_id: body.event_id,
          p_ticket_id: body.ticket_id,
          p_full_name: body.full_name.trim(),
          p_email: body.email?.trim().toLowerCase() || null,
          p_whatsapp: normalizedPhone,
          p_quantity: body.quantity,
          p_reason: body.free_pass_reason.trim(),
          p_actor_id: authData.user.id,
          p_access_code_hash: codeHash,
          p_whatsapp_code_hash: phoneCodeHash,
          p_access_code_ciphertext: codeCiphertext,
          p_qr_tokens: qrTokens,
        });
        issuedData = result.data;
        issueError = result.error;
        if (!issueError || issueError.code !== '23505') break;
      }
      if (issueError) return json({ error: issueError.message }, 400);
      const issued = Array.isArray(issuedData) ? issuedData[0] : issuedData as Record<string, unknown> | null;
      if (!issued?.issued_order_id || typeof issued.resolved_access_code_id !== 'string') {
        return json({ error: 'Free Pass tidak berhasil diterbitkan.' }, 500);
      }

      const { data: codeRecord, error: codeError } = await serviceClient.from('ticket_access_codes')
        .select('access_code_ciphertext').eq('id', issued.resolved_access_code_id).maybeSingle();
      if (codeError || !codeRecord) return json({ error: 'Free Pass terbit, tetapi Kode Akses belum dapat dibaca. Gunakan fitur kirim ulang akses.' }, 500);
      const accessCode = await decryptSecret(codeRecord.access_code_ciphertext, encryptionKey);
      const order = {
        full_name: body.full_name.trim(),
        whatsapp: normalizedPhone,
        ticket_category: category.name,
        quantity: body.quantity!,
        order_number: '',
      };
      const { data: createdOrder, error: createdOrderError } = await serviceClient.from('ticket_orders')
        .select('order_number').eq('id', issued.issued_order_id).maybeSingle();
      if (createdOrderError || !createdOrder?.order_number) return json({ error: 'Free Pass terbit, tetapi nomor order belum dapat dibaca.' }, 500);
      order.order_number = createdOrder.order_number;

      let emailStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
      let emailMessage = body.email?.trim() ? 'Email belum terkirim.' : 'Email dilewati karena alamat email tidak diisi.';
      const recipientEmail = body.email?.trim().toLowerCase() || null;
      const { data: emailLog, error: emailLogError } = await serviceClient.from('ticket_email_logs')
        .insert({
          order_id: issued.issued_order_id,
          recipient_email: recipientEmail,
          email_type: 'free_pass_access',
          status: recipientEmail ? 'pending' : 'skipped',
          error_message: recipientEmail ? null : 'Email penerima Free Pass tidak diisi.',
        })
        .select('id')
        .maybeSingle();
      if (emailLogError || !emailLog) {
        emailStatus = 'failed';
        emailMessage = 'Tiket terbit, tetapi status email tidak dapat dicatat.';
        console.error('free pass email log could not be reserved');
      } else if (recipientEmail) {
        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        const emailContent = freePassConfirmationEmailHtml(order, event, accessCode, ticketPageUrl);
        if (!resendApiKey) {
          emailStatus = 'failed';
          emailMessage = 'Tiket terbit, tetapi konfigurasi layanan email belum tersedia.';
          const { error: logUpdateError } = await serviceClient.from('ticket_email_logs')
            .update({ status: 'failed', error_message: 'Konfigurasi Resend belum tersedia.' }).eq('id', emailLog.id);
          if (logUpdateError) console.error('free pass email failure could not be saved');
        } else {
          try {
            const resendResponse = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': `free-pass-access/${String(issued.issued_order_id)}`,
                'User-Agent': 'standupindo-cilegon-ticketing/1.0',
              },
              body: JSON.stringify({
                from: 'Standupindo Cilegon <noreply@standupindocilegon.id>',
                to: [recipientEmail],
                subject: emailContent.subject,
                html: emailContent.html,
                text: emailContent.text,
              }),
              signal: AbortSignal.timeout(10000),
            });
            const resendResult = await resendResponse.clone().json().catch(() => null) as { id?: string } | null;
            if (!resendResponse.ok) {
              emailStatus = 'failed';
              emailMessage = 'Tiket terbit, tetapi email gagal dikirim. Kirim akses lewat WhatsApp.';
              const errorMessage = await resendErrorMessage(resendResponse, [resendApiKey, accessCode]);
              const { error: logUpdateError } = await serviceClient.from('ticket_email_logs')
                .update({ status: 'failed', error_message: errorMessage }).eq('id', emailLog.id);
              if (logUpdateError) console.error('free pass email failure could not be saved');
            } else {
              emailStatus = 'sent';
              emailMessage = 'Email akses tiket berhasil dikirim.';
              const { error: sentLogError } = await serviceClient.from('ticket_email_logs')
                .update({
                  status: 'sent',
                  resend_message_id: typeof resendResult?.id === 'string' ? resendResult.id : null,
                  error_message: null,
                  sent_at: new Date().toISOString(),
                }).eq('id', emailLog.id);
              if (sentLogError) console.error('free pass email sent but its log could not be updated');
            }
          } catch {
            emailStatus = 'failed';
            emailMessage = 'Tiket terbit, tetapi koneksi email gagal. Kirim akses lewat WhatsApp.';
            const { error: logUpdateError } = await serviceClient.from('ticket_email_logs')
              .update({ status: 'failed', error_message: 'Koneksi ke layanan Resend gagal atau melewati batas waktu.' }).eq('id', emailLog.id);
            if (logUpdateError) console.error('free pass email failure could not be saved');
          }
        }
      }

      const whatsappMessage = freePassMessage(order.full_name, event.title, order.order_number, accessCode, ticketPageUrl);
      const freePassWhatsappUrl = whatsappUrl(normalizedPhone, whatsappMessage);
      return json({
        status: 'issued',
        order_id: issued.issued_order_id,
        order_number: order.order_number,
        access_code_id: issued.resolved_access_code_id,
        access_code: accessCode,
        whatsapp_url: freePassWhatsappUrl,
        ticket_count: issued.issued_ticket_count,
        email_status: emailStatus,
        email_message: emailMessage,
      });
    }

    if (body.action === 'resend-access-code') {
      if (!encryptionKey || !body.order_id || (!isAdmin && !isTicketAdmin)) return json({ error: 'Akses resend ditolak.' }, 403);
      const ticketPageUrl = getTicketPageUrl(request.headers.get('origin'));
      if (!ticketPageUrl) return json({ error: 'Domain halaman tiket tidak dapat ditentukan dari request.' }, 400);
      const { data: order } = await serviceClient.from('ticket_orders')
        .select('id, order_number, event_id, full_name, whatsapp, status, access_code_id, order_type')
        .eq('id', body.order_id).maybeSingle();
      if (!order || order.status !== 'Lunas' || !order.access_code_id) return json({ error: 'Order belum memiliki Access Code aktif.' }, 409);
      if (!await hasEventScope(order.event_id, 'admin_ticket')) return json({ error: 'Event di luar scope akun ini.' }, 403);
      const { data: codeRecord } = await serviceClient.from('ticket_access_codes')
        .select('access_code_ciphertext, status, last_sent_at, send_count').eq('id', order.access_code_id).maybeSingle();
      if (!codeRecord || codeRecord.status !== 'active') return json({ error: 'Access Code sudah tidak aktif.' }, 410);
      const accessCode = await decryptSecret(codeRecord.access_code_ciphertext, encryptionKey);
      const { data: event } = await serviceClient.from('events').select('title').eq('id', order.event_id).maybeSingle();
      const message = order.order_type === 'free_pass'
        ? freePassMessage(order.full_name, event?.title ?? 'Event', order.order_number ?? order.id, accessCode, ticketPageUrl)
        : accessMessage(order.full_name, event?.title ?? 'Event', order.order_number ?? order.id, accessCode, ticketPageUrl);
      return json({ access_code_id: order.access_code_id, access_code: accessCode, whatsapp_url: whatsappUrl(order.whatsapp, message), last_sent_at: codeRecord.last_sent_at, send_count: codeRecord.send_count });
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

    if (body.action === 'gate-settings' || body.action === 'scanner-gates') {
      if (!body.event_id || (!isAdmin && !(body.action === 'gate-settings' ? isTicketAdmin : isQrScanner))) {
        return json({ error: 'Akses pengaturan Gate ditolak.' }, 403);
      }
      const scopeRole = body.action === 'gate-settings' ? 'admin_ticket' : 'admin_qr';
      if (!await hasEventScope(body.event_id, scopeRole)) return json({ error: 'Event berada di luar scope akun ini.' }, 403);
      const [{ data: settings, error: settingsError }, { data: gates, error: gatesError }] = await Promise.all([
        serviceClient.from('event_checkin_settings').select('opens_at, closes_at, gates_enabled, time_restricted').eq('event_id', body.event_id).maybeSingle(),
        serviceClient.from('event_gates').select('id, name, event_gate_ticket_categories(event_ticket_id)').eq('event_id', body.event_id).order('name', { ascending: true }),
      ]);
      if (settingsError || gatesError) return json({ error: 'Pengaturan periode atau Gate gagal dimuat.' }, 500);
      if (body.action === 'scanner-gates') {
        if (settings && Date.parse(settings.closes_at) <= Date.now()) {
          const expiryError = await expireUnusedTickets(body.event_id);
          if (expiryError) return json({ error: 'Tiket yang masa check-in-nya berakhir gagal diperbarui.' }, 500);
        }
        const { data: categories, error: categoryError } = await serviceClient.from('event_tickets')
          .select('id, name').eq('event_id', body.event_id).eq('status', 'active');
        if (categoryError) return json({ error: 'Kategori tiket Gate gagal dimuat.' }, 500);
        const categoryNameById = new Map((categories ?? []).map((category) => [category.id, category.name]));
        return json({
          gates_enabled: settings?.gates_enabled ?? false,
          gates: settings?.gates_enabled ? (gates ?? []).map((gate) => ({
            id: gate.id,
            name: gate.name,
            categories: (gate.event_gate_ticket_categories ?? [])
              .map((category: { event_ticket_id: string }) => categoryNameById.get(category.event_ticket_id))
              .filter((name): name is string => Boolean(name)),
          })) : [],
        });
      }
      const { data: categories, error: categoryError } = await serviceClient.from('event_tickets')
        .select('id, name').eq('event_id', body.event_id).eq('status', 'active').order('sort_order', { ascending: true });
      if (categoryError) return json({ error: 'Kategori tiket gagal dimuat.' }, 500);
      return json({
        settings,
        gates_enabled: settings?.gates_enabled ?? false,
        categories: categories ?? [],
        gates: (gates ?? []).map((gate) => ({
          id: gate.id,
          name: gate.name,
          category_ids: (gate.event_gate_ticket_categories ?? []).map((category: { event_ticket_id: string }) => category.event_ticket_id),
        })),
      });
    }

    if (body.action === 'save-gate-settings') {
      if (!isAdmin && !isTicketAdmin) return json({ error: 'Akses pengelolaan Gate ditolak.' }, 403);
      if (!body.event_id || !body.opens_at || !body.closes_at || typeof body.gates_enabled !== 'boolean'
        || typeof body.time_restricted !== 'boolean' || !Array.isArray(body.gates)) {
        return json({ error: 'Lengkapi Event, periode check-in, dan Gate.' }, 400);
      }
      if (!await hasEventScope(body.event_id, 'admin_ticket')) return json({ error: 'Event berada di luar scope Admin Tiket.' }, 403);
      const opensAt = new Date(body.opens_at);
      const closesAt = new Date(body.closes_at);
      if (!Number.isFinite(opensAt.getTime()) || !Number.isFinite(closesAt.getTime()) || opensAt >= closesAt) {
        return json({ error: 'Periode check-in tidak valid.' }, 400);
      }
      const { error } = await serviceClient.rpc('save_event_gate_settings', {
        p_event_id: body.event_id,
        p_opens_at: opensAt.toISOString(),
        p_closes_at: closesAt.toISOString(),
        p_gates: body.gates,
        p_gates_enabled: body.gates_enabled,
        p_time_restricted: body.time_restricted,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ saved: true });
    }

    if (body.action === 'check-in') {
      if (!body.event_id || !body.qr_token || (!isAdmin && !isQrScanner)) return json({ error: 'Akses scanner tidak valid.' }, 403);
      if (!await hasEventScope(body.event_id, 'admin_qr')) return json({ error: 'Event di luar scope Admin QR.' }, 403);
      const qrTokenHash = await sha256(body.qr_token);
      const { data: ticket, error: ticketError } = await serviceClient.from('ticket_instances')
        .select('id, ticket_order_id, sequence_no, status, checked_in_at, checked_in_by, check_in_source, event_ticket_id')
        .eq('event_id', body.event_id).eq('qr_token_hash', qrTokenHash).maybeSingle();
      if (ticketError) return json({ error: 'Data tiket gagal dimuat.' }, 500);

      const { data, error } = await userClient.rpc('check_in_ticket', {
        p_event_id: body.event_id,
        p_qr_token_hash: qrTokenHash,
        p_gate_id: body.gate_id,
      });
      if (error) return json({ error: error.message }, 403);
      const result = data as Record<string, unknown>;
      if (result.status === 'checked_in') await publishCheckInUpdate(body.event_id);
      if (result.status === 'checkin_closed' && result.expired === true) {
        const expiryError = await expireUnusedTickets(body.event_id);
        if (expiryError) return json({ error: 'Tiket yang masa check-in-nya berakhir gagal diperbarui.' }, 500);
      }
      const { data: event, error: eventError } = await serviceClient.from('events')
        .select('title').eq('id', body.event_id).maybeSingle();
      if (eventError) return json({ error: 'Data Event gagal dimuat.' }, 500);

      if (event) {
        result.event_title ??= event.title;
      }
      if (ticket && ['checked_in', 'already_used'].includes(String(result.status))) {
        const { data: order, error: orderError } = await serviceClient.from('ticket_orders')
          .select('full_name, ticket_category, order_number, order_type').eq('id', ticket.ticket_order_id).maybeSingle();
        if (orderError) return json({ error: 'Data order tiket gagal dimuat.' }, 500);
        let previousCheckInAt = ticket.checked_in_at;
        let previousCheckInSource = ticket.check_in_source;
        if (result.status === 'already_used') {
          const { data: currentTicket, error: currentTicketError } = await serviceClient.from('ticket_instances')
            .select('checked_in_at, check_in_source').eq('id', ticket.id).maybeSingle();
          if (currentTicketError) return json({ error: 'Riwayat check-in tiket gagal dimuat.' }, 500);
          previousCheckInAt = currentTicket?.checked_in_at ?? previousCheckInAt;
          previousCheckInSource = currentTicket?.check_in_source ?? previousCheckInSource;
        }
        const { data: ticketCategory, error: categoryError } = ticket.event_ticket_id
          ? await serviceClient.from('event_tickets').select('name').eq('id', ticket.event_ticket_id).maybeSingle()
          : { data: null, error: null };
        if (categoryError) return json({ error: 'Kategori tiket gagal dimuat.' }, 500);
        const checkInSource = result.status === 'already_used' ? previousCheckInSource : result.gate ?? ticket.check_in_source;
        const gateName = checkInSource === 'qr' ? 'QR Scanner'
          : checkInSource === 'manual' ? 'Check-in Manual'
            : checkInSource ?? 'Gate Scanner';
        Object.assign(result, {
          full_name: order?.full_name,
          ticket_category: ticketCategory?.name ?? order?.ticket_category,
          ticket_number: ticket.sequence_no,
          order_number: order?.order_number,
          order_type: order?.order_type,
          checked_in_at: result.status === 'already_used' ? result.checked_in_at ?? previousCheckInAt : result.checked_in_at,
          gate: gateName,
        });
      }
      return json(result);
    }

    if (body.action === 'manual-check-in') {
      if (!body.event_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.event_id)
        || !body.order_number?.trim() || (!isAdmin && !isQrScanner)) {
        return json({ error: 'Event dan nomor order wajib valid.' }, 400);
      }
      if (!await hasEventScope(body.event_id, 'admin_qr')) return json({ error: 'Event di luar scope Admin QR.' }, 403);
      if (!encryptionKey) return json({ error: 'Secret Ticketing belum dikonfigurasi.' }, 500);

      const { data: order, error: orderError } = await serviceClient.from('ticket_orders')
        .select('id, full_name, order_number, ticket_category, order_type').eq('event_id', body.event_id).eq('order_number', body.order_number.trim()).maybeSingle();
      if (orderError) return json({ error: 'Order tiket gagal dimuat.' }, 500);
      if (!order) return json({ error: 'Order tidak ditemukan untuk Event ini.' }, 404);

      const { data: tickets, error: ticketsError } = await fetchAllPages((from, to) => serviceClient.from('ticket_instances')
        .select('qr_token_ciphertext, status, checked_in_at, sequence_no, check_in_source')
        .eq('event_id', body.event_id).eq('ticket_order_id', order.id)
        .order('sequence_no', { ascending: true }).range(from, to));
      if (ticketsError) return json({ error: 'Tiket order gagal dimuat.' }, 500);
      const candidates = (tickets ?? []).filter((ticket) => ticket.status === 'active' && !ticket.checked_in_at);
      if (!candidates.length) {
        const usedTicket = (tickets ?? []).find((ticket) => Boolean(ticket.checked_in_at));
        if (usedTicket) return json({
          ok: false,
          status: 'already_used',
          message: 'Tiket sudah digunakan.',
          full_name: order.full_name,
          ticket_category: order.ticket_category,
          ticket_number: usedTicket.sequence_no,
          order_number: order.order_number,
          order_type: order.order_type,
          checked_in_at: usedTicket.checked_in_at,
          gate: usedTicket.check_in_source ?? 'Gate Scanner',
        });
        if ((tickets ?? []).some((ticket) => ticket.status === 'expired')) {
          const { data: event } = await serviceClient.from('events').select('title').eq('id', body.event_id).maybeSingle();
          return json({ ok: false, status: 'checkin_closed', message: 'Periode check-in telah berakhir.', event_title: event?.title });
        }
        return json({ ok: false, status: 'invalid', message: 'QR Code tidak ditemukan atau tiket tidak dapat digunakan.' });
      }

      for (const ticket of candidates) {
        const qrToken = await decryptSecret(ticket.qr_token_ciphertext, encryptionKey);
        const { data, error } = await userClient.rpc('check_in_ticket', {
          p_event_id: body.event_id,
          p_qr_token_hash: await sha256(qrToken),
          p_gate_id: body.gate_id,
        });
        if (error) return json({ error: error.message }, 403);
        const checkInResult = data as Record<string, unknown>;
        if (checkInResult.status === 'checked_in') await publishCheckInUpdate(body.event_id);
        if (checkInResult.status === 'checkin_closed' && checkInResult.expired === true) {
          const expiryError = await expireUnusedTickets(body.event_id);
          if (expiryError) return json({ error: 'Tiket yang masa check-in-nya berakhir gagal diperbarui.' }, 500);
        }
        if (checkInResult.status !== 'already_used') return json({
          ...checkInResult,
          full_name: order.full_name,
          ticket_category: checkInResult.ticket_category ?? order.ticket_category,
          ticket_number: ticket.sequence_no,
          order_number: order.order_number,
          order_type: order.order_type,
        });
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
      if (body.event_id && body.include_stats === false) {
        const selectedEventId = body.event_id;
        if (!await hasEventScope(selectedEventId, scopeRole)) {
          return json({ error: 'Event di luar scope Admin QR atau tidak ditemukan.' }, 403);
        }
        const { data: attendeeTickets, error } = await fetchAllPages((from, to) => serviceClient.from('ticket_instances')
          .select('sequence_no, status, checked_in_at, ticket_order:ticket_orders!inner(order_number, full_name, order_type)')
          .eq('event_id', selectedEventId)
          .eq('ticket_order.status', 'Lunas')
          .or('status.in.(active,expired),checked_in_at.not.is.null')
          .order('ticket_order_id', { ascending: true }).order('sequence_no', { ascending: true }).range(from, to));
        if (error) return json({ error: 'Daftar peserta Event gagal dimuat.' }, 500);
        const attendees = (attendeeTickets ?? []).flatMap((ticket) => {
          const order = ticket.ticket_order;
          if (!order) return [];
          if (!ticket.status || (!['active', 'expired'].includes(ticket.status) && !ticket.checked_in_at)) return [];
          return [{
            full_name: order.full_name,
            order_number: order.order_number,
            order_type: order.order_type,
            sequence_no: ticket.sequence_no,
            checked_in_at: ticket.checked_in_at,
          }];
        });
        return json({ total_tickets: 0, checked_in: 0, not_checked_in: 0, attendees });
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
      const byEvent = new Map<string, { total: number; checked_in: number }>();
      if (body.include_stats !== false) {
        for (const ids of chunkValues(eventIds, 20)) {
          const counts = await Promise.all(ids.map(async (id) => {
            const [totalResult, checkedInResult] = await Promise.all([
              serviceClient.from('ticket_instances').select('id', { count: 'exact', head: true })
                .eq('event_id', id).or('status.in.(active,expired),checked_in_at.not.is.null'),
              serviceClient.from('ticket_instances').select('id', { count: 'exact', head: true })
                .eq('event_id', id).not('checked_in_at', 'is', null),
            ]);
            return { id, totalResult, checkedInResult };
          }));
          if (counts.some(({ totalResult, checkedInResult }) => totalResult.error || checkedInResult.error)) {
            return json({ error: 'Statistik tiket gagal dimuat.' }, 500);
          }
          counts.forEach(({ id, totalResult, checkedInResult }) => {
            byEvent.set(id, { total: totalResult.count ?? 0, checked_in: checkedInResult.count ?? 0 });
          });
        }
      }
      const eventSummaries = (scopedEvents ?? []).map((event) => ({ ...event, ...(byEvent.get(event.id) ?? { total: 0, checked_in: 0 }) }));
      let attendees: Array<{
        full_name: string;
        order_number: string | null;
        order_type: 'paid' | 'free_pass';
        sequence_no: number;
        checked_in_at: string | null;
      }> = [];
      if (body.event_id) {
        const selectedEvent = scopedEvents.find((event) => event.id === body.event_id);
        if (!selectedEvent) return json({ error: 'Event di luar scope Admin QR atau tidak ditemukan.' }, 403);
        const [{ data: paidOrders, error: paidOrdersError }, { data: attendeeTickets, error: attendeeTicketsError }] = await Promise.all([
          fetchAllPages((from, to) => serviceClient.from('ticket_orders')
            .select('id, order_number, full_name, order_type')
            .eq('event_id', selectedEvent.id).eq('status', 'Lunas')
            .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)),
          fetchAllPages((from, to) => serviceClient.from('ticket_instances')
            .select('ticket_order_id, sequence_no, status, checked_in_at')
            .eq('event_id', selectedEvent.id)
            .or('status.in.(active,expired),checked_in_at.not.is.null')
            .order('ticket_order_id', { ascending: true }).order('sequence_no', { ascending: true }).range(from, to)),
        ]);
        if (paidOrdersError) return json({ error: 'Daftar order lunas gagal dimuat.' }, 500);
        if (attendeeTicketsError) return json({ error: 'Daftar tiket Event gagal dimuat.' }, 500);
        const ordersById = new Map((paidOrders ?? []).map((order) => [order.id, order]));
        attendees = (attendeeTickets ?? [])
          .filter((ticket) => ticket.status === 'active' || ticket.status === 'expired' || ticket.checked_in_at)
          .flatMap((ticket) => {
            const order = ordersById.get(ticket.ticket_order_id);
            return order ? [{
              full_name: order.full_name,
              order_number: order.order_number,
              order_type: order.order_type,
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