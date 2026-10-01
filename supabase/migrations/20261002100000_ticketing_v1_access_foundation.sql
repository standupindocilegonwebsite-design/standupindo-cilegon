-- Ticketing V1 access foundation. Additive only; do not apply until the
-- production migration ledger and local schema drift have been reconciled.

CREATE TABLE IF NOT EXISTS public.admin_event_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin_ticket', 'admin_qr')),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  scope_all boolean NOT NULL DEFAULT false,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_event_scopes_scope_shape CHECK (
    (scope_all AND event_id IS NULL) OR (NOT scope_all AND event_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_event_scopes_all
  ON public.admin_event_scopes(user_id, role)
  WHERE scope_all;

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_event_scopes_event
  ON public.admin_event_scopes(user_id, role, event_id)
  WHERE NOT scope_all;

CREATE INDEX IF NOT EXISTS idx_admin_event_scopes_event_role
  ON public.admin_event_scopes(event_id, role)
  WHERE event_id IS NOT NULL;

ALTER TABLE public.admin_event_scopes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_event_scopes" ON public.admin_event_scopes;
CREATE POLICY "admin_manage_event_scopes"
  ON public.admin_event_scopes
  FOR ALL
  TO authenticated
  USING (public.jwt_has_role('admin'))
  WITH CHECK (public.jwt_has_role('admin'));

DROP POLICY IF EXISTS "users_read_own_event_scopes" ON public.admin_event_scopes;
CREATE POLICY "users_read_own_event_scopes"
  ON public.admin_event_scopes
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.user_has_ticket_event_scope(
  target_event_id uuid,
  required_role text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.jwt_has_role('admin')
    OR EXISTS (
      SELECT 1
      FROM public.admin_event_scopes scope
      WHERE scope.user_id = auth.uid()
        AND scope.role = required_role
        AND (
          scope.scope_all
          OR scope.event_id = target_event_id
        )
        AND public.jwt_has_role(required_role)
    );
$$;

REVOKE ALL ON FUNCTION public.user_has_ticket_event_scope(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_ticket_event_scope(uuid, text) TO authenticated;

-- The legacy permissive policy would otherwise OR with role-scoped policies.
DROP POLICY IF EXISTS "admin_all_events" ON public.events;
DROP POLICY IF EXISTS "admin_select_events" ON public.events;
DROP POLICY IF EXISTS "admin_insert_events" ON public.events;
DROP POLICY IF EXISTS "admin_update_events" ON public.events;
DROP POLICY IF EXISTS "admin_delete_events" ON public.events;
DROP POLICY IF EXISTS "operational_admin_select_events" ON public.events;
DROP POLICY IF EXISTS "operational_admin_insert_events" ON public.events;
DROP POLICY IF EXISTS "operational_admin_update_events" ON public.events;
DROP POLICY IF EXISTS "operational_admin_delete_events" ON public.events;
DROP POLICY IF EXISTS "public_read_events" ON public.events;
DROP POLICY IF EXISTS "public_read_published_events_anon" ON public.events;
DROP POLICY IF EXISTS "public_read_published_events_authenticated" ON public.events;

CREATE POLICY "public_read_published_events_anon"
  ON public.events
  FOR SELECT
  TO anon
  USING (published = true);

CREATE POLICY "public_read_published_events_authenticated"
  ON public.events
  FOR SELECT
  TO authenticated
  USING (
    published = true
    AND NOT public.jwt_has_role('admin_ticket')
    AND NOT public.jwt_has_role('admin_qr')
  );

CREATE POLICY "ticketing_select_scoped_events"
  ON public.events
  FOR SELECT
  TO authenticated
  USING (
    public.jwt_has_role('admin')
    OR public.jwt_has_role('event_admin')
    OR public.user_has_ticket_event_scope(id, 'admin_ticket')
    OR public.user_has_ticket_event_scope(id, 'admin_qr')
  );

CREATE POLICY "event_admin_insert_events"
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));

CREATE POLICY "event_admin_update_events"
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'))
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));

CREATE POLICY "event_admin_delete_events"
  ON public.events
  FOR DELETE
  TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));

-- Ticket/scanner roles can read tiers for assigned Events, but cannot edit tiers.
DROP POLICY IF EXISTS "admin_all_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "admin_select_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "admin_insert_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "admin_update_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "admin_delete_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "operational_admin_select_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "operational_admin_insert_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "operational_admin_update_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "operational_admin_delete_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "public_read_active_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "public_read_active_event_tickets_anon" ON public.event_tickets;
DROP POLICY IF EXISTS "public_read_active_event_tickets_authenticated" ON public.event_tickets;

CREATE POLICY "public_read_active_event_tickets_anon"
  ON public.event_tickets
  FOR SELECT
  TO anon
  USING (status = 'active');

CREATE POLICY "public_read_active_event_tickets_authenticated"
  ON public.event_tickets
  FOR SELECT
  TO authenticated
  USING (
    status = 'active'
    AND NOT public.jwt_has_role('admin_ticket')
    AND NOT public.jwt_has_role('admin_qr')
  );

CREATE POLICY "ticketing_select_scoped_event_tickets"
  ON public.event_tickets
  FOR SELECT
  TO authenticated
  USING (
    public.jwt_has_role('admin')
    OR public.jwt_has_role('event_admin')
    OR public.user_has_ticket_event_scope(event_id, 'admin_ticket')
    OR public.user_has_ticket_event_scope(event_id, 'admin_qr')
  );

CREATE POLICY "event_admin_insert_event_tickets"
  ON public.event_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));

CREATE POLICY "event_admin_update_event_tickets"
  ON public.event_tickets
  FOR UPDATE
  TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'))
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));

CREATE POLICY "event_admin_delete_event_tickets"
  ON public.event_tickets
  FOR DELETE
  TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));

-- Event Admin is audience-read-only. Payment changes belong to Admin Tiket.
DROP POLICY IF EXISTS "admin_read_ticket_orders" ON public.ticket_orders;
DROP POLICY IF EXISTS "admin_update_ticket_orders" ON public.ticket_orders;
DROP POLICY IF EXISTS "admin_delete_ticket_orders" ON public.ticket_orders;
DROP POLICY IF EXISTS "operational_admin_read_ticket_orders" ON public.ticket_orders;
DROP POLICY IF EXISTS "operational_admin_update_ticket_orders" ON public.ticket_orders;
DROP POLICY IF EXISTS "operational_admin_delete_ticket_orders" ON public.ticket_orders;

CREATE POLICY "ticket_admin_read_scoped_ticket_orders"
  ON public.ticket_orders
  FOR SELECT
  TO authenticated
  USING (
    public.jwt_has_role('admin')
    OR public.user_has_ticket_event_scope(event_id, 'admin_ticket')
  );

CREATE POLICY "event_admin_read_paid_audience"
  ON public.ticket_orders
  FOR SELECT
  TO authenticated
  USING (
    public.jwt_has_role('event_admin')
    AND status = 'Lunas'
  );

-- Status changes and deletion are not granted directly to browser clients.
-- Payment review and expiry use service-only RPCs; order history is retained.
DROP POLICY IF EXISTS "ticket_admin_update_scoped_ticket_orders" ON public.ticket_orders;
DROP POLICY IF EXISTS "admin_update_ticket_orders" ON public.ticket_orders;
DROP POLICY IF EXISTS "admin_delete_ticket_orders" ON public.ticket_orders;

CREATE POLICY "admin_delete_ticket_orders"
  ON public.ticket_orders
  FOR DELETE
  TO authenticated
  USING (public.jwt_has_role('admin'));