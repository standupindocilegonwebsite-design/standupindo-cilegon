CREATE TABLE public.event_payment_method_assignments (
  payment_method_id uuid NOT NULL REFERENCES public.event_payment_methods(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (payment_method_id, event_id)
);

CREATE INDEX idx_event_payment_method_assignments_event
  ON public.event_payment_method_assignments(event_id, is_active);

CREATE UNIQUE INDEX idx_event_payment_method_assignments_one_active
  ON public.event_payment_method_assignments(event_id)
  WHERE is_active;

INSERT INTO public.event_payment_method_assignments (payment_method_id, event_id, is_active)
SELECT id, event_id, is_active
FROM public.event_payment_methods;

UPDATE public.event_payment_methods SET is_active = false WHERE is_active;
DROP INDEX IF EXISTS public.idx_event_payment_methods_one_active;

ALTER TABLE public.event_payment_method_assignments ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.event_payment_method_assignments TO anon, authenticated;
GRANT ALL ON public.event_payment_method_assignments TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.event_payment_method_assignments FROM anon, authenticated;

DROP POLICY IF EXISTS "public_read_active_event_payment_methods" ON public.event_payment_methods;
CREATE POLICY "public_read_active_event_payment_methods"
  ON public.event_payment_methods
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.event_payment_method_assignments assignment
      JOIN public.events event ON event.id = assignment.event_id
      WHERE assignment.payment_method_id = event_payment_methods.id
        AND assignment.is_active
        AND event.published
        AND event.status = 'upcoming'
    )
    AND (
      auth.role() = 'anon'
      OR (
        NOT public.jwt_has_role('event_admin')
        AND NOT public.jwt_has_role('admin_ticket')
        AND NOT public.jwt_has_role('admin_qr')
      )
    )
  );

DROP POLICY IF EXISTS "ticket_admin_manage_scoped_payment_methods" ON public.event_payment_methods;
CREATE POLICY "ticket_admin_manage_scoped_payment_methods"
  ON public.event_payment_methods
  FOR ALL
  TO authenticated
  USING (
    public.jwt_has_role('admin')
    OR EXISTS (
      SELECT 1
      FROM public.event_payment_method_assignments assignment
      WHERE assignment.payment_method_id = event_payment_methods.id
        AND public.user_has_ticket_event_scope(assignment.event_id, 'admin_ticket')
    )
  )
  WITH CHECK (
    public.jwt_has_role('admin')
    OR EXISTS (
      SELECT 1
      FROM public.event_payment_method_assignments assignment
      WHERE assignment.payment_method_id = event_payment_methods.id
        AND public.user_has_ticket_event_scope(assignment.event_id, 'admin_ticket')
    )
  );

CREATE POLICY "public_read_active_ticket_payment_assignments"
  ON public.event_payment_method_assignments
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active
    AND EXISTS (
      SELECT 1
      FROM public.events event
      WHERE event.id = event_id
        AND event.published
        AND event.status = 'upcoming'
    )
    AND (
      auth.role() = 'anon'
      OR (
        NOT public.jwt_has_role('event_admin')
        AND NOT public.jwt_has_role('admin_ticket')
        AND NOT public.jwt_has_role('admin_qr')
      )
    )
  );

CREATE POLICY "ticket_admin_manage_payment_assignments"
  ON public.event_payment_method_assignments
  FOR ALL
  TO authenticated
  USING (
    public.jwt_has_role('admin')
    OR public.user_has_ticket_event_scope(event_id, 'admin_ticket')
  )
  WITH CHECK (
    public.jwt_has_role('admin')
    OR public.user_has_ticket_event_scope(event_id, 'admin_ticket')
  );

CREATE OR REPLACE FUNCTION public.save_ticket_payment_method(
  p_method_id uuid,
  p_event_ids uuid[],
  p_recipient_name text,
  p_bank_name text,
  p_account_number text,
  p_qris_storage_path text,
  p_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved_method_id uuid;
  anchor_event_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Operasi harus dipanggil melalui service backend'; END IF;
  IF nullif(trim(p_recipient_name), '') IS NULL THEN RAISE EXCEPTION 'Nama penerima wajib diisi'; END IF;
  IF coalesce(cardinality(p_event_ids), 0) = 0
    OR EXISTS (SELECT 1 FROM unnest(p_event_ids) AS selected_events(event_id) WHERE selected_events.event_id IS NULL)
    OR cardinality(p_event_ids) <> (SELECT count(DISTINCT selected_events.event_id) FROM unnest(p_event_ids) AS selected_events(event_id)) THEN
    RAISE EXCEPTION 'Pilih minimal satu Event yang berbeda';
  END IF;
  IF nullif(trim(p_account_number), '') IS NULL
    AND nullif(trim(p_qris_storage_path), '') IS NULL THEN
    RAISE EXCEPTION 'Isi nomor rekening atau upload QRIS';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_event_ids) AS selected_events(event_id)
    WHERE NOT EXISTS (SELECT 1 FROM public.events event WHERE event.id = selected_events.event_id)
  ) THEN
    RAISE EXCEPTION 'Event yang dipilih tidak ditemukan';
  END IF;

  anchor_event_id := p_event_ids[1];
  IF p_method_id IS NULL THEN
    INSERT INTO public.event_payment_methods (
      event_id, recipient_name, bank_name, account_number, qris_storage_path, note, is_active
    ) VALUES (
      anchor_event_id, trim(p_recipient_name), nullif(trim(p_bank_name), ''),
      nullif(trim(p_account_number), ''), nullif(trim(p_qris_storage_path), ''),
      nullif(trim(p_note), ''), false
    )
    RETURNING id INTO saved_method_id;
  ELSE
    UPDATE public.event_payment_methods
    SET recipient_name = trim(p_recipient_name),
        bank_name = nullif(trim(p_bank_name), ''),
        account_number = nullif(trim(p_account_number), ''),
        qris_storage_path = nullif(trim(p_qris_storage_path), ''),
        note = nullif(trim(p_note), ''),
        updated_at = now()
    WHERE id = p_method_id
    RETURNING id INTO saved_method_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Informasi pembayaran tidak ditemukan'; END IF;
  END IF;

  DELETE FROM public.event_payment_method_assignments
  WHERE payment_method_id = saved_method_id
    AND NOT (event_id = ANY(p_event_ids));

  INSERT INTO public.event_payment_method_assignments (payment_method_id, event_id)
  SELECT saved_method_id, selected_events.event_id
  FROM unnest(p_event_ids) AS selected_events(event_id)
  ON CONFLICT (payment_method_id, event_id) DO NOTHING;

  RETURN saved_method_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_ticket_payment_method(uuid, uuid[], text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_ticket_payment_method(uuid, uuid[], text, text, text, text, text) TO service_role;

DROP FUNCTION IF EXISTS public.set_ticket_payment_method_active(uuid, uuid);
CREATE FUNCTION public.set_ticket_payment_method_active(
  p_method_id uuid,
  p_event_id uuid,
  p_actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Operasi harus dipanggil melalui service backend'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));
  PERFORM 1
  FROM public.event_payment_method_assignments
  WHERE payment_method_id = p_method_id AND event_id = p_event_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Informasi pembayaran tidak ditugaskan ke Event ini';
  END IF;

  UPDATE public.event_payment_method_assignments
  SET is_active = false, updated_at = now()
  WHERE event_id = p_event_id AND is_active;

  UPDATE public.event_payment_method_assignments
  SET is_active = true, updated_at = now()
  WHERE payment_method_id = p_method_id AND event_id = p_event_id;

  RETURN p_method_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_ticket_payment_method_active(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_ticket_payment_method_active(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.create_ticket_order(
  p_order_number text,
  p_event_id uuid,
  p_ticket_id uuid,
  p_full_name text,
  p_email text,
  p_whatsapp text,
  p_quantity integer,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_event public.events%ROWTYPE;
  selected_ticket public.event_tickets%ROWTYPE;
  selected_payment public.event_payment_methods%ROWTYPE;
  normalized_phone text;
  committed_quantity bigint;
  new_order_id uuid := gen_random_uuid();
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 10 THEN
    RAISE EXCEPTION 'Jumlah tiket harus antara 1 dan 10';
  END IF;
  IF nullif(trim(p_full_name), '') IS NULL THEN
    RAISE EXCEPTION 'Nama pembeli wajib diisi';
  END IF;
  IF nullif(trim(p_email), '') IS NULL OR trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Email pembeli wajib diisi dengan format yang valid';
  END IF;
  normalized_phone := public.normalize_ticket_whatsapp(p_whatsapp);
  IF length(normalized_phone) < 10 OR length(normalized_phone) > 15 THEN
    RAISE EXCEPTION 'Nomor WhatsApp tidak valid';
  END IF;
  IF p_order_number !~ '^[A-Z]{3}-[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'Nomor order tidak valid';
  END IF;

  SELECT * INTO selected_event
  FROM public.events
  WHERE id = p_event_id AND published = true AND status = 'upcoming'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event tidak tersedia untuk pemesanan'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));
  SELECT * INTO selected_ticket
  FROM public.event_tickets
  WHERE id = p_ticket_id AND event_id = p_event_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jenis tiket tidak tersedia'; END IF;

  SELECT method.* INTO selected_payment
  FROM public.event_payment_method_assignments assignment
  JOIN public.event_payment_methods method ON method.id = assignment.payment_method_id
  WHERE assignment.event_id = p_event_id AND assignment.is_active = true
  FOR SHARE OF assignment, method;
  IF NOT FOUND THEN RAISE EXCEPTION 'Informasi pembayaran Event belum aktif'; END IF;

  UPDATE public.ticket_orders
  SET status = 'Expired', updated_at = now()
  WHERE ticket_id = p_ticket_id
    AND status IN ('Draft Pembayaran', 'Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar')
    AND expires_at IS NOT NULL
    AND expires_at <= now();

  SELECT coalesce(sum(quantity), 0) INTO committed_quantity
  FROM public.ticket_orders
  WHERE ticket_id = p_ticket_id
    AND status IN ('Draft Pembayaran', 'Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar', 'Lunas', 'Terverifikasi', 'Selesai');

  IF selected_ticket.quota IS NOT NULL AND committed_quantity + p_quantity > selected_ticket.quota THEN
    RAISE EXCEPTION 'Kuota tiket tidak mencukupi';
  END IF;

  INSERT INTO public.ticket_orders (
    id, order_number, event_id, ticket_id, ticket_category,
    full_name, email, whatsapp, quantity, unit_price, total_price,
    notes, status, expires_at, payment_method_id, payment_method_snapshot
  ) VALUES (
    new_order_id, p_order_number, p_event_id, p_ticket_id, selected_ticket.name,
    trim(p_full_name), lower(trim(p_email)), normalized_phone, p_quantity,
    selected_ticket.price, selected_ticket.price * p_quantity, null, 'Draft Pembayaran',
    now() + interval '30 minutes', selected_payment.id,
    jsonb_build_object(
      'recipient_name', selected_payment.recipient_name,
      'bank_name', selected_payment.bank_name,
      'account_number', selected_payment.account_number,
      'qris_storage_path', selected_payment.qris_storage_path,
      'note', selected_payment.note
    )
  );

  RETURN new_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ticket_order(text, uuid, uuid, text, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ticket_order(text, uuid, uuid, text, text, text, integer, text) TO anon;
