-- Ticket orders submitted from the public event ticket form.
-- Run this migration in Supabase SQL Editor before enabling local ticket checkout.

CREATE TABLE IF NOT EXISTS public.ticket_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES public.event_tickets(id) ON DELETE SET NULL,
  ticket_category text NOT NULL,
  full_name text NOT NULL,
  whatsapp text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 20),
  unit_price integer NOT NULL CHECK (unit_price >= 0),
  total_price integer NOT NULL CHECK (total_price >= 0),
  notes text,
  status text NOT NULL DEFAULT 'Menunggu Pembayaran' CHECK (status IN ('Menunggu Pembayaran', 'Sudah Bayar', 'Terverifikasi', 'Selesai', 'Dibatalkan')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ticket_orders_event_id ON public.ticket_orders(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_orders_created_at ON public.ticket_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_orders_status ON public.ticket_orders(status);

CREATE OR REPLACE FUNCTION public.prepare_ticket_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_ticket public.event_tickets%ROWTYPE;
BEGIN
  SELECT * INTO selected_ticket
  FROM public.event_tickets
  WHERE id = NEW.ticket_id
    AND event_id = NEW.event_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket tidak tersedia untuk event ini';
  END IF;

  NEW.ticket_category := selected_ticket.name;
  NEW.unit_price := selected_ticket.price;
  NEW.total_price := selected_ticket.price * NEW.quantity;
  NEW.status := 'Menunggu Pembayaran';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepare_ticket_order_before_insert ON public.ticket_orders;
CREATE TRIGGER prepare_ticket_order_before_insert
  BEFORE INSERT ON public.ticket_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prepare_ticket_order();

DROP POLICY IF EXISTS "public_insert_ticket_orders" ON public.ticket_orders;
CREATE POLICY "public_insert_ticket_orders"
  ON public.ticket_orders
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'Menunggu Pembayaran');

DROP POLICY IF EXISTS "admin_read_ticket_orders" ON public.ticket_orders;
CREATE POLICY "admin_read_ticket_orders"
  ON public.ticket_orders
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "admin_update_ticket_orders" ON public.ticket_orders;
CREATE POLICY "admin_update_ticket_orders"
  ON public.ticket_orders
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "admin_delete_ticket_orders" ON public.ticket_orders;
CREATE POLICY "admin_delete_ticket_orders"
  ON public.ticket_orders
  FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
