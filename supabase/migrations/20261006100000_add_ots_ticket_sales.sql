ALTER TABLE public.event_tickets
  ADD COLUMN IF NOT EXISTS available_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS available_ots boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ots_price integer;

ALTER TABLE public.event_tickets
  DROP CONSTRAINT IF EXISTS event_tickets_ots_price_nonnegative;
ALTER TABLE public.event_tickets
  ADD CONSTRAINT event_tickets_ots_price_nonnegative
  CHECK (ots_price IS NULL OR ots_price >= 0);

ALTER TABLE public.event_tickets
  DROP CONSTRAINT IF EXISTS event_tickets_ots_price_required;
ALTER TABLE public.event_tickets
  ADD CONSTRAINT event_tickets_ots_price_required
  CHECK (NOT available_ots OR ots_price IS NOT NULL);

ALTER TABLE public.ticket_orders
  ADD COLUMN IF NOT EXISTS sale_channel text NOT NULL DEFAULT 'online';

UPDATE public.ticket_orders
SET sale_channel = 'free_pass'
WHERE order_type = 'free_pass' AND sale_channel = 'online';

ALTER TABLE public.ticket_orders
  DROP CONSTRAINT IF EXISTS ticket_orders_sale_channel_check;
ALTER TABLE public.ticket_orders
  ADD CONSTRAINT ticket_orders_sale_channel_check
  CHECK (sale_channel IN ('online', 'ots', 'free_pass'));

DROP POLICY IF EXISTS "public_read_active_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "public_read_active_event_tickets_anon" ON public.event_tickets;
DROP POLICY IF EXISTS "public_read_active_event_tickets_authenticated" ON public.event_tickets;

CREATE POLICY "public_read_active_event_tickets_anon"
  ON public.event_tickets
  FOR SELECT
  TO anon
  USING (status = 'active' AND available_public);

CREATE POLICY "public_read_active_event_tickets_authenticated"
  ON public.event_tickets
  FOR SELECT
  TO authenticated
  USING (
    status = 'active'
    AND available_public
    AND NOT public.jwt_has_role('admin_ticket')
    AND NOT public.jwt_has_role('admin_qr')
  );

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
    NEW.status := 'Lunas';
    NEW.expires_at := NULL;
  ELSE
    IF NOT selected_ticket.available_public THEN
      RAISE EXCEPTION 'Kategori tiket tidak tersedia untuk pembelian publik';
    END IF;
    NEW.ticket_category := selected_ticket.name;
    NEW.unit_price := selected_ticket.price;
    NEW.total_price := selected_ticket.price * NEW.quantity;
    NEW.status := 'Menunggu Pembayaran';
  END IF;
  RETURN NEW;
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
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 10 THEN
    RAISE EXCEPTION 'Jumlah tiket harus antara 1 dan 10';
  END IF;
  IF nullif(trim(p_full_name), '') IS NULL THEN RAISE EXCEPTION 'Nama pembeli wajib diisi'; END IF;
  normalized_phone := public.normalize_ticket_whatsapp(p_whatsapp);
  IF length(normalized_phone) < 10 OR length(normalized_phone) > 15 THEN
    RAISE EXCEPTION 'Nomor WhatsApp tidak valid';
  END IF;
  IF p_order_number !~ '^[A-Z]{3}-[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'Nomor order tidak valid'; END IF;

  SELECT * INTO selected_event FROM public.events
  WHERE id = p_event_id AND published = true AND status = 'upcoming'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event tidak tersedia untuk pemesanan'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));
  SELECT * INTO selected_ticket FROM public.event_tickets
  WHERE id = p_ticket_id AND event_id = p_event_id
    AND status = 'active' AND available_public
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jenis tiket tidak tersedia untuk pembelian publik'; END IF;

  SELECT * INTO selected_payment FROM public.event_payment_methods
  WHERE event_id = p_event_id AND is_active = true
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Informasi pembayaran Event belum aktif'; END IF;

  UPDATE public.ticket_orders SET status = 'Expired', updated_at = now()
  WHERE ticket_id = p_ticket_id
    AND status IN ('Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar')
    AND expires_at IS NOT NULL AND expires_at <= now();

  SELECT coalesce(sum(quantity), 0) INTO committed_quantity
  FROM public.ticket_orders
  WHERE ticket_id = p_ticket_id
    AND status IN ('Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar', 'Lunas', 'Terverifikasi', 'Selesai');
  IF selected_ticket.quota IS NOT NULL AND committed_quantity + p_quantity > selected_ticket.quota THEN
    RAISE EXCEPTION 'Kuota tiket tidak mencukupi';
  END IF;

  INSERT INTO public.ticket_orders (
    id, order_number, event_id, ticket_id, ticket_category, full_name, email, whatsapp,
    quantity, unit_price, total_price, notes, status, expires_at,
    payment_method_id, payment_method_snapshot, sale_channel
  ) VALUES (
    new_order_id, p_order_number, p_event_id, p_ticket_id, selected_ticket.name,
    trim(p_full_name), nullif(lower(trim(p_email)), ''), normalized_phone,
    p_quantity, selected_ticket.price, selected_ticket.price * p_quantity,
    nullif(trim(p_notes), ''), 'Menunggu Pembayaran', now() + interval '30 minutes',
    selected_payment.id,
    jsonb_build_object(
      'recipient_name', selected_payment.recipient_name,
      'bank_name', selected_payment.bank_name,
      'account_number', selected_payment.account_number,
      'qris_storage_path', selected_payment.qris_storage_path,
      'note', selected_payment.note
    ),
    'online'
  );
  RETURN new_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_ticket_ots(
  p_order_number text,
  p_event_id uuid,
  p_ticket_id uuid,
  p_full_name text,
  p_whatsapp text,
  p_quantity integer,
  p_actor_id uuid,
  p_access_code_hash text,
  p_whatsapp_code_hash text,
  p_access_code_ciphertext text,
  p_qr_tokens jsonb
)
RETURNS TABLE (issued_order_id uuid, resolved_access_code_id uuid, issued_ticket_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_event public.events%ROWTYPE;
  selected_ticket public.event_tickets%ROWTYPE;
  selected_code public.ticket_access_codes%ROWTYPE;
  normalized_phone text;
  committed_quantity bigint;
  token_value jsonb;
  token_index integer := 0;
  new_order_id uuid := gen_random_uuid();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Operasi harus dipanggil melalui Admin Tiket'; END IF;
  IF p_actor_id IS NULL OR p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 10 THEN
    RAISE EXCEPTION 'Admin penerbit atau jumlah tiket tidak valid (maksimal 10)';
  END IF;
  IF p_full_name IS NULL OR nullif(trim(p_full_name), '') IS NULL OR length(trim(p_full_name)) > 160 THEN
    RAISE EXCEPTION 'Nama penerima wajib diisi maksimal 160 karakter';
  END IF;
  IF p_order_number IS NULL OR p_order_number !~ '^[A-Z]{3}-[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'Nomor order tidak valid'; END IF;
  normalized_phone := public.normalize_ticket_whatsapp(p_whatsapp);
  IF length(normalized_phone) < 10 OR length(normalized_phone) > 15 THEN
    RAISE EXCEPTION 'Nomor WhatsApp tidak valid';
  END IF;
  IF p_qr_tokens IS NULL OR jsonb_typeof(p_qr_tokens) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_qr_tokens) <> p_quantity THEN
    RAISE EXCEPTION 'Token QR harus disiapkan untuk setiap tiket';
  END IF;

  SELECT * INTO selected_event FROM public.events WHERE id = p_event_id FOR SHARE;
  IF NOT FOUND OR selected_event.status <> 'upcoming' THEN
    RAISE EXCEPTION 'Event tidak tersedia untuk penjualan OTS';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));
  SELECT * INTO selected_ticket FROM public.event_tickets
  WHERE id = p_ticket_id AND event_id = p_event_id AND status = 'active'
    AND available_ots AND ots_price IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kategori tiket tidak tersedia untuk penjualan OTS'; END IF;

  UPDATE public.ticket_orders SET status = 'Expired', updated_at = now()
  WHERE ticket_id = p_ticket_id
    AND status IN ('Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar')
    AND expires_at IS NOT NULL AND expires_at <= now();
  SELECT coalesce(sum(quantity), 0) INTO committed_quantity
  FROM public.ticket_orders
  WHERE ticket_id = p_ticket_id
    AND status IN ('Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar', 'Lunas', 'Terverifikasi', 'Selesai');
  IF selected_ticket.quota IS NOT NULL AND committed_quantity + p_quantity > selected_ticket.quota THEN
    RAISE EXCEPTION 'Kuota tiket tidak mencukupi';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text || ':' || normalized_phone, 0));
  SELECT * INTO selected_code FROM public.ticket_access_codes
  WHERE event_id = p_event_id AND whatsapp_normalized = normalized_phone AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    IF nullif(p_access_code_hash, '') IS NULL OR nullif(p_whatsapp_code_hash, '') IS NULL
      OR nullif(p_access_code_ciphertext, '') IS NULL THEN
      RAISE EXCEPTION 'Access Code baru harus disiapkan server';
    END IF;
    IF EXISTS (SELECT 1 FROM public.ticket_access_codes
      WHERE whatsapp_normalized = normalized_phone AND whatsapp_code_hash = p_whatsapp_code_hash) THEN
      RAISE EXCEPTION 'Access Code sudah pernah digunakan untuk nomor ini; buat kode baru';
    END IF;
    INSERT INTO public.ticket_access_codes (
      event_id, whatsapp_normalized, access_code_hash, whatsapp_code_hash, access_code_ciphertext
    ) VALUES (
      p_event_id, normalized_phone, p_access_code_hash, p_whatsapp_code_hash, p_access_code_ciphertext
    ) RETURNING * INTO selected_code;
  END IF;

  INSERT INTO public.ticket_orders (
    id, order_number, event_id, ticket_id, ticket_category, full_name, whatsapp,
    quantity, unit_price, total_price, payment_amount, status, sale_channel,
    order_type, issued_by, access_code_id
  ) VALUES (
    new_order_id, p_order_number, p_event_id, p_ticket_id, selected_ticket.name,
    trim(p_full_name), normalized_phone, p_quantity, selected_ticket.ots_price,
    selected_ticket.ots_price * p_quantity, selected_ticket.ots_price * p_quantity,
    'Lunas', 'ots', 'paid', p_actor_id, selected_code.id
  );

  FOR token_value IN SELECT value FROM jsonb_array_elements(p_qr_tokens)
  LOOP
    token_index := token_index + 1;
    IF nullif(token_value->>'hash', '') IS NULL OR nullif(token_value->>'ciphertext', '') IS NULL THEN
      RAISE EXCEPTION 'Token QR tidak valid';
    END IF;
    INSERT INTO public.ticket_instances (
      ticket_order_id, event_id, event_ticket_id, sequence_no, qr_token_hash, qr_token_ciphertext
    ) VALUES (
      new_order_id, p_event_id, p_ticket_id, token_index,
      token_value->>'hash', token_value->>'ciphertext'
    );
  END LOOP;
  RETURN QUERY SELECT new_order_id, selected_code.id, p_quantity;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_ticket_ots(text, uuid, uuid, text, text, integer, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_ticket_ots(text, uuid, uuid, text, text, integer, uuid, text, text, text, jsonb)
  TO service_role;
