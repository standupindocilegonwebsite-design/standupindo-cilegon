CREATE OR REPLACE FUNCTION public.register_public_open_mic(
  p_open_mic_id uuid,
  p_full_name text,
  p_stage_name text,
  p_community text DEFAULT NULL,
  p_instagram text DEFAULT NULL,
  p_whatsapp text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mic_record open_mics%ROWTYPE;
  next_number bigint;
  registration_code text;
  mic_number text;
  normalized_whatsapp text;
  normalized_instagram text;
BEGIN
  IF NULLIF(trim(p_full_name), '') IS NULL OR NULLIF(trim(p_stage_name), '') IS NULL THEN
    RAISE EXCEPTION 'Nama lengkap dan nama panggung wajib diisi';
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

  normalized_whatsapp := NULLIF(regexp_replace(trim(COALESCE(p_whatsapp, '')), '[^0-9]', '', 'g'), '');
  normalized_instagram := NULLIF(lower(trim(COALESCE(p_instagram, ''))), '');

  IF EXISTS (
    SELECT 1
    FROM open_mic_registrations
    WHERE open_mic_id = p_open_mic_id
      AND status IN ('pending', 'confirmed')
      AND lower(trim(full_name)) = lower(trim(p_full_name))
      AND lower(trim(stage_name)) = lower(trim(p_stage_name))
      AND (
        (normalized_whatsapp IS NOT NULL AND regexp_replace(COALESCE(whatsapp, ''), '[^0-9]', '', 'g') = normalized_whatsapp)
        OR (normalized_instagram IS NOT NULL AND lower(trim(COALESCE(instagram, ''))) = normalized_instagram)
        OR (normalized_whatsapp IS NULL AND normalized_instagram IS NULL AND whatsapp IS NULL AND instagram IS NULL)
      )
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
    trim(p_full_name),
    trim(p_stage_name),
    NULLIF(trim(p_community), ''),
    NULLIF(trim(p_instagram), ''),
    NULLIF(trim(p_whatsapp), ''),
    NULLIF(trim(p_notes), ''),
    NULL,
    'pending',
    'unmarked'
  );

  RETURN registration_code;
END;
$$;

REVOKE ALL ON FUNCTION public.register_public_open_mic(uuid, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_public_open_mic(uuid, text, text, text, text, text, text) TO anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS uq_open_mic_registrations_active_identity
  ON open_mic_registrations (
    open_mic_id,
    lower(trim(full_name)),
    lower(trim(stage_name)),
    COALESCE(regexp_replace(whatsapp, '[^0-9]', '', 'g'), ''),
    COALESCE(lower(trim(instagram)), '')
  )
  WHERE status IN ('pending', 'confirmed');
