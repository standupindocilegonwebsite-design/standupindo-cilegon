CREATE OR REPLACE FUNCTION public.validate_ticket_order_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.email IS NULL OR nullif(trim(NEW.email), '') IS NULL THEN
    IF NEW.order_type = 'paid' AND NEW.sale_channel = 'online' THEN
      RAISE EXCEPTION 'Email pembeli wajib diisi dengan alamat lengkap';
    END IF;
    NEW.email := NULL;
    RETURN NEW;
  END IF;

  IF position('*' IN NEW.email) > 0
    OR NEW.email ~ '[•●…]'
    OR trim(NEW.email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Email harus berupa alamat lengkap yang valid, bukan email yang disamarkan';
  END IF;

  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_ticket_order_email_insert ON public.ticket_orders;
CREATE TRIGGER validate_ticket_order_email_insert
  BEFORE INSERT ON public.ticket_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_ticket_order_email();

DROP TRIGGER IF EXISTS validate_ticket_order_email_update ON public.ticket_orders;
CREATE TRIGGER validate_ticket_order_email_update
  BEFORE UPDATE OF email ON public.ticket_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_ticket_order_email();
