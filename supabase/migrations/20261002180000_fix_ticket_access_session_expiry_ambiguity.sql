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

  UPDATE public.ticket_access_sessions AS access_session
  SET revoked_at = now(), revoke_reason = 'idle_timeout'
  WHERE access_session.access_code_id = p_access_code_id
    AND access_session.revoked_at IS NULL
    AND access_session.idle_expires_at <= now();

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
