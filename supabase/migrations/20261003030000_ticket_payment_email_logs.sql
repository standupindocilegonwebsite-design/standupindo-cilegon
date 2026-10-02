CREATE TABLE IF NOT EXISTS public.ticket_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.ticket_orders(id) ON DELETE CASCADE,
  recipient_email text,
  email_type text NOT NULL DEFAULT 'payment_confirmation' CHECK (email_type = 'payment_confirmation'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  resend_message_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

ALTER TABLE public.ticket_email_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_email_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ticket_email_logs TO service_role;
