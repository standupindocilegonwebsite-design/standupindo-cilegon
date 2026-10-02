ALTER TABLE public.event_checkin_settings
  ADD COLUMN IF NOT EXISTS time_restricted boolean NOT NULL DEFAULT false;

UPDATE public.event_checkin_settings settings
SET time_restricted = NOT (
  settings.opens_at = (event.date::timestamp AT TIME ZONE 'Asia/Jakarta')
  AND settings.closes_at = ((event.date + 2)::timestamp AT TIME ZONE 'Asia/Jakarta')
)
FROM public.events event
WHERE event.id = settings.event_id;

UPDATE public.event_checkin_settings settings
SET opens_at = (event.date::timestamp AT TIME ZONE 'Asia/Jakarta'),
    closes_at = ((event.date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta'),
    updated_at = now()
FROM public.events event
WHERE event.id = settings.event_id
  AND NOT settings.time_restricted;

CREATE OR REPLACE FUNCTION public.ensure_event_checkin_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.event_checkin_settings AS current_settings (event_id, opens_at, closes_at)
  VALUES (
    NEW.id,
    (NEW.date::timestamp AT TIME ZONE 'Asia/Jakarta'),
    ((NEW.date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')
  )
  ON CONFLICT (event_id) DO UPDATE
  SET opens_at = CASE
        WHEN current_settings.time_restricted
          THEN (NEW.date::timestamp + (current_settings.opens_at AT TIME ZONE 'Asia/Jakarta')::time) AT TIME ZONE 'Asia/Jakarta'
        ELSE (NEW.date::timestamp AT TIME ZONE 'Asia/Jakarta')
      END,
      closes_at = CASE
        WHEN current_settings.time_restricted
          THEN (NEW.date::timestamp + (current_settings.closes_at AT TIME ZONE 'Asia/Jakarta')::time) AT TIME ZONE 'Asia/Jakarta'
        ELSE ((NEW.date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')
      END,
      updated_at = now();
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.save_event_gate_settings(uuid, timestamptz, timestamptz, jsonb);
DROP FUNCTION IF EXISTS public.save_event_gate_settings(uuid, timestamptz, timestamptz, jsonb, boolean);

CREATE FUNCTION public.save_event_gate_settings(
  p_event_id uuid,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_gates jsonb,
  p_gates_enabled boolean,
  p_time_restricted boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gate_item jsonb;
  category_id uuid;
  gate_id uuid;
  gate_name text;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Operasi harus dipanggil melalui service backend'; END IF;
  IF p_event_id IS NULL OR p_opens_at IS NULL OR p_closes_at IS NULL OR p_opens_at >= p_closes_at THEN
    RAISE EXCEPTION 'Periode check-in tidak valid';
  END IF;
  IF p_gates_enabled IS NULL OR p_time_restricted IS NULL OR p_gates IS NULL OR jsonb_typeof(p_gates) <> 'array' THEN
    RAISE EXCEPTION 'Pengaturan Gate atau waktu check-in tidak valid';
  END IF;
  IF p_gates_enabled AND jsonb_array_length(p_gates) = 0 THEN
    RAISE EXCEPTION 'Tambahkan minimal satu Gate';
  END IF;
  IF p_gates_enabled AND EXISTS (
    SELECT lower(trim(value->>'name'))
    FROM jsonb_array_elements(p_gates)
    GROUP BY lower(trim(value->>'name'))
    HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Nama Gate tidak boleh duplikat'; END IF;

  INSERT INTO public.event_checkin_settings (event_id, opens_at, closes_at, gates_enabled, time_restricted, updated_at)
  VALUES (p_event_id, p_opens_at, p_closes_at, p_gates_enabled, p_time_restricted, now())
  ON CONFLICT (event_id) DO UPDATE
  SET opens_at = EXCLUDED.opens_at,
      closes_at = EXCLUDED.closes_at,
      gates_enabled = EXCLUDED.gates_enabled,
      time_restricted = EXCLUDED.time_restricted,
      updated_at = now();

  IF NOT p_gates_enabled THEN
    DELETE FROM public.event_gates WHERE event_id = p_event_id;
    RETURN;
  END IF;

  DELETE FROM public.event_gates existing_gate
  WHERE existing_gate.event_id = p_event_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_gates) AS submitted_gate(value)
      WHERE submitted_gate.value->>'id' = existing_gate.id::text
    );
  UPDATE public.event_gates existing_gate
  SET name = 'pending-' || existing_gate.id::text
  WHERE existing_gate.event_id = p_event_id
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_gates) AS submitted_gate(value)
      WHERE submitted_gate.value->>'id' = existing_gate.id::text
    );

  FOR gate_item IN SELECT value FROM jsonb_array_elements(p_gates)
  LOOP
    gate_name := trim(gate_item->>'name');
    IF gate_name IS NULL OR length(gate_name) < 1 OR length(gate_name) > 80 THEN
      RAISE EXCEPTION 'Nama Gate wajib diisi maksimal 80 karakter';
    END IF;
    IF gate_item->'category_ids' IS NULL OR jsonb_typeof(gate_item->'category_ids') <> 'array'
      OR jsonb_array_length(gate_item->'category_ids') = 0 THEN
      RAISE EXCEPTION 'Pilih minimal satu kategori tiket untuk setiap Gate';
    END IF;

    gate_id := NULL;
    IF nullif(gate_item->>'id', '') IS NOT NULL THEN
      SELECT id INTO gate_id FROM public.event_gates
      WHERE id = (gate_item->>'id')::uuid AND event_id = p_event_id;
    END IF;
    IF gate_id IS NULL THEN
      INSERT INTO public.event_gates (event_id, name)
      VALUES (p_event_id, gate_name)
      RETURNING id INTO gate_id;
    ELSE
      UPDATE public.event_gates SET name = gate_name WHERE id = gate_id;
      DELETE FROM public.event_gate_ticket_categories WHERE event_gate_ticket_categories.gate_id = gate_id;
    END IF;

    FOR category_id IN
      SELECT value::uuid FROM jsonb_array_elements_text(gate_item->'category_ids')
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.event_tickets
        WHERE id = category_id AND event_id = p_event_id AND status = 'active'
      ) THEN RAISE EXCEPTION 'Kategori tiket tidak aktif atau bukan milik Event ini'; END IF;
      INSERT INTO public.event_gate_ticket_categories (gate_id, event_ticket_id)
      VALUES (gate_id, category_id);
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.save_event_gate_settings(uuid, timestamptz, timestamptz, jsonb, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_event_gate_settings(uuid, timestamptz, timestamptz, jsonb, boolean, boolean) TO service_role;
