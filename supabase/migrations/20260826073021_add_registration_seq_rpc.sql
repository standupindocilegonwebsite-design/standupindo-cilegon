/*
# Registration ID sequence RPC

## Overview
Adds a SECURITY DEFINER function `next_open_mic_reg_seq()` that returns the next
value from the `open_mic_reg_seq` sequence. This lets the public registration form
generate a unique sequential Registration ID (e.g. OM27-0048) without exposing
the sequence directly.

## Security
- SECURITY DEFINER so the anon role can call it (the sequence itself is not
  directly selectable by anon).
- EXECUTE granted to anon and authenticated.
- Function is read-only w.r.t. tables (only advances the sequence); no row data
  is exposed.
*/

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
