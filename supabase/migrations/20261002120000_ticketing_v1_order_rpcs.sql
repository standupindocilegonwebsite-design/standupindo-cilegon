-- Ticket orders must be created through the atomic RPC so tier quota and the
-- payment-method snapshot cannot be bypassed by a browser client.

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_orders_order_number
  ON public.ticket_orders(order_number)
  WHERE order_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_ticket_whatsapp(value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits text := regexp_replace(coalesce(value, ''), '\D', '', 'g');
BEGIN
  IF digits = '' THEN RETURN ''; END IF;
  IF left(digits, 2) = '62' THEN RETURN '62' || regexp_replace(substr(digits, 3), '^0+', ''); END IF;
  IF left(digits, 1) = '0' THEN RETURN '62' || substr(digits, 2); END IF;
  IF left(digits, 1) = '8' THEN RETURN '62' || digits; END IF;
  RETURN digits;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_ticket_order(
  p_order_number text,
  p_event_id uuid,
  p_ticket_id uuid,
  p_full_name text,
  p_email text,
  p_whatsapp text,
  p_quantity integer,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_event public.events%ROWTYPE;
  selected_ticket public.event_tickets%ROWTYPE;
  selected_payment public.event_payment_methods%ROWTYPE;
  normalized_phone text;
  committed_quantity bigint;
  new_order_id uuid := gen_random_uuid();
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 20 THEN
    RAISE EXCEPTION 'Jumlah tiket harus antara 1 dan 20';
  END IF;
  IF nullif(trim(p_full_name), '') IS NULL THEN
    RAISE EXCEPTION 'Nama pembeli wajib diisi';
  END IF;
  normalized_phone := public.normalize_ticket_whatsapp(p_whatsapp);
  IF length(normalized_phone) < 10 OR length(normalized_phone) > 15 THEN
    RAISE EXCEPTION 'Nomor WhatsApp tidak valid';
  END IF;
  IF p_order_number !~ '^[A-Z]{3}-[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'Nomor order tidak valid';
  END IF;

  SELECT * INTO selected_event
  FROM public.events
  WHERE id = p_event_id
    AND published = true
    AND status = 'upcoming'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event tidak tersedia untuk pemesanan'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));
  SELECT * INTO selected_ticket
  FROM public.event_tickets
  WHERE id = p_ticket_id
    AND event_id = p_event_id
    AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jenis tiket tidak tersedia'; END IF;

  SELECT * INTO selected_payment
  FROM public.event_payment_methods
  WHERE event_id = p_event_id
    AND is_active = true
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Informasi pembayaran Event belum aktif'; END IF;

  UPDATE public.ticket_orders
  SET status = 'Expired', updated_at = now()
  WHERE ticket_id = p_ticket_id
    AND status IN ('Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar')
    AND expires_at IS NOT NULL
    AND expires_at <= now();

  SELECT coalesce(sum(quantity), 0) INTO committed_quantity
  FROM public.ticket_orders
  WHERE ticket_id = p_ticket_id
    AND status IN ('Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar', 'Lunas', 'Terverifikasi', 'Selesai');

  IF selected_ticket.quota IS NOT NULL
    AND committed_quantity + p_quantity > selected_ticket.quota THEN
    RAISE EXCEPTION 'Kuota tiket tidak mencukupi';
  END IF;

  INSERT INTO public.ticket_orders (
    id, order_number, event_id, ticket_id, ticket_category,
    full_name, email, whatsapp, quantity, unit_price, total_price,
    notes, status, expires_at, payment_method_id, payment_method_snapshot
  ) VALUES (
    new_order_id,
    p_order_number,
    p_event_id,
    p_ticket_id,
    selected_ticket.name,
    trim(p_full_name),
    nullif(lower(trim(p_email)), ''),
    normalized_phone,
    p_quantity,
    selected_ticket.price,
    selected_ticket.price * p_quantity,
    nullif(trim(p_notes), ''),
    'Menunggu Pembayaran',
    now() + interval '30 minutes',
    selected_payment.id,
    jsonb_build_object(
      'recipient_name', selected_payment.recipient_name,
      'bank_name', selected_payment.bank_name,
      'account_number', selected_payment.account_number,
      'qris_storage_path', selected_payment.qris_storage_path,
      'note', selected_payment.note
    )
  );

  RETURN new_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ticket_order(text, uuid, uuid, text, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ticket_order(text, uuid, uuid, text, text, text, integer, text) TO anon;

-- Public clients may not bypass quota or omit the payment snapshot.
DROP POLICY IF EXISTS "public_insert_ticket_orders" ON public.ticket_orders;

CREATE OR REPLACE FUNCTION public.expire_unpaid_ticket_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count integer;
BEGIN
  UPDATE public.ticket_orders
  SET status = 'Expired', updated_at = now()
  WHERE status = 'Menunggu Pembayaran'
    AND expires_at IS NOT NULL
    AND expires_at <= now();
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_unpaid_ticket_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_ticket_orders() TO service_role;

CREATE OR REPLACE FUNCTION public.expire_ticket_orders_for_events(p_event_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Operasi harus dipanggil melalui service backend'; END IF;
  UPDATE public.ticket_orders
  SET status = 'Expired', updated_at = now()
  WHERE event_id = ANY(p_event_ids)
    AND status = 'Menunggu Pembayaran'
    AND expires_at IS NOT NULL
    AND expires_at <= now();
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_ticket_orders_for_events(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_ticket_orders_for_events(uuid[]) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $ticketing_expiry_schedule$
DECLARE
  existing_job_id bigint;
BEGIN
  FOR existing_job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'ticketing-v1-expire-unpaid-orders'
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'ticketing-v1-expire-unpaid-orders',
    '* * * * *',
    'SELECT public.expire_unpaid_ticket_orders();'
  );
END;
$ticketing_expiry_schedule$;