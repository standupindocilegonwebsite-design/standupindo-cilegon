-- Add a short, human-friendly order number for ticket orders.
ALTER TABLE public.ticket_orders
  ADD COLUMN IF NOT EXISTS order_number text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_orders_order_number
  ON public.ticket_orders(order_number)
  WHERE order_number IS NOT NULL;

ALTER TABLE public.ticket_orders
  DROP CONSTRAINT IF EXISTS ticket_orders_order_number_format;

ALTER TABLE public.ticket_orders
  ADD CONSTRAINT ticket_orders_order_number_format
  CHECK (order_number IS NULL OR order_number ~ '^[A-Z]{3}-[A-Z0-9]{6}$');
