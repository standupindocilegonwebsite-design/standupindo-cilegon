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
  attempt_limit integer;
  attempt_window interval;
  block_duration interval;
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
    IF attempt_key = p_phone_key_hash THEN
      attempt_limit := 6;
      attempt_window := interval '5 minutes';
      block_duration := interval '2 minutes';
    ELSE
      attempt_limit := 30;
      attempt_window := interval '5 minutes';
      block_duration := interval '1 minute';
    END IF;

    SELECT * INTO attempts
    FROM public.ticket_access_login_attempts
    WHERE attempt_key_hash = attempt_key
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.ticket_access_login_attempts(attempt_key_hash, attempt_count, window_started_at, updated_at)
      VALUES (attempt_key, 1, now(), now());
    ELSIF attempts.window_started_at <= now() - attempt_window THEN
      UPDATE public.ticket_access_login_attempts
      SET attempt_count = 1, window_started_at = now(), blocked_until = NULL, updated_at = now()
      WHERE attempt_key_hash = attempt_key;
    ELSE
      UPDATE public.ticket_access_login_attempts
      SET attempt_count = attempt_count + 1,
          blocked_until = CASE
            WHEN attempt_count + 1 >= attempt_limit THEN now() + block_duration
            ELSE blocked_until
          END,
          updated_at = now()
      WHERE attempt_key_hash = attempt_key;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ticket_access_login_attempt(text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ticket_access_login_attempt(text, text, boolean) TO service_role;

DELETE FROM public.ticket_access_login_attempts;
