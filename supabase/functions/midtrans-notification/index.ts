import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  accessCodeHash,
  createAccessCode,
  decryptSecret,
  encryptSecret,
  normalizeWhatsapp,
  randomToken,
  sha256,
  whatsappAccessCodeHash,
} from '../_shared/ticketing.ts';
import { paymentConfirmationEmailHtml } from '../_shared/ticket-email.ts';
import { MIDTRANS_MERCHANT_ID, MIDTRANS_STATUS_API_BASE_URL } from '../_shared/midtrans.ts';

type MidtransNotification = {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  merchant_id?: string;
};

type MidtransStatus = {
  order_id?: string;
  transaction_id?: string;
  transaction_status?: string;
  status_code?: string;
  gross_amount?: string;
  currency?: string;
  merchant_id?: string;
  fraud_status?: string;
  payment_type?: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function sha512(value: string) {
  const digest = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEquals(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function parseIdrAmount(value: string | undefined) {
  if (!value || !/^\d+(?:\.00)?$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : null;
}

function basicAuthorization(serverKey: string) {
  return `Basic ${btoa(`${serverKey}:`)}`;
}

async function sendConfirmationEmail(
  serviceClient: ReturnType<typeof createClient>,
  order: {
    id: string;
    email: string | null;
    full_name: string;
    whatsapp: string;
    ticket_category: string;
    quantity: number;
    total_price: number;
    event_id: string;
  },
  accessCode: string,
  encryptionKey: string,
) {
  const recipient = order.email?.trim().toLowerCase() ?? '';
  const { data: log, error: insertError } = await serviceClient.from('ticket_email_logs')
    .insert({
      order_id: order.id,
      recipient_email: recipient || null,
      status: recipient ? 'pending' : 'skipped',
      error_message: recipient ? null : 'Email pembeli tidak tersedia pada order.',
    })
    .select('id, status')
    .maybeSingle();

  let emailLog = log;
  if (insertError?.code === '23505') {
    const { data: existingLog, error: loadError } = await serviceClient.from('ticket_email_logs')
      .select('id, status, recipient_email').eq('order_id', order.id).maybeSingle();
    if (loadError || !existingLog) return;
    if (existingLog.status === 'sent' || existingLog.status === 'skipped') return;
    emailLog = existingLog;
  } else if (insertError || !log) {
    console.error('Midtrans confirmation email log could not be reserved');
    return;
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const encryptionKeyReady = Boolean(encryptionKey);
  if (!resendApiKey || !encryptionKeyReady || !recipient || !emailLog) {
    await serviceClient.from('ticket_email_logs').update({
      status: recipient ? 'failed' : 'skipped',
      error_message: !resendApiKey ? 'Konfigurasi Resend belum tersedia.' : 'Email atau konfigurasi akses tiket tidak tersedia.',
    }).eq('id', emailLog.id);
    return;
  }

  const { data: event, error: eventError } = await serviceClient.from('events')
    .select('title, date, time, venue, location').eq('id', order.event_id).maybeSingle();
  if (eventError || !event) {
    await serviceClient.from('ticket_email_logs')
      .update({ status: 'failed', error_message: 'Informasi Event tidak tersedia.' }).eq('id', emailLog.id);
    return;
  }

  const content = paymentConfirmationEmailHtml(order, event, accessCode, 'https://standupindocilegon.id/tiket');
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `ticket-payment-confirmation/${order.id}`,
        'User-Agent': 'standupindo-cilegon-ticketing/1.0',
      },
      body: JSON.stringify({
        from: 'Standupindo Cilegon <noreply@standupindocilegon.id>',
        to: [recipient],
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.clone().json().catch(() => null) as { id?: string } | null;
    if (!response.ok) {
      await serviceClient.from('ticket_email_logs').update({
        status: 'failed', error_message: `Resend HTTP ${response.status}`,
      }).eq('id', emailLog.id);
      return;
    }
    await serviceClient.from('ticket_email_logs').update({
      status: 'sent',
      resend_message_id: typeof result?.id === 'string' ? result.id : null,
      error_message: null,
      sent_at: new Date().toISOString(),
    }).eq('id', emailLog.id);
  } catch {
    await serviceClient.from('ticket_email_logs').update({
      status: 'failed', error_message: 'Koneksi ke layanan email gagal atau melewati batas waktu.',
    }).eq('id', emailLog.id);
  }
}

serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const serverKey = Deno.env.get('MIDTRANS_SECRET_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const encryptionKey = Deno.env.get('TICKET_ACCESS_CODE_ENCRYPTION_KEY');
  const accessCodePepper = Deno.env.get('TICKET_ACCESS_CODE_PEPPER');
  if (!serverKey || !supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Konfigurasi webhook Midtrans belum lengkap.' }, 503);
  }

  let notification: MidtransNotification;
  try {
    notification = await request.json() as MidtransNotification;
  } catch {
    return json({ error: 'Notifikasi tidak valid.' }, 400);
  }
  if (!notification.order_id || !notification.status_code || !notification.gross_amount
    || !notification.signature_key || !notification.merchant_id) {
    return json({ error: 'Field notifikasi wajib tidak lengkap.' }, 400);
  }

  const expectedSignature = await sha512(
    `${notification.order_id}${notification.status_code}${notification.gross_amount}${serverKey}`,
  );
  if (!constantTimeEquals(expectedSignature.toLowerCase(), notification.signature_key.toLowerCase())) {
    return json({ error: 'Signature notifikasi tidak valid.' }, 401);
  }
  if (notification.merchant_id !== MIDTRANS_MERCHANT_ID) return json({ error: 'Merchant ID tidak cocok.' }, 400);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: transaction, error: transactionError } = await serviceClient.from('ticket_midtrans_transactions')
    .select('id, ticket_order_id, provider_order_id, gross_amount, currency, allocation_status')
    .eq('provider_order_id', notification.order_id).maybeSingle();
  if (transactionError) return json({ error: 'Transaksi lokal gagal dimuat.' }, 503);
  if (!transaction) {
    console.error('Signed Midtrans notification has no local provider order', notification.order_id);
    return json({ received: true, ignored: true });
  }

  let statusResponse: Response;
  try {
    statusResponse = await fetch(
      `${MIDTRANS_STATUS_API_BASE_URL}/${encodeURIComponent(notification.order_id)}/status`,
      { headers: { Authorization: basicAuthorization(serverKey), Accept: 'application/json' }, signal: AbortSignal.timeout(10000) },
    );
  } catch {
    return json({ error: 'Status API Midtrans tidak dapat dijangkau.' }, 503);
  }
  if (statusResponse.status === 404) return json({ received: true, pending: true });
  if (!statusResponse.ok) return json({ error: 'Status API Midtrans gagal memverifikasi transaksi.' }, 503);

  const status = await statusResponse.json().catch(() => null) as MidtransStatus | null;
  if (!status || status.order_id !== transaction.provider_order_id || status.merchant_id !== MIDTRANS_MERCHANT_ID) {
    return json({ error: 'Identitas transaksi dari Status API tidak cocok.' }, 400);
  }
  const grossAmount = parseIdrAmount(status.gross_amount);
  const transactionStatus = status.transaction_status?.toLowerCase();
  if (grossAmount === null || status.currency !== 'IDR' || grossAmount !== transaction.gross_amount) {
    await serviceClient.from('ticket_midtrans_transactions').update({
      transaction_status: transactionStatus ?? 'failure',
      provider_transaction_id: status.transaction_id ?? null,
      fraud_status: status.fraud_status ?? null,
      payment_type: status.payment_type ?? null,
      allocation_status: 'needs_admin_review',
      review_reason: 'Nominal atau mata uang Status API tidak cocok dengan order.',
      notification_received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', transaction.id);
    return json({ received: true, review_required: true });
  }
  if (!transactionStatus || ![
    'pending', 'capture', 'settlement', 'deny', 'cancel', 'expire', 'failure',
    'refund', 'partial_refund', 'chargeback', 'partial_chargeback', 'authorize',
  ].includes(transactionStatus)) {
    return json({ error: 'Status transaksi Midtrans tidak dikenali.' }, 400);
  }

  const isSuccessful = status.status_code === '200'
    && ['settlement', 'capture'].includes(transactionStatus)
    && (!status.fraud_status || status.fraud_status.toLowerCase() === 'accept');
  const isPostSettlementReview = ['refund', 'partial_refund', 'chargeback', 'partial_chargeback'].includes(transactionStatus)
    || (transactionStatus === 'deny' && transaction.allocation_status === 'issued')
    || (['capture', 'settlement'].includes(transactionStatus)
      && ['challenge', 'deny'].includes(status.fraud_status?.toLowerCase() ?? ''));
  const { data: savedTransaction, error: statusSaveError } = await serviceClient.from('ticket_midtrans_transactions')
    .update({
      provider_transaction_id: status.transaction_id ?? null,
      transaction_status: transactionStatus,
      fraud_status: status.fraud_status ?? null,
      payment_type: status.payment_type ?? null,
      notification_received_at: new Date().toISOString(),
      ...(isPostSettlementReview ? {
        allocation_status: 'needs_admin_review',
        review_reason: `Status pascapembayaran memerlukan pemeriksaan Admin: ${transactionStatus}.`,
      } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', transaction.id)
    .select('id, allocation_status')
    .single();
  if (statusSaveError || !savedTransaction) return json({ error: 'Status transaksi gagal dicatat.' }, 503);
  if (!isSuccessful || isPostSettlementReview) return json({ received: true, status: transactionStatus });

  if (!encryptionKey || !accessCodePepper) return json({ error: 'Secret penerbitan tiket belum dikonfigurasi.' }, 503);
  const { data: order, error: orderError } = await serviceClient.from('ticket_orders')
    .select('id, order_number, event_id, full_name, email, whatsapp, ticket_category, quantity, total_price, status, access_code_id, payment_channel')
    .eq('id', transaction.ticket_order_id).maybeSingle();
  if (orderError || !order || order.payment_channel !== 'midtrans') return json({ error: 'Order Midtrans tidak ditemukan.' }, 503);

  let allocationResult: Record<string, unknown> | null = null;
  let allocationError: { message: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const normalizedPhone = normalizeWhatsapp(order.whatsapp);
    const accessCode = createAccessCode();
    const qrTokens = await Promise.all(Array.from({ length: order.quantity }, async () => {
      const token = randomToken();
      return { hash: await sha256(token), ciphertext: await encryptSecret(token, encryptionKey) };
    }));
    const result = await serviceClient.rpc('settle_midtrans_ticket_order', {
      p_order_id: order.id,
      p_provider_order_id: transaction.provider_order_id,
      p_access_code_hash: await accessCodeHash(order.event_id, normalizedPhone, accessCode, accessCodePepper),
      p_whatsapp_code_hash: await whatsappAccessCodeHash(normalizedPhone, accessCode, accessCodePepper),
      p_access_code_ciphertext: await encryptSecret(accessCode, encryptionKey),
      p_qr_tokens: qrTokens,
    });
    allocationError = result.error;
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    allocationResult = row && typeof row === 'object' ? row as Record<string, unknown> : null;
    if (!allocationError || !allocationError.message.includes('Access Code sudah pernah digunakan')) break;
  }
  if (allocationError) return json({ error: 'Pembayaran tervalidasi tetapi alokasi tiket perlu dicoba ulang.' }, 503);
  if (!allocationResult || allocationResult.allocation_state !== 'issued' || typeof allocationResult.resolved_access_code_id !== 'string') {
    return json({ received: true, review_required: allocationResult?.allocation_state === 'needs_admin_review' });
  }

  const { data: codeRecord, error: codeError } = await serviceClient.from('ticket_access_codes')
    .select('access_code_ciphertext').eq('id', allocationResult.resolved_access_code_id).maybeSingle();
  if (codeError || !codeRecord) return json({ error: 'Tiket terbit tetapi Kode Akses gagal dimuat.' }, 503);
  const accessCode = await decryptSecret(codeRecord.access_code_ciphertext, encryptionKey);
  const emailTask = sendConfirmationEmail(serviceClient, order, accessCode, encryptionKey);
  const edgeRuntime = (globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil(task: Promise<unknown>): void } }).EdgeRuntime;
  if (edgeRuntime) edgeRuntime.waitUntil(emailTask);
  else await emailTask;
  return json({ received: true, status: 'issued' });
});