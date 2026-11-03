CREATE TABLE public.ticket_free_pass_requests (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_hash text NOT NULL,
  order_id uuid NOT NULL UNIQUE REFERENCES public.ticket_orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_free_pass_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_free_pass_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.ticket_free_pass_requests TO service_role;

CREATE OR REPLACE FUNCTION public.issue_ticket_free_pass_idempotent(
  p_request_id uuid,
  p_order_number text,
  p_event_id uuid,
  p_ticket_id uuid,
  p_full_name text,
  p_email text,
  p_whatsapp text,
  p_quantity integer,
  p_reason text,
  p_actor_id uuid,
  p_access_code_hash text,
  p_whatsapp_code_hash text,
  p_access_code_ciphertext text,
  p_qr_tokens jsonb
)
RETURNS TABLE (issued_order_id uuid, resolved_access_code_id uuid, issued_ticket_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_phone text;
  request_hash text;
  existing_request public.ticket_free_pass_requests%ROWTYPE;
  issued_order record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Operasi harus dipanggil melalui Admin Tiket';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Kunci penerbitan Free Pass wajib diisi';
  END IF;

  normalized_phone := public.normalize_ticket_whatsapp(p_whatsapp);
  request_hash := md5(jsonb_build_array(
    p_actor_id,
    p_event_id,
    p_ticket_id,
    trim(p_full_name),
    nullif(lower(trim(p_email)), ''),
    normalized_phone,
    p_quantity,
    trim(p_reason)
  )::text);

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  SELECT * INTO existing_request
  FROM public.ticket_free_pass_requests
  WHERE request_id = p_request_id;

  IF FOUND THEN
    IF existing_request.actor_id IS DISTINCT FROM p_actor_id
      OR existing_request.request_hash IS DISTINCT FROM request_hash THEN
      RAISE EXCEPTION 'Kunci penerbitan sudah digunakan untuk data Free Pass yang berbeda';
    END IF;

    RETURN QUERY
    SELECT existing_request.order_id,
      order_row.access_code_id,
      (SELECT count(*)::integer FROM public.ticket_instances WHERE ticket_order_id = existing_request.order_id)
    FROM public.ticket_orders AS order_row
    WHERE order_row.id = existing_request.order_id;
    RETURN;
  END IF;

  SELECT * INTO issued_order
  FROM public.issue_ticket_free_pass(
    p_order_number,
    p_event_id,
    p_ticket_id,
    p_full_name,
    p_email,
    p_whatsapp,
    p_quantity,
    p_reason,
    p_actor_id,
    p_access_code_hash,
    p_whatsapp_code_hash,
    p_access_code_ciphertext,
    p_qr_tokens
  );

  INSERT INTO public.ticket_free_pass_requests (request_id, actor_id, request_hash, order_id)
  VALUES (p_request_id, p_actor_id, request_hash, issued_order.issued_order_id);

  RETURN QUERY SELECT
    issued_order.issued_order_id,
    issued_order.resolved_access_code_id,
    issued_order.issued_ticket_count;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_ticket_free_pass_idempotent(uuid, text, uuid, uuid, text, text, text, integer, text, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_ticket_free_pass_idempotent(uuid, text, uuid, uuid, text, text, text, integer, text, uuid, text, text, text, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.issue_ticket_free_pass(text, uuid, uuid, text, text, text, integer, text, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
