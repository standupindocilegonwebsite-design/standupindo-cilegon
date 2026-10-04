ALTER TABLE public.ticket_orders
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS free_pass_reason text,
  ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.ticket_orders
  DROP CONSTRAINT IF EXISTS ticket_orders_order_type_check;
ALTER TABLE public.ticket_orders
  ADD CONSTRAINT ticket_orders_order_type_check CHECK (
    (order_type = 'paid' AND free_pass_reason IS NULL)
    OR (order_type = 'free_pass'
      AND nullif(trim(free_pass_reason), '') IS NOT NULL
      AND issued_by IS NOT NULL)
  );

ALTER TABLE public.ticket_email_logs
  DROP CONSTRAINT IF EXISTS ticket_email_logs_email_type_check;
ALTER TABLE public.ticket_email_logs
  ADD CONSTRAINT ticket_email_logs_email_type_check
  CHECK (email_type IN ('payment_confirmation', 'free_pass_access'));

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

  SELECT * INTO selected_ticket
  FROM public.event_tickets
  WHERE id = NEW.ticket_id
    AND event_id = NEW.event_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket tidak tersedia untuk event ini';
  END IF;

  NEW.ticket_category := selected_ticket.name;
  NEW.unit_price := selected_ticket.price;
  IF NEW.order_type = 'free_pass' THEN
    NEW.total_price := 0;
    NEW.payment_amount := 0;
    NEW.payment_proof_path := NULL;
    NEW.payment_submitted_at := NULL;
    NEW.payment_method_id := NULL;
    NEW.payment_method_snapshot := NULL;
    NEW.status := 'Lunas';
    NEW.expires_at := NULL;
  ELSE
    NEW.total_price := selected_ticket.price * NEW.quantity;
    NEW.status := 'Menunggu Pembayaran';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_ticket_free_pass(
  p_order_number text,
  p_event_id uuid,
  p_ticket_id uuid,
  p_full_name text,
  p_email text,
  p_whatsapp text,
  p_quantity integer,
  p_reason text,
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
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Operasi harus dipanggil melalui Admin Tiket';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Admin penerbit tidak valid';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 10 THEN
    RAISE EXCEPTION 'Jumlah tiket harus antara 1 dan 10';
  END IF;
  IF p_full_name IS NULL OR nullif(trim(p_full_name), '') IS NULL OR length(trim(p_full_name)) > 160 THEN
    RAISE EXCEPTION 'Nama penerima wajib diisi maksimal 160 karakter';
  END IF;
  IF p_reason IS NULL OR nullif(trim(p_reason), '') IS NULL OR length(trim(p_reason)) > 300 THEN
    RAISE EXCEPTION 'Alasan Free Pass wajib diisi maksimal 300 karakter';
  END IF;
  IF p_order_number IS NULL OR p_order_number !~ '^[A-Z]{3}-[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'Nomor order tidak valid';
  END IF;
  IF p_email IS NOT NULL AND p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Alamat email tidak valid';
  END IF;
  normalized_phone := public.normalize_ticket_whatsapp(p_whatsapp);
  IF length(normalized_phone) < 10 OR length(normalized_phone) > 15 THEN
    RAISE EXCEPTION 'Nomor WhatsApp tidak valid';
  END IF;
  IF p_qr_tokens IS NULL OR jsonb_typeof(p_qr_tokens) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Token QR harus disiapkan untuk setiap tiket';
  END IF;
  IF jsonb_array_length(p_qr_tokens) <> p_quantity THEN
    RAISE EXCEPTION 'Token QR harus disiapkan untuk setiap tiket';
  END IF;

  SELECT * INTO selected_event
  FROM public.events
  WHERE id = p_event_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event tidak ditemukan';
  END IF;
  IF selected_event.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Event tidak tersedia untuk penerbitan Free Pass';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));
  SELECT * INTO selected_ticket
  FROM public.event_tickets
  WHERE id = p_ticket_id
    AND event_id = p_event_id
    AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kategori tiket tidak tersedia untuk Event ini';
  END IF;

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

  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text || ':' || normalized_phone, 0));
  SELECT * INTO selected_code
  FROM public.ticket_access_codes
  WHERE event_id = p_event_id
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
      RAISE EXCEPTION 'Access Code sudah pernah digunakan untuk nomor ini; buat kode baru';
    END IF;
    INSERT INTO public.ticket_access_codes (
      event_id, whatsapp_normalized, access_code_hash, whatsapp_code_hash, access_code_ciphertext
    ) VALUES (
      p_event_id, normalized_phone, p_access_code_hash, p_whatsapp_code_hash, p_access_code_ciphertext
    ) RETURNING * INTO selected_code;
  END IF;

  INSERT INTO public.ticket_orders (
    id, order_number, event_id, ticket_id, ticket_category, full_name, email, whatsapp,
    quantity, unit_price, total_price, notes, status, expires_at, payment_amount,
    order_type, free_pass_reason, issued_by, access_code_id
  ) VALUES (
    new_order_id, p_order_number, p_event_id, p_ticket_id, selected_ticket.name,
    trim(p_full_name), nullif(lower(trim(p_email)), ''), normalized_phone,
    p_quantity, selected_ticket.price, 0, trim(p_reason), 'Lunas', NULL, 0,
    'free_pass', trim(p_reason), p_actor_id, selected_code.id
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

REVOKE ALL ON FUNCTION public.issue_ticket_free_pass(text, uuid, uuid, text, text, text, integer, text, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_ticket_free_pass(text, uuid, uuid, text, text, text, integer, text, uuid, text, text, text, jsonb)
  TO service_role;
