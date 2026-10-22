-- Keep imported historical records distinct from newly announced Events.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_historical_archive boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.import_event_archive(
  p_events jsonb,
  p_lineups jsonb,
  p_experiences jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  event_row jsonb;
  lineup_row jsonb;
  experience_row jsonb;
  target_event_id uuid;
  existing_event_is_archive boolean;
  existing_event_title text;
  existing_event_date date;
  existing_event_venue text;
  inserted_count integer;
  events_created integer := 0;
  lineups_created integer := 0;
  experiences_created integer := 0;
BEGIN
  IF auth.uid() IS NULL
    OR NOT (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin')) THEN
    RAISE EXCEPTION 'Hanya Admin atau Admin Event yang dapat mengimpor arsip Event.';
  END IF;

  IF jsonb_typeof(p_events) <> 'array'
    OR jsonb_typeof(p_lineups) <> 'array'
    OR jsonb_typeof(p_experiences) <> 'array' THEN
    RAISE EXCEPTION 'Data impor arsip Event tidak valid.';
  END IF;

  FOR event_row IN SELECT value FROM jsonb_array_elements(p_events)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.events
      WHERE lower(title) = lower(event_row->>'title')
        AND date = (event_row->>'date')::date
        AND lower(trim(venue)) = lower(trim(event_row->>'venue'))
        AND is_historical_archive IS NOT TRUE
    ) THEN
      RAISE EXCEPTION 'Impor dibatalkan: Event biasa dengan judul, tanggal, dan tempat yang sama sudah ada: %', event_row->>'title';
    END IF;

    target_event_id := NULL;
    existing_event_is_archive := NULL;
    SELECT id, is_historical_archive
      INTO target_event_id, existing_event_is_archive
    FROM public.events
    WHERE lower(title) = lower(event_row->>'title')
      AND date = (event_row->>'date')::date
      AND lower(trim(venue)) = lower(trim(event_row->>'venue'))
    ORDER BY is_historical_archive DESC, created_at
    LIMIT 1;

    IF target_event_id IS NULL THEN
      INSERT INTO public.events (
        title,
        slug,
        date,
        time,
        venue,
        location,
        description,
        status,
        registration_status,
        published,
        whatsapp_number,
        is_historical_archive
      )
      VALUES (
        event_row->>'title',
        event_row->>'slug',
        (event_row->>'date')::date,
        event_row->>'time',
        event_row->>'venue',
        event_row->>'city',
        event_row->>'description',
        'completed',
        'closed',
        true,
        '',
        true
      )
      ON CONFLICT (slug) DO NOTHING
      RETURNING id INTO target_event_id;

      IF target_event_id IS NULL THEN
        SELECT id, title, date, venue, is_historical_archive
          INTO target_event_id, existing_event_title, existing_event_date, existing_event_venue, existing_event_is_archive
        FROM public.events
        WHERE slug = event_row->>'slug'
        LIMIT 1;
        IF target_event_id IS NULL
          OR existing_event_is_archive IS NOT TRUE
          OR lower(existing_event_title) <> lower(event_row->>'title')
          OR existing_event_date <> (event_row->>'date')::date
          OR lower(trim(existing_event_venue)) <> lower(trim(event_row->>'venue')) THEN
          RAISE EXCEPTION 'Impor dibatalkan: slug arsip sudah digunakan Event lain: %', event_row->>'slug';
        END IF;
      ELSE
        events_created := events_created + 1;
      END IF;
    END IF;

    UPDATE public.push_notification_automation_cycles
    SET is_active = false
    WHERE entity_type = 'event'
      AND entity_id = target_event_id
      AND is_active;
  END LOOP;

  FOR lineup_row IN SELECT value FROM jsonb_array_elements(p_lineups)
  LOOP
    SELECT id INTO target_event_id
    FROM public.events
    WHERE lower(title) = lower(lineup_row->>'event_title')
      AND date = (lineup_row->>'event_date')::date
      AND lower(trim(venue)) = lower(trim(lineup_row->>'venue'))
    ORDER BY created_at
    LIMIT 1;
    IF target_event_id IS NULL THEN
      RAISE EXCEPTION 'Event untuk lineup tidak ditemukan: %', lineup_row->>'event_title';
    END IF;

    INSERT INTO public.event_lineups (
      event_id,
      komika_id,
      performer_name,
      role_category,
      sort_order
    )
    VALUES (
      target_event_id,
      nullif(lineup_row->>'komika_id', '')::uuid,
      lineup_row->>'performer_name',
      lineup_row->>'role_category',
      coalesce((lineup_row->>'sort_order')::integer, 0)
    )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    lineups_created := lineups_created + inserted_count;
  END LOOP;

  FOR experience_row IN SELECT value FROM jsonb_array_elements(p_experiences)
  LOOP
    SELECT id INTO target_event_id
    FROM public.events
    WHERE lower(title) = lower(experience_row->>'event_name')
      AND date = (experience_row->>'event_date')::date
      AND lower(trim(venue)) = lower(trim(experience_row->>'venue'))
    ORDER BY created_at
    LIMIT 1;
    IF target_event_id IS NULL THEN
      RAISE EXCEPTION 'Event untuk riwayat member tidak ditemukan: %', experience_row->>'event_name';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.member_stage_experiences existing
      WHERE existing.komika_id = (experience_row->>'komika_id')::uuid
        AND existing.event_date = (experience_row->>'event_date')::date
        AND lower(existing.event_name) = lower(experience_row->>'event_name')
        AND existing.role = experience_row->>'role'
        AND coalesce(existing.custom_role, '') = coalesce(experience_row->>'custom_role', '')
        AND lower(coalesce(existing.city, '')) = lower(experience_row->>'city')
        AND coalesce(existing.organizer, '') = 'Standupindo Cilegon'
    ) THEN
      INSERT INTO public.member_stage_experiences (
        komika_id,
        event_date,
        event_name,
        event_type,
        role,
        custom_role,
        organizer,
        city
      )
      VALUES (
        (experience_row->>'komika_id')::uuid,
        (experience_row->>'event_date')::date,
        experience_row->>'event_name',
        experience_row->>'event_type',
        experience_row->>'role',
        nullif(experience_row->>'custom_role', ''),
        'Standupindo Cilegon',
        experience_row->>'city'
      );
      experiences_created := experiences_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'events_created', events_created,
    'lineups_created', lineups_created,
    'experiences_created', experiences_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_event_archive(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_event_archive(jsonb, jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
