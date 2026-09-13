-- Add customer email to public ticket orders.
ALTER TABLE public.ticket_orders
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.ticket_orders
  DROP CONSTRAINT IF EXISTS ticket_orders_email_format;

ALTER TABLE public.ticket_orders
  ADD CONSTRAINT ticket_orders_email_format
  CHECK (email IS NULL OR email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
