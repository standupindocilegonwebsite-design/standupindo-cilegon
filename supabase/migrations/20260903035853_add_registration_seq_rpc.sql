CREATE OR REPLACE FUNCTION next_open_mic_reg_seq()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_val bigint;
BEGIN
  next_val := nextval('open_mic_reg_seq');
  RETURN next_val;
END;
$$;

GRANT EXECUTE ON FUNCTION next_open_mic_reg_seq() TO anon, authenticated;
GRANT USAGE ON SEQUENCE open_mic_reg_seq TO anon, authenticated;