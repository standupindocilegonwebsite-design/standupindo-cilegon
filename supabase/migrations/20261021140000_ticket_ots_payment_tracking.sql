ALTER TABLE public.ticket_orders
  ADD COLUMN IF NOT EXISTS ots_payment_method text,
  ADD COLUMN IF NOT EXISTS ots_payment_source text,
  ADD COLUMN IF NOT EXISTS ots_payment_method_id uuid REFERENCES public.event_payment_methods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ots_payment_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS ots_payment_status text,
  ADD COLUMN IF NOT EXISTS ots_payment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ots_payment_confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.ticket_orders
  DROP CONSTRAINT IF EXISTS ticket_orders_ots_payment_fields_valid;
ALTER TABLE public.ticket_orders
  ADD CONSTRAINT ticket_orders_ots_payment_fields_valid CHECK ((
    (
      ots_payment_status IS NULL
      AND ots_payment_method IS NULL
      AND ots_payment_source IS NULL
      AND ots_payment_method_id IS NULL
      AND ots_payment_snapshot IS NULL
      AND ots_payment_confirmed_at IS NULL
      AND ots_payment_confirmed_by IS NULL
    )
    OR (
      sale_channel = 'ots'
      AND ots_payment_method IN ('cash', 'qris', 'bank_transfer')
      AND ots_payment_status IN ('pending', 'confirmed')
      AND (
        (
          ots_payment_method = 'cash'
          AND ots_payment_source IS NULL
          AND ots_payment_method_id IS NULL
          AND ots_payment_snapshot IS NULL
        )
        OR (
          ots_payment_method IN ('qris', 'bank_transfer')
          AND ots_payment_source IN ('website', 'other')
          AND jsonb_typeof(ots_payment_snapshot) = 'object'
        )
      )
      AND (
        (ots_payment_status = 'pending' AND ots_payment_confirmed_at IS NULL AND ots_payment_confirmed_by IS NULL)
        OR (ots_payment_status = 'confirmed' AND ots_payment_confirmed_at IS NOT NULL AND ots_payment_confirmed_by IS NOT NULL)
      )
    )
  ) IS TRUE);

CREATE INDEX IF NOT EXISTS idx_ticket_orders_ots_payment_report
  ON public.ticket_orders(event_id, ots_payment_status, created_at DESC)
  WHERE sale_channel = 'ots';

CREATE TABLE IF NOT EXISTS public.ticket_ots_payment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_order_id uuid NOT NULL REFERENCES public.ticket_orders(id) ON DELETE CASCADE,
  previous_status text CHECK (previous_status IS NULL OR previous_status IN ('pending', 'confirmed')),
  new_status text NOT NULL CHECK (new_status IN ('pending', 'confirmed')),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_ots_payment_history_order
  ON public.ticket_ots_payment_history(ticket_order_id, created_at);

ALTER TABLE public.ticket_ots_payment_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_ots_payment_history FROM anon, authenticated;
GRANT SELECT ON public.ticket_ots_payment_history TO authenticated;
GRANT ALL ON public.ticket_ots_payment_history TO service_role;

CREATE POLICY "ticket_admin_read_scoped_ots_payment_history"
  ON public.ticket_ots_payment_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ticket_orders ticket_order
      WHERE ticket_order.id = ticket_order_id
        AND (
          public.jwt_has_role('admin')
          OR public.user_has_ticket_event_scope(ticket_order.event_id, 'admin_ticket')
        )
    )
  );

CREATE OR REPLACE FUNCTION public.issue_ticket_ots_with_payment(
  p_order_number text,
  p_event_id uuid,
  p_ticket_id uuid,
  p_full_name text,
  p_whatsapp text,
  p_quantity integer,
  p_actor_id uuid,
  p_access_code_hash text,
  p_whatsapp_code_hash text,
  p_access_code_ciphertext text,
  p_qr_tokens jsonb,
  p_ots_payment_method text,
  p_ots_payment_source text,
  p_ots_payment_method_id uuid,
  p_ots_payment_snapshot jsonb
)
RETURNS TABLE (issued_order_id uuid, resolved_access_code_id uuid, issued_ticket_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  issued_result record;
  normalized_method text := lower(trim(coalesce(p_ots_payment_method, '')));
  normalized_source text := lower(trim(coalesce(p_ots_payment_source, '')));
  destination_snapshot jsonb := p_ots_payment_snapshot;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Operasi harus dipanggil melalui Admin Tiket';
  END IF;
  IF normalized_method NOT IN ('cash', 'qris', 'bank_transfer') THEN
    RAISE EXCEPTION 'Metode pembayaran OTS tidak valid';
  END IF;

  IF normalized_method = 'cash' THEN
    IF p_ots_payment_source IS NOT NULL OR p_ots_payment_method_id IS NOT NULL OR destination_snapshot IS NOT NULL THEN
      RAISE EXCEPTION 'Pembayaran tunai tidak memerlukan tujuan pembayaran';
    END IF;
  ELSE
    IF normalized_source IS NULL OR normalized_source NOT IN ('website', 'other')
      OR jsonb_typeof(destination_snapshot) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Tujuan pembayaran OTS wajib ditentukan';
    END IF;
    IF nullif(trim(destination_snapshot->>'recipient_name'), '') IS NULL THEN
      RAISE EXCEPTION 'Nama penerima pembayaran wajib dicatat';
    END IF;
    IF p_ots_payment_method_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.event_payment_method_assignments assignment
      JOIN public.event_payment_methods method ON method.id = assignment.payment_method_id
      WHERE assignment.event_id = p_event_id
        AND assignment.payment_method_id = p_ots_payment_method_id
        AND (
          (normalized_source = 'website' AND assignment.is_active)
          OR (normalized_source = 'other' AND NOT assignment.is_active)
        )
    ) THEN
      RAISE EXCEPTION 'Tujuan pembayaran tidak tersedia untuk Event ini';
    END IF;
    IF normalized_source = 'website' AND p_ots_payment_method_id IS NULL THEN
      RAISE EXCEPTION 'Tujuan pembayaran website tidak ditemukan';
    END IF;
    IF normalized_method = 'bank_transfer'
      AND nullif(trim(destination_snapshot->>'account_number'), '') IS NULL THEN
      RAISE EXCEPTION 'Nomor rekening tujuan transfer wajib dicatat';
    END IF;
    IF normalized_method = 'qris'
      AND nullif(trim(destination_snapshot->>'qris_storage_path'), '') IS NULL
      AND nullif(trim(destination_snapshot->>'qris_identifier'), '') IS NULL THEN
      RAISE EXCEPTION 'Identitas QRIS wajib dicatat';
    END IF;
  END IF;

  SELECT * INTO issued_result
  FROM public.issue_ticket_ots(
    p_order_number,
    p_event_id,
    p_ticket_id,
    p_full_name,
    p_whatsapp,
    p_quantity,
    p_actor_id,
    p_access_code_hash,
    p_whatsapp_code_hash,
    p_access_code_ciphertext,
    p_qr_tokens
  );

  UPDATE public.ticket_orders
  SET ots_payment_method = normalized_method,
      ots_payment_source = CASE WHEN normalized_method = 'cash' THEN NULL ELSE normalized_source END,
      ots_payment_method_id = CASE WHEN normalized_method = 'cash' THEN NULL ELSE p_ots_payment_method_id END,
      ots_payment_snapshot = CASE WHEN normalized_method = 'cash' THEN NULL ELSE destination_snapshot END,
      ots_payment_status = 'pending'
  WHERE id = issued_result.issued_order_id;

  INSERT INTO public.ticket_ots_payment_history (
    ticket_order_id, previous_status, new_status, actor_id
  ) VALUES (
    issued_result.issued_order_id, NULL, 'pending', p_actor_id
  );

  RETURN QUERY SELECT issued_result.issued_order_id, issued_result.resolved_access_code_id, issued_result.issued_ticket_count;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_ticket_ots_with_payment(text, uuid, uuid, text, text, integer, uuid, text, text, text, jsonb, text, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_ticket_ots_with_payment(text, uuid, uuid, text, text, integer, uuid, text, text, text, jsonb, text, text, uuid, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_ticket_ots_payment(
  p_order_id uuid,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_order public.ticket_orders%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Operasi harus dipanggil melalui Admin Tiket';
  END IF;
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Admin konfirmasi tidak valid'; END IF;

  SELECT * INTO selected_order
  FROM public.ticket_orders
  WHERE id = p_order_id AND sale_channel = 'ots'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaksi OTS tidak ditemukan'; END IF;
  IF selected_order.ots_payment_status = 'confirmed' THEN RETURN false; END IF;
  IF selected_order.ots_payment_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Status pembayaran OTS tidak dapat dikonfirmasi';
  END IF;

  UPDATE public.ticket_orders
  SET ots_payment_status = 'confirmed',
      ots_payment_confirmed_at = now(),
      ots_payment_confirmed_by = p_actor_id,
      updated_at = now()
  WHERE id = selected_order.id;

  INSERT INTO public.ticket_ots_payment_history (
    ticket_order_id, previous_status, new_status, actor_id
  ) VALUES (
    selected_order.id, 'pending', 'confirmed', p_actor_id
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_ticket_ots_payment(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_ticket_ots_payment(uuid, uuid) TO service_role;
