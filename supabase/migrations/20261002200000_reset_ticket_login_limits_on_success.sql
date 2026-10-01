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
    DELETE FROM public.ticket_access_login_attempts WHERE attempt_key_hash = ANY(attempt_keys);
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
