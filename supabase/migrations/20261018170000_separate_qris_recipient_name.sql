ALTER TABLE public.event_payment_methods
  ADD COLUMN IF NOT EXISTS qris_recipient_name text;

CREATE OR REPLACE FUNCTION public.save_ticket_payment_method_with_qris_recipient(
  p_method_id uuid,
  p_event_ids uuid[],
  p_recipient_name text,
  p_bank_name text,
  p_account_number text,
  p_qris_storage_path text,
  p_qris_recipient_name text,
  p_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved_method_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Operasi harus dipanggil melalui service backend';
  END IF;

  saved_method_id := public.save_ticket_payment_method(
    p_method_id,
    p_event_ids,
    p_recipient_name,
    p_bank_name,
    p_account_number,
    p_qris_storage_path,
    p_note
  );

  UPDATE public.event_payment_methods
  SET qris_recipient_name = nullif(trim(p_qris_recipient_name), '')
  WHERE id = saved_method_id;

  RETURN saved_method_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_ticket_payment_method_with_qris_recipient(uuid, uuid[], text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_ticket_payment_method_with_qris_recipient(uuid, uuid[], text, text, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.snapshot_qris_recipient_on_ticket_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payment_method public.event_payment_methods%ROWTYPE;
  qris_recipient text;
BEGIN
  IF NEW.payment_method_id IS NULL OR NEW.payment_method_snapshot IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO payment_method
  FROM public.event_payment_methods
  WHERE id = NEW.payment_method_id;

  IF NOT FOUND OR nullif(trim(payment_method.qris_storage_path), '') IS NULL THEN
    RETURN NEW;
  END IF;

  qris_recipient := coalesce(nullif(trim(payment_method.qris_recipient_name), ''), payment_method.recipient_name);
  NEW.payment_method_snapshot := coalesce(NEW.payment_method_snapshot, '{}'::jsonb)
    || jsonb_build_object('qris_recipient_name', qris_recipient);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_ticket_order_qris_recipient_snapshot ON public.ticket_orders;
CREATE TRIGGER zzz_ticket_order_qris_recipient_snapshot
  BEFORE INSERT ON public.ticket_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_qris_recipient_on_ticket_order();