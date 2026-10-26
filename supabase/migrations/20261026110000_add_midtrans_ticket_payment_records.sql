ALTER TABLE public.ticket_orders
  ADD COLUMN IF NOT EXISTS payment_channel text,
  ADD COLUMN IF NOT EXISTS payment_mode_snapshot text,
  ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz;

UPDATE public.ticket_orders
SET payment_channel = 'manual',
    payment_mode_snapshot = 'manual'
WHERE sale_channel = 'online'
  AND order_type = 'paid'
  AND (payment_channel IS NULL OR payment_mode_snapshot IS NULL);

ALTER TABLE public.ticket_orders
  DROP CONSTRAINT IF EXISTS ticket_orders_payment_channel_check,
  DROP CONSTRAINT IF EXISTS ticket_orders_payment_mode_snapshot_check,
  DROP CONSTRAINT IF EXISTS ticket_orders_online_payment_channel_pair_check;

ALTER TABLE public.ticket_orders
  ADD CONSTRAINT ticket_orders_payment_channel_check
    CHECK (payment_channel IS NULL OR payment_channel IN ('manual', 'midtrans')),
  ADD CONSTRAINT ticket_orders_payment_mode_snapshot_check
    CHECK (payment_mode_snapshot IS NULL OR payment_mode_snapshot IN ('manual', 'midtrans', 'both')),
  ADD CONSTRAINT ticket_orders_online_payment_channel_pair_check
    CHECK (
      (sale_channel = 'online' AND order_type = 'paid'
        AND payment_channel IS NOT NULL AND payment_mode_snapshot IS NOT NULL)
      OR (NOT (sale_channel = 'online' AND order_type = 'paid')
        AND payment_channel IS NULL AND payment_mode_snapshot IS NULL)
    );

CREATE TABLE IF NOT EXISTS public.ticket_midtrans_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_order_id uuid NOT NULL UNIQUE REFERENCES public.ticket_orders(id) ON DELETE RESTRICT,
  provider_order_id text NOT NULL UNIQUE,
  provider_transaction_id text,
  snap_token text,
  redirect_url text,
  gross_amount integer NOT NULL CHECK (gross_amount > 0),
  currency text NOT NULL DEFAULT 'IDR' CHECK (currency = 'IDR'),
  transaction_status text NOT NULL DEFAULT 'creating' CHECK (transaction_status IN (
    'creating', 'created', 'pending', 'capture', 'settlement', 'deny', 'cancel',
    'expire', 'failure', 'refund', 'partial_refund', 'chargeback',
    'partial_chargeback', 'authorize'
  )),
  fraud_status text,
  payment_type text,
  allocation_status text NOT NULL DEFAULT 'pending' CHECK (allocation_status IN (
    'pending', 'issued', 'needs_admin_review'
  )),
  review_reason text,
  expires_at timestamptz NOT NULL,
  notification_received_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_midtrans_transactions_review
  ON public.ticket_midtrans_transactions(updated_at DESC)
  WHERE allocation_status = 'needs_admin_review';

CREATE INDEX IF NOT EXISTS idx_ticket_midtrans_transactions_expiry
  ON public.ticket_midtrans_transactions(expires_at)
  WHERE allocation_status = 'pending';

ALTER TABLE public.ticket_midtrans_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_midtrans_transactions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ticket_midtrans_transactions TO service_role;

CREATE OR REPLACE FUNCTION public.guard_online_ticket_order_payment_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  selected_payment_mode text;
BEGIN
  IF NEW.order_type IS DISTINCT FROM 'paid'
    OR NEW.sale_channel IS DISTINCT FROM 'online' THEN
    NEW.payment_channel := NULL;
    NEW.payment_mode_snapshot := NULL;
    RETURN NEW;
  END IF;

  SELECT event.ticket_payment_mode INTO selected_payment_mode
  FROM public.events AS event
  WHERE event.id = NEW.event_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event pemesanan tidak ditemukan';
  END IF;

  NEW.payment_channel := coalesce(NEW.payment_channel, 'manual');
  NEW.payment_mode_snapshot := selected_payment_mode;

  IF NEW.payment_channel = 'manual' AND selected_payment_mode NOT IN ('manual', 'both') THEN
    RAISE EXCEPTION 'Pembayaran manual tidak tersedia untuk Event ini';
  END IF;
  IF NEW.payment_channel = 'midtrans' AND selected_payment_mode NOT IN ('midtrans', 'both') THEN
    RAISE EXCEPTION 'Midtrans tidak tersedia untuk Event ini';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_ticket_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_ticket public.event_tickets%ROWTYPE;
BEGIN
  IF NEW.order_type NOT IN ('paid', 'free_pass') THEN
    RAISE EXCEPTION 'Jenis order tidak valid';
  END IF;
  IF NEW.order_type = 'free_pass' AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Free Pass hanya dapat diterbitkan melalui Admin Tiket';
  END IF;
  IF NEW.sale_channel NOT IN ('online', 'ots', 'free_pass') THEN
    RAISE EXCEPTION 'Sumber transaksi tidak valid';
  END IF;

  SELECT * INTO selected_ticket
  FROM public.event_tickets
  WHERE id = NEW.ticket_id AND event_id = NEW.event_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket tidak tersedia untuk event ini';
  END IF;

  IF NEW.order_type = 'free_pass' THEN
    NEW.sale_channel := 'free_pass';
    NEW.ticket_category := selected_ticket.name;
    NEW.unit_price := selected_ticket.price;
    NEW.total_price := 0;
    NEW.payment_amount := 0;
    NEW.payment_proof_path := NULL;
    NEW.payment_submitted_at := NULL;
    NEW.payment_method_id := NULL;
    NEW.payment_method_snapshot := NULL;
    NEW.payment_channel := NULL;
    NEW.payment_mode_snapshot := NULL;
    NEW.status := 'Lunas';
    NEW.expires_at := NULL;
  ELSIF NEW.sale_channel = 'ots' THEN
    IF NOT selected_ticket.available_ots OR selected_ticket.ots_price IS NULL THEN
      RAISE EXCEPTION 'Kategori tiket tidak tersedia untuk penjualan OTS';
    END IF;
    NEW.ticket_category := selected_ticket.name;
    NEW.unit_price := selected_ticket.ots_price;
    NEW.total_price := selected_ticket.ots_price * NEW.quantity;
    NEW.payment_amount := NEW.total_price;
    NEW.payment_proof_path := NULL;
    NEW.payment_submitted_at := NULL;
    NEW.payment_method_id := NULL;
    NEW.payment_method_snapshot := NULL;
    NEW.payment_channel := NULL;
    NEW.payment_mode_snapshot := NULL;
    NEW.status := 'Lunas';
    NEW.expires_at := NULL;
  ELSE
    IF NOT selected_ticket.available_public THEN
      RAISE EXCEPTION 'Kategori tiket tidak tersedia untuk pembelian publik';
    END IF;
    NEW.ticket_category := selected_ticket.name;
    NEW.unit_price := selected_ticket.price;
    NEW.total_price := coalesce(NEW.total_price, selected_ticket.price * NEW.quantity);
    NEW.status := 'Menunggu Pembayaran';
  END IF;
  RETURN NEW;
END;
$$;

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
    now() + interval '30 minutes', selected_payment.id, payment_snapshot, 'online',
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
      'reserved', now() + interval '30 minutes'
    );
  END IF;

  RETURN jsonb_build_object(
    'id', new_order_id,
    'order_number', p_order_number,
    'total_price', new_total,
    'price_breakdown', pricing->'price_breakdown',
    'payment_channel', p_payment_channel
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_ticket_order_priced_with_payment(text, uuid, uuid, text, text, text, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ticket_order_priced_with_payment(text, uuid, uuid, text, text, text, integer, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.settle_midtrans_ticket_order(
  p_order_id uuid,
  p_provider_order_id text,
  p_access_code_hash text,
  p_whatsapp_code_hash text,
  p_access_code_ciphertext text,
  p_qr_tokens jsonb
)
RETURNS TABLE (allocation_state text, resolved_access_code_id uuid, issued_ticket_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  selected_order public.ticket_orders%ROWTYPE;
  selected_transaction public.ticket_midtrans_transactions%ROWTYPE;
  selected_event public.events%ROWTYPE;
  selected_ticket public.event_tickets%ROWTYPE;
  selected_voucher public.ticket_vouchers%ROWTYPE;
  selected_code public.ticket_access_codes%ROWTYPE;
  committed_quantity bigint;
  voucher_redemption_count bigint;
  buyer_voucher_redemption_count bigint;
  instance_count integer;
  supplied_token jsonb;
  token_index integer := 0;
  normalized_phone text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Operasi harus dipanggil melalui service backend';
  END IF;

  SELECT * INTO selected_order
  FROM public.ticket_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order tidak ditemukan'; END IF;

  SELECT * INTO selected_transaction
  FROM public.ticket_midtrans_transactions
  WHERE ticket_order_id = p_order_id
    AND provider_order_id = p_provider_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaksi Midtrans tidak ditemukan untuk order'; END IF;

  IF selected_transaction.allocation_status = 'issued' THEN
    RETURN QUERY SELECT 'issued'::text, selected_order.access_code_id,
      (SELECT count(*)::integer FROM public.ticket_instances WHERE ticket_order_id = p_order_id);
    RETURN;
  END IF;
  IF selected_transaction.allocation_status = 'needs_admin_review' THEN
    RETURN QUERY SELECT 'needs_admin_review'::text, NULL::uuid, 0;
    RETURN;
  END IF;

  IF selected_order.payment_channel IS DISTINCT FROM 'midtrans'
    OR selected_transaction.transaction_status NOT IN ('settlement', 'capture')
    OR (selected_transaction.fraud_status IS NOT NULL AND lower(selected_transaction.fraud_status) <> 'accept') THEN
    RAISE EXCEPTION 'Status pembayaran Midtrans belum memenuhi syarat penerbitan tiket';
  END IF;
  IF selected_transaction.gross_amount IS DISTINCT FROM selected_order.total_price
    OR selected_transaction.currency IS DISTINCT FROM 'IDR' THEN
    UPDATE public.ticket_midtrans_transactions
    SET allocation_status = 'needs_admin_review',
        review_reason = 'Nominal atau mata uang transaksi tidak sesuai dengan order.',
        updated_at = now()
    WHERE id = selected_transaction.id;
    RETURN QUERY SELECT 'needs_admin_review'::text, NULL::uuid, 0;
    RETURN;
  END IF;
  IF selected_order.status NOT IN ('Menunggu Pembayaran', 'Expired') THEN
    RAISE EXCEPTION 'Status order tidak dapat diselesaikan melalui Midtrans';
  END IF;

  SELECT * INTO selected_event
  FROM public.events
  WHERE id = selected_order.event_id
  FOR SHARE;
  IF NOT FOUND OR selected_event.status IN ('completed', 'cancelled') THEN
    UPDATE public.ticket_midtrans_transactions
    SET allocation_status = 'needs_admin_review',
        review_reason = 'Event tidak tersedia saat pembayaran terverifikasi.',
        updated_at = now()
    WHERE id = selected_transaction.id;
    RETURN QUERY SELECT 'needs_admin_review'::text, NULL::uuid, 0;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(selected_order.ticket_id::text, 0));
  SELECT * INTO selected_ticket
  FROM public.event_tickets
  WHERE id = selected_order.ticket_id
    AND event_id = selected_order.event_id
    AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.ticket_midtrans_transactions
    SET allocation_status = 'needs_admin_review',
        review_reason = 'Kategori tiket tidak lagi tersedia saat pembayaran terverifikasi.',
        updated_at = now()
    WHERE id = selected_transaction.id;
    RETURN QUERY SELECT 'needs_admin_review'::text, NULL::uuid, 0;
    RETURN;
  END IF;

  SELECT coalesce(sum(order_row.quantity), 0) INTO committed_quantity
  FROM public.ticket_orders AS order_row
  WHERE order_row.ticket_id = selected_order.ticket_id
    AND order_row.id <> p_order_id
    AND (
      order_row.status IN ('Menunggu Verifikasi', 'Sudah Bayar', 'Lunas', 'Terverifikasi', 'Selesai')
      OR (order_row.status IN ('Draft Pembayaran', 'Menunggu Pembayaran')
        AND (order_row.expires_at IS NULL OR order_row.expires_at > now()))
    );
  IF selected_ticket.quota IS NOT NULL
    AND committed_quantity + selected_order.quantity > selected_ticket.quota THEN
    UPDATE public.ticket_midtrans_transactions
    SET allocation_status = 'needs_admin_review',
        review_reason = 'Pembayaran terverifikasi setelah reservasi berakhir dan kuota tidak lagi tersedia.',
        updated_at = now()
    WHERE id = selected_transaction.id;
    RETURN QUERY SELECT 'needs_admin_review'::text, NULL::uuid, 0;
    RETURN;
  END IF;

  IF selected_order.voucher_id IS NOT NULL THEN
    SELECT * INTO selected_voucher
    FROM public.ticket_vouchers
    WHERE id = selected_order.voucher_id
    FOR UPDATE;
    IF NOT FOUND OR NOT selected_voucher.is_active OR selected_voucher.deleted_at IS NOT NULL
      OR selected_voucher.starts_at > now() OR selected_voucher.ends_at <= now() THEN
      UPDATE public.ticket_midtrans_transactions
      SET allocation_status = 'needs_admin_review',
          review_reason = 'Voucher order tidak lagi berlaku saat pembayaran terverifikasi.',
          updated_at = now()
      WHERE id = selected_transaction.id;
      RETURN QUERY SELECT 'needs_admin_review'::text, NULL::uuid, 0;
      RETURN;
    END IF;

    SELECT count(*) INTO voucher_redemption_count
    FROM public.ticket_voucher_redemptions AS redemption
    WHERE redemption.voucher_id = selected_voucher.id
      AND redemption.ticket_order_id <> p_order_id
      AND redemption.usage_status IN ('reserved', 'redeemed')
      AND (redemption.usage_status = 'redeemed' OR redemption.expires_at IS NULL OR redemption.expires_at > now());
    SELECT count(*) INTO buyer_voucher_redemption_count
    FROM public.ticket_voucher_redemptions AS redemption
    WHERE redemption.voucher_id = selected_voucher.id
      AND redemption.ticket_order_id <> p_order_id
      AND redemption.whatsapp_normalized = public.normalize_ticket_whatsapp(selected_order.whatsapp)
      AND redemption.usage_status IN ('reserved', 'redeemed')
      AND (redemption.usage_status = 'redeemed' OR redemption.expires_at IS NULL OR redemption.expires_at > now());
    IF (selected_voucher.total_quota IS NOT NULL AND voucher_redemption_count >= selected_voucher.total_quota)
      OR (selected_voucher.per_buyer_limit IS NOT NULL AND buyer_voucher_redemption_count >= selected_voucher.per_buyer_limit) THEN
      UPDATE public.ticket_midtrans_transactions
      SET allocation_status = 'needs_admin_review',
          review_reason = 'Kuota voucher tidak lagi tersedia saat pembayaran terverifikasi.',
          updated_at = now()
      WHERE id = selected_transaction.id;
      RETURN QUERY SELECT 'needs_admin_review'::text, NULL::uuid, 0;
      RETURN;
    END IF;
  END IF;

  normalized_phone := public.normalize_ticket_whatsapp(selected_order.whatsapp);
  PERFORM pg_advisory_xact_lock(hashtextextended(normalized_phone, 0));
  SELECT * INTO selected_code
  FROM public.ticket_access_codes
  WHERE event_id = selected_order.event_id
    AND whatsapp_normalized = normalized_phone
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    IF nullif(p_access_code_hash, '') IS NULL
      OR nullif(p_whatsapp_code_hash, '') IS NULL
      OR nullif(p_access_code_ciphertext, '') IS NULL THEN
      RAISE EXCEPTION 'Access Code baru harus disiapkan server';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.ticket_access_codes
      WHERE whatsapp_normalized = normalized_phone
        AND whatsapp_code_hash = p_whatsapp_code_hash
    ) THEN
      RAISE EXCEPTION 'Access Code sudah pernah digunakan untuk nomor ini';
    END IF;
    INSERT INTO public.ticket_access_codes (
      event_id, whatsapp_normalized, access_code_hash, whatsapp_code_hash, access_code_ciphertext
    ) VALUES (
      selected_order.event_id, normalized_phone, p_access_code_hash,
      p_whatsapp_code_hash, p_access_code_ciphertext
    ) RETURNING * INTO selected_code;
  END IF;

  SELECT count(*)::integer INTO instance_count
  FROM public.ticket_instances
  WHERE ticket_order_id = p_order_id;
  IF instance_count = 0 THEN
    IF jsonb_typeof(p_qr_tokens) IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_qr_tokens) <> selected_order.quantity THEN
      RAISE EXCEPTION 'Token QR harus disiapkan untuk setiap tiket order';
    END IF;
    FOR supplied_token IN SELECT value FROM jsonb_array_elements(p_qr_tokens)
    LOOP
      token_index := token_index + 1;
      IF nullif(supplied_token->>'hash', '') IS NULL
        OR nullif(supplied_token->>'ciphertext', '') IS NULL THEN
        RAISE EXCEPTION 'Token QR tidak valid';
      END IF;
      INSERT INTO public.ticket_instances (
        ticket_order_id, event_id, event_ticket_id, sequence_no, qr_token_hash, qr_token_ciphertext
      ) VALUES (
        p_order_id, selected_order.event_id, selected_order.ticket_id,
        token_index, supplied_token->>'hash', supplied_token->>'ciphertext'
      );
    END LOOP;
  ELSIF instance_count <> selected_order.quantity THEN
    RAISE EXCEPTION 'Jumlah ticket instance tidak sesuai dengan quantity order';
  END IF;

  UPDATE public.ticket_orders
  SET status = 'Lunas',
      payment_amount = selected_order.total_price,
      payment_verified_at = now(),
      access_code_id = selected_code.id,
      expires_at = NULL,
      updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.ticket_orders AS existing_order
  SET access_code_id = selected_code.id
  WHERE existing_order.event_id = selected_order.event_id
    AND public.normalize_ticket_whatsapp(existing_order.whatsapp) = normalized_phone
    AND existing_order.status IN ('Lunas', 'Terverifikasi', 'Selesai');

  UPDATE public.ticket_midtrans_transactions
  SET allocation_status = 'issued',
      review_reason = NULL,
      processed_at = now(),
      updated_at = now()
  WHERE id = selected_transaction.id;

  INSERT INTO public.ticket_email_logs (
    order_id, recipient_email, status, error_message
  ) VALUES (
    selected_order.id,
    nullif(lower(trim(selected_order.email)), ''),
    CASE WHEN nullif(trim(selected_order.email), '') IS NULL THEN 'skipped' ELSE 'pending' END,
    CASE WHEN nullif(trim(selected_order.email), '') IS NULL THEN 'Email pembeli tidak tersedia pada order.' ELSE NULL END
  )
  ON CONFLICT (order_id) DO NOTHING;

  RETURN QUERY SELECT 'issued'::text, selected_code.id, selected_order.quantity;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_midtrans_ticket_order(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_midtrans_ticket_order(uuid, text, text, text, text, jsonb) TO service_role;