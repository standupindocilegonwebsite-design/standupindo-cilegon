-- Keep legacy "Sudah Bayar" orders reviewable in the Admin Ticket workspace.
-- This preserves the existing payment amount validation and ticket lifecycle.

CREATE OR REPLACE FUNCTION public.resolve_ticket_order_payment(
  p_order_id uuid,
  p_resolution text,
  p_actor_id uuid,
  p_access_code_hash text DEFAULT NULL,
  p_whatsapp_code_hash text DEFAULT NULL,
  p_access_code_ciphertext text DEFAULT NULL,
  p_qr_tokens jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE (resolved_status text, resolved_access_code_id uuid, issued_ticket_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_order public.ticket_orders%ROWTYPE;
  normalized_phone text;
  selected_code public.ticket_access_codes%ROWTYPE;
  supplied_token jsonb;
  instance_count integer;
  token_index integer := 0;
BEGIN
  IF p_resolution NOT IN ('Lunas', 'Ditolak') THEN
    RAISE EXCEPTION 'Keputusan pembayaran tidak valid';
  END IF;

  SELECT * INTO selected_order
  FROM public.ticket_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order tidak ditemukan'; END IF;

  IF selected_order.status = 'Lunas' AND p_resolution = 'Lunas' THEN
    RETURN QUERY SELECT 'Lunas', selected_order.access_code_id,
      (SELECT count(*)::integer FROM public.ticket_instances WHERE ticket_order_id = p_order_id);
    RETURN;
  END IF;
  IF selected_order.status NOT IN ('Menunggu Verifikasi', 'Sudah Bayar') THEN
    RAISE EXCEPTION 'Order belum berada pada status menunggu verifikasi';
  END IF;

  IF p_resolution = 'Ditolak' THEN
    UPDATE public.ticket_orders
    SET status = 'Ditolak', reviewed_by = p_actor_id, reviewed_at = now(), updated_at = now()
    WHERE id = p_order_id;
    RETURN QUERY SELECT 'Ditolak', NULL::uuid, 0;
    RETURN;
  END IF;

  IF selected_order.payment_amount IS DISTINCT FROM selected_order.total_price THEN
    RAISE EXCEPTION 'Nominal pembayaran order belum tervalidasi';
  END IF;
  IF EXISTS (SELECT 1 FROM public.events WHERE id = selected_order.event_id AND status = 'completed') THEN
    RAISE EXCEPTION 'Event telah selesai, order tidak dapat diterbitkan';
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
    IF nullif(p_access_code_hash, '') IS NULL OR nullif(p_whatsapp_code_hash, '') IS NULL OR nullif(p_access_code_ciphertext, '') IS NULL THEN
      RAISE EXCEPTION 'Access Code baru harus disiapkan server';
    END IF;
    IF EXISTS (SELECT 1 FROM public.ticket_access_codes WHERE whatsapp_normalized = normalized_phone AND whatsapp_code_hash = p_whatsapp_code_hash) THEN
      RAISE EXCEPTION 'Access Code sudah pernah digunakan untuk nomor ini; buat kode baru';
    END IF;
    INSERT INTO public.ticket_access_codes (
      event_id, whatsapp_normalized, access_code_hash, whatsapp_code_hash, access_code_ciphertext
    ) VALUES (
      selected_order.event_id, normalized_phone, p_access_code_hash, p_whatsapp_code_hash, p_access_code_ciphertext
    ) RETURNING * INTO selected_code;
  END IF;

  SELECT count(*)::integer INTO instance_count
  FROM public.ticket_instances
  WHERE ticket_order_id = p_order_id;

  IF instance_count = 0 THEN
    IF jsonb_typeof(p_qr_tokens) <> 'array'
      OR jsonb_array_length(p_qr_tokens) <> selected_order.quantity THEN
      RAISE EXCEPTION 'Token QR harus disiapkan untuk setiap tiket order';
    END IF;
    FOR supplied_token IN SELECT value FROM jsonb_array_elements(p_qr_tokens)
    LOOP
      token_index := token_index + 1;
      IF nullif(supplied_token->>'hash', '') IS NULL OR nullif(supplied_token->>'ciphertext', '') IS NULL THEN
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
      access_code_id = selected_code.id,
      reviewed_by = p_actor_id,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.ticket_orders existing_order
  SET access_code_id = selected_code.id
  WHERE existing_order.event_id = selected_order.event_id
    AND public.normalize_ticket_whatsapp(existing_order.whatsapp) = normalized_phone
    AND existing_order.status IN ('Lunas', 'Terverifikasi', 'Selesai');

  RETURN QUERY SELECT 'Lunas', selected_code.id, selected_order.quantity;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_ticket_order_payment(uuid, text, uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_ticket_order_payment(uuid, text, uuid, text, text, text, jsonb) TO service_role;
