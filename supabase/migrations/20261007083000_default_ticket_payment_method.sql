ALTER TABLE public.event_payment_methods
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_payment_methods_one_default
  ON public.event_payment_methods(is_default)
  WHERE is_default;

CREATE OR REPLACE FUNCTION public.set_default_ticket_payment_method(p_method_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Operasi harus dipanggil melalui service backend';
  END IF;

  IF p_method_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.event_payment_methods WHERE id = p_method_id
  ) THEN
    RAISE EXCEPTION 'Informasi pembayaran tidak ditemukan';
  END IF;

  UPDATE public.event_payment_methods
  SET is_default = false
  WHERE is_default;

  IF p_method_id IS NOT NULL THEN
    UPDATE public.event_payment_methods
    SET is_default = true
    WHERE id = p_method_id;
  END IF;

  RETURN p_method_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_default_ticket_payment_method(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_default_ticket_payment_method(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_default_ticket_payment_method_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  default_method_id uuid;
BEGIN
  IF NOT NEW.published OR (TG_OP = 'UPDATE' AND OLD.published) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO default_method_id
  FROM public.event_payment_methods
  WHERE is_default
  FOR SHARE;

  IF default_method_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.event_payment_method_assignments
  SET is_active = false,
      updated_at = now()
  WHERE event_id = NEW.id AND is_active;

  INSERT INTO public.event_payment_method_assignments (payment_method_id, event_id, is_active)
  VALUES (default_method_id, NEW.id, true)
  ON CONFLICT (payment_method_id, event_id) DO UPDATE
  SET is_active = true,
      updated_at = now();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_default_ticket_payment_method_on_publish() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS apply_default_ticket_payment_method_on_publish ON public.events;
CREATE TRIGGER apply_default_ticket_payment_method_on_publish
  AFTER INSERT OR UPDATE OF published ON public.events
  FOR EACH ROW
  WHEN (NEW.published = true)
  EXECUTE FUNCTION public.apply_default_ticket_payment_method_on_publish();
