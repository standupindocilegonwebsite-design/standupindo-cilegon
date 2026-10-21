ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ticket_sales_mode text NOT NULL DEFAULT 'free';

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_ticket_sales_mode_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_ticket_sales_mode_check
  CHECK (ticket_sales_mode IN ('free', 'paid'));

UPDATE public.events AS event
SET ticket_sales_mode = 'paid'
WHERE COALESCE(event.ticket_price, 0) > 0
   OR EXISTS (
     SELECT 1
     FROM public.event_tickets AS ticket
     WHERE ticket.event_id = event.id
       AND ticket.status = 'active'
       AND ticket.available_public = true
   );
