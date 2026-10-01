ALTER TABLE public.ticket_orders
  DROP CONSTRAINT IF EXISTS ticket_orders_status_check;

ALTER TABLE public.ticket_orders
  ADD CONSTRAINT ticket_orders_status_check CHECK (
    status IN (
      'Draft Pembayaran',
      'Menunggu Pembayaran',
      'Menunggu Verifikasi',
      'Lunas',
      'Ditolak',
      'Expired',
      'Sudah Bayar',
      'Terverifikasi',
      'Selesai',
      'Dibatalkan'
    )
  );

DROP INDEX IF EXISTS public.idx_ticket_orders_expiring;
CREATE INDEX idx_ticket_orders_expiring
  ON public.ticket_orders(expires_at)
  WHERE status IN ('Draft Pembayaran', 'Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar');

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
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 10 THEN
    RAISE EXCEPTION 'Jumlah tiket harus antara 1 dan 10';
  END IF;
  IF nullif(trim(p_full_name), '') IS NULL THEN
    RAISE EXCEPTION 'Nama pembeli wajib diisi';
  END IF;
  IF nullif(trim(p_email), '') IS NULL OR trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Email pembeli wajib diisi dengan format yang valid';
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
    AND status IN ('Draft Pembayaran', 'Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar')
    AND expires_at IS NOT NULL
    AND expires_at <= now();

  SELECT coalesce(sum(quantity), 0) INTO committed_quantity
  FROM public.ticket_orders
  WHERE ticket_id = p_ticket_id
    AND status IN ('Draft Pembayaran', 'Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar', 'Lunas', 'Terverifikasi', 'Selesai');

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
    lower(trim(p_email)),
    normalized_phone,
    p_quantity,
    selected_ticket.price,
    selected_ticket.price * p_quantity,
    null,
    'Draft Pembayaran',
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
  WHERE status IN ('Draft Pembayaran', 'Menunggu Pembayaran')
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
    AND status IN ('Draft Pembayaran', 'Menunggu Pembayaran')
    AND expires_at IS NOT NULL
    AND expires_at <= now();
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_ticket_orders_for_events(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_ticket_orders_for_events(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.submit_ticket_payment(
  p_order_id uuid,
  p_whatsapp text,
  p_payment_amount integer,
  p_payment_proof_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_order public.ticket_orders%ROWTYPE;
BEGIN
  SELECT * INTO selected_order
  FROM public.ticket_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order tidak ditemukan'; END IF;
  IF public.normalize_ticket_whatsapp(p_whatsapp) <> selected_order.whatsapp THEN
    RAISE EXCEPTION 'Nomor WhatsApp tidak sesuai dengan order';
  END IF;
  IF selected_order.status NOT IN ('Draft Pembayaran', 'Menunggu Pembayaran')
    OR selected_order.expires_at IS NULL
    OR selected_order.expires_at <= now() THEN
    RAISE EXCEPTION 'Batas pembayaran order sudah berakhir';
  END IF;
  IF p_payment_amount IS NULL OR p_payment_amount <> selected_order.total_price THEN
    RAISE EXCEPTION 'Nominal pembayaran harus sama dengan total order';
  END IF;
  IF p_payment_proof_path IS NULL
    OR split_part(p_payment_proof_path, '/', 1) <> p_order_id::text THEN
    RAISE EXCEPTION 'Lokasi bukti pembayaran tidak valid';
  END IF;

  UPDATE public.ticket_orders
  SET status = 'Menunggu Verifikasi',
      payment_amount = p_payment_amount,
      payment_proof_path = p_payment_proof_path,
      payment_submitted_at = now(),
      expires_at = NULL,
      updated_at = now()
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_ticket_payment(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_ticket_payment(uuid, text, integer, text) TO service_role;
