-- Ticketing V1 data structures. Depends on the access foundation migration.
-- Do not apply until production migration drift is resolved and staging-tested.

ALTER TABLE public.event_tickets
  ADD COLUMN IF NOT EXISTS quota integer;

ALTER TABLE public.event_tickets
  DROP CONSTRAINT IF EXISTS event_tickets_quota_nonnegative;
ALTER TABLE public.event_tickets
  ADD CONSTRAINT event_tickets_quota_nonnegative CHECK (quota IS NULL OR quota >= 0);

CREATE TABLE IF NOT EXISTS public.event_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  recipient_name text NOT NULL,
  bank_name text,
  account_number text,
  qris_storage_path text,
  note text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_payment_methods_destination CHECK (
    nullif(trim(account_number), '') IS NOT NULL
    OR nullif(trim(qris_storage_path), '') IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_payment_methods_one_active
  ON public.event_payment_methods(event_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_event_payment_methods_event
  ON public.event_payment_methods(event_id, is_active);

ALTER TABLE public.ticket_orders
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_amount integer,
  ADD COLUMN IF NOT EXISTS payment_proof_path text,
  ADD COLUMN IF NOT EXISTS payment_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method_id uuid REFERENCES public.event_payment_methods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_method_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS access_code_id uuid;

ALTER TABLE public.ticket_orders
  DROP CONSTRAINT IF EXISTS ticket_orders_event_id_fkey;
ALTER TABLE public.ticket_orders
  ADD CONSTRAINT ticket_orders_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

ALTER TABLE public.ticket_orders
  DROP CONSTRAINT IF EXISTS ticket_orders_payment_amount_nonnegative;
ALTER TABLE public.ticket_orders
  ADD CONSTRAINT ticket_orders_payment_amount_nonnegative
  CHECK (payment_amount IS NULL OR payment_amount >= 0);

ALTER TABLE public.ticket_orders
  DROP CONSTRAINT IF EXISTS ticket_orders_status_check;
ALTER TABLE public.ticket_orders
  ADD CONSTRAINT ticket_orders_status_check CHECK (
    status IN (
      'Menunggu Pembayaran',
      'Menunggu Verifikasi',
      'Lunas',
      'Ditolak',
      'Expired',
      'Sudah Bayar',
      'Terverifikasi',
      'Selesai',
      'Dibatalkan'
    )
  );

CREATE INDEX IF NOT EXISTS idx_ticket_orders_event_status
  ON public.ticket_orders(event_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_orders_expiring
  ON public.ticket_orders(expires_at)
  WHERE status IN ('Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar');

CREATE TABLE IF NOT EXISTS public.ticket_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  whatsapp_normalized text NOT NULL CHECK (whatsapp_normalized ~ '^[0-9]{10,15}$'),
  access_code_hash text NOT NULL UNIQUE,
  whatsapp_code_hash text NOT NULL UNIQUE,
  access_code_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_sent_at timestamptz,
  last_sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  send_count integer NOT NULL DEFAULT 0 CHECK (send_count >= 0),
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text CHECK (revoke_reason IS NULL OR revoke_reason IN ('event_completed', 'admin_revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_access_codes_revocation_state CHECK (
    (status = 'active' AND revoked_at IS NULL AND revoke_reason IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_access_codes_active_event_whatsapp
  ON public.ticket_access_codes(event_id, whatsapp_normalized)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.ticket_access_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code_id uuid NOT NULL REFERENCES public.ticket_access_codes(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL UNIQUE,
  device_tag_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text CHECK (revoke_reason IS NULL OR revoke_reason IN ('logout', 'replaced', 'idle_timeout', 'event_completed', 'admin_revoked')),
  CONSTRAINT ticket_access_sessions_revocation_state CHECK (
    (revoked_at IS NULL AND revoke_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_access_sessions_one_active
  ON public.ticket_access_sessions(access_code_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_access_sessions_idle_expiry
  ON public.ticket_access_sessions(idle_expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.ticket_access_login_attempts (
  attempt_key_hash text PRIMARY KEY,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_access_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_access_login_attempts FROM anon, authenticated;

ALTER TABLE public.ticket_orders
  ADD CONSTRAINT ticket_orders_access_code_id_fkey
  FOREIGN KEY (access_code_id) REFERENCES public.ticket_access_codes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_orders_access_code
  ON public.ticket_orders(access_code_id, created_at DESC)
  WHERE access_code_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ticket_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_order_id uuid NOT NULL REFERENCES public.ticket_orders(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  event_ticket_id uuid REFERENCES public.event_tickets(id) ON DELETE SET NULL,
  sequence_no integer NOT NULL CHECK (sequence_no > 0),
  qr_token_hash text NOT NULL UNIQUE,
  qr_token_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  checked_in_at timestamptz,
  checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  check_in_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_order_id, sequence_no),
  CONSTRAINT ticket_instances_checkin_pair CHECK (
    (checked_in_at IS NULL AND checked_in_by IS NULL)
    OR (checked_in_at IS NOT NULL AND checked_in_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_ticket_instances_event_status
  ON public.ticket_instances(event_id, status, checked_in_at);

CREATE INDEX IF NOT EXISTS idx_ticket_instances_order
  ON public.ticket_instances(ticket_order_id, sequence_no);

CREATE TABLE IF NOT EXISTS public.ticket_maintenance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  ticket_order_id uuid REFERENCES public.ticket_orders(id) ON DELETE SET NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('thanks', 'upcoming_event', 'promo')),
  recipient_name text NOT NULL,
  whatsapp_normalized text NOT NULL CHECK (whatsapp_normalized ~ '^[0-9]{10,15}$'),
  message text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent')),
  sent_at timestamptz,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_maintenance_sent_pair CHECK (
    (delivery_status = 'pending' AND sent_at IS NULL AND sent_by IS NULL)
    OR (delivery_status = 'sent' AND sent_at IS NOT NULL AND sent_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_ticket_maintenance_event
  ON public.ticket_maintenance_logs(event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ticket_maintenance_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_log_id uuid NOT NULL REFERENCES public.ticket_maintenance_logs(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ticket_maintenance_sends_log
  ON public.ticket_maintenance_sends(maintenance_log_id, sent_at DESC);

INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
  'ticket-payment-proofs',
  'ticket-payment-proofs',
  false,
  ARRAY['image/jpeg', 'image/png', 'image/webp'],
  5242880
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  file_size_limit = EXCLUDED.file_size_limit;

ALTER TABLE public.event_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_access_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_maintenance_sends ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ticket_access_codes, public.ticket_access_sessions, public.ticket_instances FROM anon, authenticated;
REVOKE ALL ON public.ticket_maintenance_logs FROM anon;

DROP POLICY IF EXISTS "public_read_active_event_payment_methods" ON public.event_payment_methods;
CREATE POLICY "public_read_active_event_payment_methods"
  ON public.event_payment_methods
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active
    AND EXISTS (
      SELECT 1 FROM public.events event
      WHERE event.id = event_id
        AND event.published
        AND event.status = 'upcoming'
    )
    AND (
      auth.role() = 'anon'
      OR (
        NOT public.jwt_has_role('event_admin')
        AND NOT public.jwt_has_role('admin_ticket')
        AND NOT public.jwt_has_role('admin_qr')
      )
    )
  );

DROP POLICY IF EXISTS "ticket_admin_manage_scoped_payment_methods" ON public.event_payment_methods;
CREATE POLICY "ticket_admin_manage_scoped_payment_methods"
  ON public.event_payment_methods
  FOR ALL
  TO authenticated
  USING (
    public.jwt_has_role('admin')
    OR public.user_has_ticket_event_scope(event_id, 'admin_ticket')
  )
  WITH CHECK (
    public.jwt_has_role('admin')
    OR public.user_has_ticket_event_scope(event_id, 'admin_ticket')
  );

DROP POLICY IF EXISTS "admin_manage_ticket_maintenance" ON public.ticket_maintenance_logs;
CREATE POLICY "admin_manage_ticket_maintenance"
  ON public.ticket_maintenance_logs
  FOR ALL
  TO authenticated
  USING (
    public.jwt_has_role('admin')
    OR public.jwt_has_role('event_admin')
  )
  WITH CHECK (
    public.jwt_has_role('admin')
    OR public.jwt_has_role('event_admin')
  );

DROP POLICY IF EXISTS "admin_read_ticket_maintenance_sends" ON public.ticket_maintenance_sends;
CREATE POLICY "admin_read_ticket_maintenance_sends"
  ON public.ticket_maintenance_sends
  FOR SELECT
  TO authenticated
  USING (
    public.jwt_has_role('admin')
    OR EXISTS (
      SELECT 1 FROM public.ticket_maintenance_logs maintenance
      WHERE maintenance.id = maintenance_log_id
        AND (
          public.jwt_has_role('event_admin')
        )
    )
  );

REVOKE ALL ON public.ticket_maintenance_sends FROM anon;

CREATE OR REPLACE FUNCTION public.revoke_ticket_access_on_event_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.ticket_access_codes
    SET status = 'revoked',
        revoked_at = now(),
        revoke_reason = 'event_completed',
        updated_at = now()
    WHERE event_id = NEW.id
      AND status = 'active';

    UPDATE public.ticket_access_sessions session
    SET revoked_at = now(),
        revoke_reason = 'event_completed'
    FROM public.ticket_access_codes access_code
    WHERE session.access_code_id = access_code.id
      AND access_code.event_id = NEW.id
      AND session.revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS revoke_ticket_access_after_event_completion ON public.events;
CREATE TRIGGER revoke_ticket_access_after_event_completion
  AFTER UPDATE OF status ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.revoke_ticket_access_on_event_completion();