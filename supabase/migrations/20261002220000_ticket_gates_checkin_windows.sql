CREATE TABLE IF NOT EXISTS public.event_checkin_settings (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_checkin_settings_window CHECK (opens_at < closes_at)
);

CREATE TABLE IF NOT EXISTS public.event_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, name)
);

CREATE TABLE IF NOT EXISTS public.event_gate_ticket_categories (
  gate_id uuid NOT NULL REFERENCES public.event_gates(id) ON DELETE CASCADE,
  event_ticket_id uuid NOT NULL REFERENCES public.event_tickets(id) ON DELETE CASCADE,
  PRIMARY KEY (gate_id, event_ticket_id)
);

ALTER TABLE public.event_checkin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_gate_ticket_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_checkin_settings, public.event_gates, public.event_gate_ticket_categories FROM PUBLIC, anon, authenticated;

ALTER TABLE public.ticket_instances
  DROP CONSTRAINT IF EXISTS ticket_instances_status_check;
ALTER TABLE public.ticket_instances
  ADD CONSTRAINT ticket_instances_status_check CHECK (status IN ('active', 'revoked', 'expired'));

INSERT INTO public.event_checkin_settings (event_id, opens_at, closes_at)
SELECT event.id,
  (event.date::timestamp AT TIME ZONE 'Asia/Jakarta'),
  ((event.date + 2)::timestamp AT TIME ZONE 'Asia/Jakarta')
FROM public.events event
ON CONFLICT (event_id) DO NOTHING;

INSERT INTO public.event_gates (event_id, name)
SELECT DISTINCT ticket.event_id, 'Gate Utama'
FROM public.event_tickets ticket
WHERE ticket.status = 'active'
ON CONFLICT (event_id, name) DO NOTHING;

INSERT INTO public.event_gate_ticket_categories (gate_id, event_ticket_id)
SELECT gate.id, ticket.id
FROM public.event_gates gate
JOIN public.event_tickets ticket ON ticket.event_id = gate.event_id AND ticket.status = 'active'
WHERE gate.name = 'Gate Utama'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.save_event_gate_settings(
  p_event_id uuid,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_gates jsonb
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
  IF p_gates IS NULL OR jsonb_typeof(p_gates) <> 'array' THEN
    RAISE EXCEPTION 'Daftar Gate tidak valid';
  END IF;
  IF jsonb_array_length(p_gates) = 0 THEN
    RAISE EXCEPTION 'Tambahkan minimal satu Gate';
  END IF;
  IF EXISTS (
    SELECT lower(trim(value->>'name'))
    FROM jsonb_array_elements(p_gates)
    GROUP BY lower(trim(value->>'name'))
    HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Nama Gate tidak boleh duplikat'; END IF;

  INSERT INTO public.event_checkin_settings (event_id, opens_at, closes_at, updated_at)
  VALUES (p_event_id, p_opens_at, p_closes_at, now())
  ON CONFLICT (event_id) DO UPDATE
  SET opens_at = EXCLUDED.opens_at, closes_at = EXCLUDED.closes_at, updated_at = now();

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
    IF gate_item->'category_ids' IS NULL OR jsonb_typeof(gate_item->'category_ids') <> 'array' THEN
      RAISE EXCEPTION 'Daftar kategori Gate tidak valid';
    END IF;
    IF jsonb_array_length(gate_item->'category_ids') = 0 THEN
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

REVOKE ALL ON FUNCTION public.save_event_gate_settings(uuid, timestamptz, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_event_gate_settings(uuid, timestamptz, timestamptz, jsonb) TO service_role;

DROP FUNCTION IF EXISTS public.check_in_ticket(uuid, text);

CREATE FUNCTION public.check_in_ticket(p_event_id uuid, p_qr_token_hash text, p_gate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_ticket public.ticket_instances%ROWTYPE;
  selected_order public.ticket_orders%ROWTYPE;
  selected_event public.events%ROWTYPE;
  selected_gate public.event_gates%ROWTYPE;
  checkin_settings public.event_checkin_settings%ROWTYPE;
  ticket_category text;
  allowed_categories jsonb;
  scan_time timestamptz := now();
BEGIN
  SELECT instance.* INTO selected_ticket
  FROM public.ticket_instances instance
  WHERE instance.qr_token_hash = p_qr_token_hash
    AND instance.event_id = p_event_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'message', 'QR Code tidak ditemukan atau tiket tidak dapat digunakan.'); END IF;

  IF NOT public.jwt_has_role('admin')
    AND NOT (public.jwt_has_role('admin_qr') AND public.user_has_ticket_event_scope(p_event_id, 'admin_qr')) THEN
    RAISE EXCEPTION 'Akun tidak memiliki scope scan untuk Event ini';
  END IF;

  SELECT * INTO selected_event FROM public.events WHERE id = p_event_id;
  SELECT * INTO selected_order FROM public.ticket_orders WHERE id = selected_ticket.ticket_order_id;
  SELECT category.name INTO ticket_category
  FROM public.event_tickets category
  WHERE category.id = selected_ticket.event_ticket_id;

  IF selected_event.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'message', 'QR Code tidak ditemukan atau tiket tidak dapat digunakan.', 'event_title', selected_event.title);
  END IF;
  IF selected_ticket.checked_in_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'already_used', 'message', 'Tiket sudah digunakan', 'checked_in_at', selected_ticket.checked_in_at, 'ticket_id', selected_ticket.id, 'event_title', selected_event.title);
  END IF;
  IF selected_event.status = 'completed' THEN
    UPDATE public.ticket_instances
    SET status = 'expired', updated_at = scan_time
    WHERE id = selected_ticket.id AND status = 'active' AND checked_in_at IS NULL;
    RETURN jsonb_build_object('ok', false, 'status', 'checkin_closed', 'message', 'Periode check-in telah berakhir.', 'event_title', selected_event.title, 'expired', true);
  END IF;
  IF selected_ticket.status = 'expired' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'checkin_closed', 'message', 'Periode check-in telah berakhir.', 'event_title', selected_event.title);
  END IF;
  IF selected_ticket.status <> 'active' OR selected_order.status <> 'Lunas' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'message', 'QR Code tidak ditemukan atau tiket tidak dapat digunakan.');
  END IF;

  SELECT * INTO checkin_settings FROM public.event_checkin_settings WHERE event_id = p_event_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Periode check-in Event belum diatur'; END IF;
  IF scan_time < checkin_settings.opens_at THEN
    RETURN jsonb_build_object('ok', false, 'status', 'checkin_not_open', 'message', 'Check-in belum dibuka.', 'event_title', selected_event.title, 'checkin_start', checkin_settings.opens_at);
  END IF;
  IF scan_time >= checkin_settings.closes_at THEN
    UPDATE public.ticket_instances
    SET status = 'expired', updated_at = scan_time
    WHERE id = selected_ticket.id AND status = 'active' AND checked_in_at IS NULL;
    RETURN jsonb_build_object('ok', false, 'status', 'checkin_closed', 'message', 'Periode check-in telah berakhir.', 'event_title', selected_event.title, 'expired', true);
  END IF;

  SELECT * INTO selected_gate FROM public.event_gates
  WHERE id = p_gate_id AND event_id = p_event_id
  FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.event_gate_ticket_categories
    WHERE gate_id = p_gate_id AND event_ticket_id = selected_ticket.event_ticket_id
  ) THEN
    SELECT coalesce(jsonb_agg(category.name ORDER BY category.sort_order, category.name), '[]'::jsonb)
    INTO allowed_categories
    FROM public.event_gate_ticket_categories access
    JOIN public.event_tickets category ON category.id = access.event_ticket_id
    WHERE access.gate_id = p_gate_id;
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'gate_mismatch',
      'message', 'Silakan menuju gate yang sesuai.',
      'ticket_category', ticket_category,
      'allowed_categories', allowed_categories
    );
  END IF;

  UPDATE public.ticket_instances
  SET checked_in_at = scan_time,
      checked_in_by = auth.uid(),
      check_in_source = selected_gate.name,
      updated_at = scan_time
  WHERE id = selected_ticket.id AND checked_in_at IS NULL AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'already_used', 'message', 'Tiket sudah digunakan', 'ticket_id', selected_ticket.id, 'event_title', selected_event.title);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'checked_in',
    'ticket_id', selected_ticket.id,
    'checked_in_at', scan_time,
    'gate', selected_gate.name,
    'event_title', selected_event.title,
    'checkin_start', checkin_settings.opens_at,
    'ticket_category', ticket_category,
    'order_number', selected_order.order_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_ticket(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(uuid, text, uuid) TO authenticated;
