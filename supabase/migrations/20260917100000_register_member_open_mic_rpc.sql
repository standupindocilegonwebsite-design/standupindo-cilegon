CREATE OR REPLACE FUNCTION public.register_member_open_mic(
  p_open_mic_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_record komika%ROWTYPE;
  mic_record open_mics%ROWTYPE;
  next_number bigint;
  registration_code text;
  mic_number text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Akun member wajib login';
  END IF;

  SELECT * INTO member_record
  FROM komika
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil member belum tersedia';
  END IF;

  SELECT * INTO mic_record
  FROM open_mics
  WHERE id = p_open_mic_id
    AND published = true
    AND status = 'upcoming'
    AND registration_status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pendaftaran Open Mic sudah ditutup';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM open_mic_registrations
    WHERE open_mic_id = p_open_mic_id
      AND komika_id = member_record.id
      AND status IN ('pending', 'confirmed')
  ) THEN
    RAISE EXCEPTION 'Kamu sudah terdaftar di Open Mic ini';
  END IF;

  next_number := nextval('open_mic_reg_seq');
  mic_number := COALESCE((regexp_match(mic_record.title, '#?([0-9]+)'))[1], '00');
  registration_code := 'OM' || mic_number || '-' || lpad(next_number::text, 4, '0');

  INSERT INTO open_mic_registrations (
    registration_id,
    open_mic_id,
    full_name,
    stage_name,
    community,
    instagram,
    whatsapp,
    notes,
    komika_id,
    status,
    attendance_status
  ) VALUES (
    registration_code,
    mic_record.id,
    member_record.full_name,
    member_record.stage_name,
    'Standupindo Cilegon',
    member_record.instagram_url,
    member_record.whatsapp,
    NULLIF(trim(p_notes), ''),
    member_record.id,
    'pending',
    'unmarked'
  );

  RETURN registration_code;
END;
$$;

REVOKE ALL ON FUNCTION public.register_member_open_mic(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_member_open_mic(uuid, text) TO authenticated;