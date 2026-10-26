ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ticket_payment_mode text;

UPDATE public.events
SET ticket_payment_mode = 'manual'
WHERE ticket_payment_mode IS NULL;

ALTER TABLE public.events
  ALTER COLUMN ticket_payment_mode SET DEFAULT 'manual',
  ALTER COLUMN ticket_payment_mode SET NOT NULL;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_ticket_payment_mode_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_ticket_payment_mode_check
  CHECK (ticket_payment_mode IN ('manual', 'midtrans', 'both'));

CREATE OR REPLACE FUNCTION public.guard_ticket_payment_mode_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.ticket_payment_mode IS DISTINCT FROM OLD.ticket_payment_mode
    AND auth.role() IS DISTINCT FROM 'service_role'
    AND NOT public.jwt_has_role('admin') THEN
    RAISE EXCEPTION 'Mode pembayaran hanya dapat diubah melalui Admin Tiket';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_ticket_payment_mode_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_ticket_payment_mode_update ON public.events;
CREATE TRIGGER guard_ticket_payment_mode_update
  BEFORE UPDATE OF ticket_payment_mode ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_ticket_payment_mode_update();

CREATE OR REPLACE FUNCTION public.guard_online_ticket_order_payment_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  selected_payment_mode text;
BEGIN
  IF NEW.order_type IS DISTINCT FROM 'paid'
    OR NEW.sale_channel IS DISTINCT FROM 'online' THEN
    RETURN NEW;
  END IF;

  SELECT event.ticket_payment_mode INTO selected_payment_mode
  FROM public.events AS event
  WHERE event.id = NEW.event_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event pemesanan tidak ditemukan';
  END IF;
  IF selected_payment_mode NOT IN ('manual', 'both') THEN
    RAISE EXCEPTION 'Pembayaran manual tidak tersedia untuk Event ini';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_online_ticket_order_payment_mode() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_online_ticket_order_payment_mode ON public.ticket_orders;
CREATE TRIGGER guard_online_ticket_order_payment_mode
  BEFORE INSERT ON public.ticket_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_online_ticket_order_payment_mode();