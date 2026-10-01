-- Keep Event Admin focused on Event management. Ticket configuration is
-- managed by Admin Penuh or Admin Tiket assigned to the Event.

DROP POLICY IF EXISTS "admin_all_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "admin_insert_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "admin_update_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "admin_delete_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "operational_admin_insert_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "operational_admin_update_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "operational_admin_delete_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "event_admin_insert_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "event_admin_update_event_tickets" ON public.event_tickets;
DROP POLICY IF EXISTS "event_admin_delete_event_tickets" ON public.event_tickets;

CREATE POLICY "ticket_admin_insert_scoped_event_tickets"
  ON public.event_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.jwt_has_role('admin')
    OR public.user_has_ticket_event_scope(event_id, 'admin_ticket')
  );

CREATE POLICY "ticket_admin_update_scoped_event_tickets"
  ON public.event_tickets
  FOR UPDATE
  TO authenticated
  USING (
    public.jwt_has_role('admin')
    OR public.user_has_ticket_event_scope(event_id, 'admin_ticket')
  )
  WITH CHECK (
    public.jwt_has_role('admin')
    OR public.user_has_ticket_event_scope(event_id, 'admin_ticket')
  );

CREATE POLICY "ticket_admin_delete_scoped_event_tickets"
  ON public.event_tickets
  FOR DELETE
  TO authenticated
  USING (
    public.jwt_has_role('admin')
    OR public.user_has_ticket_event_scope(event_id, 'admin_ticket')
  );
