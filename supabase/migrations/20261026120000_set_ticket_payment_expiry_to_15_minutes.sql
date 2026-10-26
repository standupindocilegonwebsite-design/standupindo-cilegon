CREATE OR REPLACE FUNCTION public.create_ticket_order_priced_with_payment(
  p_order_number text,
  p_event_id uuid,
  p_ticket_id uuid,
  p_full_name text,
  p_email text,
  p_whatsapp text,
  p_quantity integer,
  p_notes text,
  p_voucher_code text,
  p_payment_channel text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  selected_event public.events%ROWTYPE;
  selected_ticket public.event_tickets%ROWTYPE;
  selected_payment public.event_payment_methods%ROWTYPE;
  normalized_phone text;
  committed_quantity bigint;
  new_order_id uuid := gen_random_uuid();
  pricing jsonb;
  new_total integer;
  new_discount integer;
  new_fee integer;
  new_subtotal integer;
  voucher_id uuid;
  voucher_code text;
  selected_mode text;
  payment_snapshot jsonb;
  payment_expires_at timestamptz := now() + interval '15 minutes';
BEGIN
  IF p_payment_channel NOT IN ('manual', 'midtrans') THEN
    RAISE EXCEPTION 'Metode pembayaran tidak valid';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 10 THEN
    RAISE EXCEPTION 'Jumlah tiket harus antara 1 dan 10';
  END IF;
  IF nullif(trim(p_full_name), '') IS NULL THEN
    RAISE EXCEPTION 'Nama pembeli wajib diisi';
  END IF;
  normalized_phone := public.normalize_ticket_whatsapp(p_whatsapp);
  IF length(normalized_phone) < 10 OR length(normalized_phone) > 15 THEN
    RAISE EXCEPTION 'Nomor WhatsApp tidak valid';
  END IF;
  IF p_order_number IS NULL OR p_order_number !~ '^[A-Z]{3}-[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'Nomor order tidak valid';
  END IF;

  SELECT * INTO selected_event
  FROM public.events
  WHERE id = p_event_id AND published = true AND status = 'upcoming'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event tidak tersedia untuk pemesanan'; END IF;
  selected_mode := selected_event.ticket_payment_mode;
  IF (p_payment_channel = 'manual' AND selected_mode NOT IN ('manual', 'both'))
    OR (p_payment_channel = 'midtrans' AND selected_mode NOT IN ('midtrans', 'both')) THEN
    RAISE EXCEPTION 'Metode pembayaran tidak diizinkan untuk Event ini';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));
  SELECT * INTO selected_ticket
  FROM public.event_tickets
  WHERE id = p_ticket_id AND event_id = p_event_id
    AND status = 'active' AND available_public = true
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jenis tiket tidak tersedia'; END IF;

  pricing := public.calculate_ticket_order_pricing(
    p_event_id, p_ticket_id, p_quantity, normalized_phone, p_voucher_code, true
  );
  new_total := (pricing->>'total_price')::integer;
  new_discount := (pricing->>'discount_amount')::integer;
  new_fee := (pricing->>'additional_fee_amount')::integer;
  new_subtotal := (pricing->>'ticket_subtotal')::integer;
  voucher_id := nullif(pricing->>'voucher_id', '')::uuid;
  voucher_code := nullif(pricing->>'voucher_code', '');
  IF p_payment_channel = 'midtrans' AND new_total <= 0 THEN
    RAISE EXCEPTION 'Nominal pembayaran Midtrans harus lebih dari nol';
  END IF;

  IF p_payment_channel = 'manual' THEN
    SELECT method.* INTO selected_payment
    FROM public.event_payment_method_assignments assignment
    JOIN public.event_payment_methods method ON method.id = assignment.payment_method_id
    WHERE assignment.event_id = p_event_id AND assignment.is_active = true
    FOR SHARE OF assignment, method;
    IF NOT FOUND THEN RAISE EXCEPTION 'Informasi pembayaran Event belum aktif'; END IF;
    payment_snapshot := jsonb_build_object(
      'recipient_name', selected_payment.recipient_name,
      'bank_name', selected_payment.bank_name,
      'account_number', selected_payment.account_number,
      'qris_storage_path', selected_payment.qris_storage_path,
      'note', selected_payment.note
    );
  ELSE
    payment_snapshot := jsonb_build_object('method', 'midtrans');
  END IF;

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
  IF selected_ticket.quota IS NOT NULL AND committed_quantity + p_quantity > selected_ticket.quota THEN
    RAISE EXCEPTION 'Kuota tiket tidak mencukupi';
  END IF;

  INSERT INTO public.ticket_orders (
    id, order_number, event_id, ticket_id, ticket_category, full_name, email,
    whatsapp, quantity, unit_price, total_price, notes, status, expires_at,
    payment_method_id, payment_method_snapshot, sale_channel, voucher_id,
    voucher_code_snapshot, ticket_subtotal, discount_amount,
    additional_fee_amount, price_breakdown, payment_channel, payment_mode_snapshot
  ) VALUES (
    new_order_id, p_order_number, p_event_id, p_ticket_id, selected_ticket.name,
    trim(p_full_name), nullif(lower(trim(p_email)), ''), normalized_phone, p_quantity,
    selected_ticket.price, new_total, nullif(trim(p_notes), ''), 'Menunggu Pembayaran',
    payment_expires_at, selected_payment.id, payment_snapshot, 'online',
    voucher_id, voucher_code, new_subtotal, new_discount, new_fee,
    pricing->'price_breakdown', p_payment_channel, selected_mode
  );

  IF voucher_id IS NOT NULL THEN
    INSERT INTO public.ticket_voucher_redemptions (
      voucher_id, ticket_order_id, event_id, ticket_id, order_number,
      voucher_code_snapshot, whatsapp_normalized, discount_amount,
      transaction_status, usage_status, expires_at
    ) VALUES (
      voucher_id, new_order_id, p_event_id, p_ticket_id, p_order_number,
      voucher_code, normalized_phone, new_discount, 'Menunggu Pembayaran',
      'reserved', payment_expires_at
    );
  END IF;

  RETURN jsonb_build_object(
    'id', new_order_id,
    'order_number', p_order_number,
    'total_price', new_total,
    'expires_at', payment_expires_at,
    'price_breakdown', pricing->'price_breakdown',
    'payment_channel', p_payment_channel
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_ticket_order_priced_with_payment(text, uuid, uuid, text, text, text, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ticket_order_priced_with_payment(text, uuid, uuid, text, text, text, integer, text, text, text) TO anon, authenticated;
