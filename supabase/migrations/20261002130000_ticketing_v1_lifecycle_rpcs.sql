-- Privileged lifecycle operations. Edge Functions authenticate callers,
-- protect encryption keys, and invoke service-only functions below.

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
  IF selected_order.status <> 'Menunggu Pembayaran'
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
  IF selected_order.status <> 'Menunggu Verifikasi' THEN
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

CREATE OR REPLACE FUNCTION public.create_ticket_access_session(
  p_access_code_id uuid,
  p_device_tag_hash text,
  p_session_token_hash text,
  p_replace_existing boolean DEFAULT false
)
RETURNS TABLE (session_id uuid, session_state text, idle_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_code public.ticket_access_codes%ROWTYPE;
  existing_session public.ticket_access_sessions%ROWTYPE;
  new_session_id uuid := gen_random_uuid();
  new_idle_expiry timestamptz := now() + interval '30 minutes';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_access_code_id::text, 0));
  SELECT * INTO selected_code
  FROM public.ticket_access_codes
  WHERE id = p_access_code_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kode Akses sudah tidak berlaku'; END IF;
  IF EXISTS (SELECT 1 FROM public.events WHERE id = selected_code.event_id AND status = 'completed') THEN
    RAISE EXCEPTION 'Kode Akses sudah tidak berlaku karena Event telah selesai';
  END IF;

  UPDATE public.ticket_access_sessions
  SET revoked_at = now(), revoke_reason = 'idle_timeout'
  WHERE access_code_id = p_access_code_id
    AND revoked_at IS NULL
    AND idle_expires_at <= now();

  SELECT * INTO existing_session
  FROM public.ticket_access_sessions
  WHERE access_code_id = p_access_code_id AND revoked_at IS NULL
  FOR UPDATE;

  IF FOUND AND existing_session.device_tag_hash <> p_device_tag_hash AND NOT p_replace_existing THEN
    RETURN QUERY SELECT existing_session.id, 'session_conflict'::text, existing_session.idle_expires_at;
    RETURN;
  END IF;

  IF FOUND THEN
    UPDATE public.ticket_access_sessions
    SET revoked_at = now(), revoke_reason = CASE WHEN existing_session.device_tag_hash = p_device_tag_hash THEN 'logout' ELSE 'replaced' END
    WHERE id = existing_session.id;
  END IF;

  INSERT INTO public.ticket_access_sessions (
    id, access_code_id, session_token_hash, device_tag_hash, idle_expires_at
  ) VALUES (
    new_session_id, p_access_code_id, p_session_token_hash, p_device_tag_hash, new_idle_expiry
  );
  RETURN QUERY SELECT new_session_id, 'created'::text, new_idle_expiry;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ticket_access_session(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ticket_access_session(uuid, text, text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.record_ticket_access_login_attempt(
  p_phone_key_hash text,
  p_ip_key_hash text,
  p_success boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  attempt_key text;
  attempt_keys text[] := ARRAY[p_phone_key_hash, p_ip_key_hash];
  attempts public.ticket_access_login_attempts%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Operasi harus dipanggil melalui service backend'; END IF;
  IF p_success THEN
    DELETE FROM public.ticket_access_login_attempts WHERE attempt_key_hash = p_phone_key_hash;
    RETURN true;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_phone_key_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ip_key_hash, 0));
  IF EXISTS (
    SELECT 1 FROM public.ticket_access_login_attempts
    WHERE attempt_key_hash = ANY(attempt_keys) AND blocked_until > now()
  ) THEN
    RETURN false;
  END IF;

  FOREACH attempt_key IN ARRAY attempt_keys LOOP
    SELECT * INTO attempts FROM public.ticket_access_login_attempts WHERE attempt_key_hash = attempt_key FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.ticket_access_login_attempts(attempt_key_hash, attempt_count, window_started_at, updated_at)
      VALUES (attempt_key, 1, now(), now());
    ELSIF attempts.window_started_at <= now() - interval '15 minutes' THEN
      UPDATE public.ticket_access_login_attempts
      SET attempt_count = 1, window_started_at = now(), blocked_until = NULL, updated_at = now()
      WHERE attempt_key_hash = attempt_key;
    ELSE
      UPDATE public.ticket_access_login_attempts
      SET attempt_count = attempt_count + 1,
          blocked_until = CASE WHEN attempt_count + 1 >= 10 THEN now() + interval '15 minutes' ELSE blocked_until END,
          updated_at = now()
      WHERE attempt_key_hash = attempt_key;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ticket_access_login_attempt(text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ticket_access_login_attempt(text, text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.revoke_ticket_access_session(p_session_token_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  revoked_count integer;
BEGIN
  UPDATE public.ticket_access_sessions
  SET revoked_at = now(), revoke_reason = 'logout'
  WHERE session_token_hash = p_session_token_hash AND revoked_at IS NULL;
  GET DIAGNOSTICS revoked_count = ROW_COUNT;
  RETURN revoked_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_ticket_access_session(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_ticket_access_session(text) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_ticket_access_code_sent(
  p_access_code_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (last_sent_at timestamptz, send_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.ticket_access_codes access_code
  SET last_sent_at = now(),
      last_sent_by = p_actor_id,
      send_count = access_code.send_count + 1,
      updated_at = now()
  WHERE access_code.id = p_access_code_id
    AND access_code.status = 'active'
  RETURNING access_code.last_sent_at, access_code.send_count;
  IF NOT FOUND THEN RAISE EXCEPTION 'Access Code tidak aktif'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_ticket_access_code_sent(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_ticket_access_code_sent(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.set_ticket_payment_method_active(
  p_method_id uuid,
  p_actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_method public.event_payment_methods%ROWTYPE;
BEGIN
  SELECT * INTO selected_method
  FROM public.event_payment_methods
  WHERE id = p_method_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Informasi pembayaran tidak ditemukan'; END IF;

  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Operasi harus dipanggil melalui service backend'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(selected_method.event_id::text, 0));
  UPDATE public.event_payment_methods
  SET is_active = false, updated_at = now()
  WHERE event_id = selected_method.event_id AND is_active;

  UPDATE public.event_payment_methods
  SET is_active = true, updated_at = now()
  WHERE id = selected_method.id;

  RETURN selected_method.id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_ticket_payment_method_active(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_ticket_payment_method_active(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_ticket_maintenance_sent(
  p_maintenance_log_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (sent_at timestamptz, send_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_log public.ticket_maintenance_logs%ROWTYPE;
  next_sent_at timestamptz := now();
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Operasi harus dipanggil melalui service backend'; END IF;
  SELECT * INTO selected_log FROM public.ticket_maintenance_logs WHERE id = p_maintenance_log_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aktivitas maintenance tidak ditemukan'; END IF;

  INSERT INTO public.ticket_maintenance_sends(maintenance_log_id, sent_at, sent_by)
  VALUES (selected_log.id, next_sent_at, p_actor_id);
  UPDATE public.ticket_maintenance_logs
  SET delivery_status = 'sent', sent_at = next_sent_at, sent_by = p_actor_id, updated_at = next_sent_at
  WHERE id = selected_log.id;

  RETURN QUERY SELECT next_sent_at,
    (SELECT count(*)::integer FROM public.ticket_maintenance_sends WHERE maintenance_log_id = selected_log.id);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_ticket_maintenance_sent(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_ticket_maintenance_sent(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.check_in_ticket(p_event_id uuid, p_qr_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_ticket public.ticket_instances%ROWTYPE;
  selected_order public.ticket_orders%ROWTYPE;
  selected_event public.events%ROWTYPE;
  event_local_date date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
BEGIN
  SELECT instance.* INTO selected_ticket
  FROM public.ticket_instances instance
  WHERE instance.qr_token_hash = p_qr_token_hash
    AND instance.event_id = p_event_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'message', 'Tiket tidak valid untuk Event ini'); END IF;

  IF NOT public.jwt_has_role('admin')
    AND NOT (public.jwt_has_role('admin_qr') AND public.user_has_ticket_event_scope(p_event_id, 'admin_qr')) THEN
    RAISE EXCEPTION 'Akun tidak memiliki scope scan untuk Event ini';
  END IF;

  SELECT * INTO selected_event FROM public.events WHERE id = p_event_id;
  IF selected_event.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'event_cancelled', 'message', 'Event Dibatalkan');
  END IF;
  IF selected_event.status = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'event_completed', 'message', 'Event telah selesai');
  END IF;
  IF event_local_date < selected_event.date OR event_local_date > selected_event.date + 1 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'outside_checkin_window', 'message', 'Di luar periode check-in Event');
  END IF;
  IF selected_ticket.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'inactive', 'message', 'Tiket tidak aktif');
  END IF;

  SELECT * INTO selected_order FROM public.ticket_orders WHERE id = selected_ticket.ticket_order_id;
  IF selected_order.status <> 'Lunas' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'unpaid', 'message', 'Order belum lunas');
  END IF;
  IF selected_ticket.checked_in_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'already_used', 'message', 'Tiket sudah digunakan', 'checked_in_at', selected_ticket.checked_in_at);
  END IF;

  UPDATE public.ticket_instances
  SET checked_in_at = now(), checked_in_by = auth.uid(), check_in_source = 'qr', updated_at = now()
  WHERE id = selected_ticket.id AND checked_in_at IS NULL AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'already_used', 'message', 'Tiket sudah digunakan');
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'checked_in', 'ticket_id', selected_ticket.id, 'checked_in_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_ticket(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(uuid, text) TO authenticated;