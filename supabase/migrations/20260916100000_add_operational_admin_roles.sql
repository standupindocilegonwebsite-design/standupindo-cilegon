-- Operational admin roles share the existing Admin login but receive scoped database access.
-- Keep this migration safe to run independently from the SQL Editor as well as via db push.

CREATE OR REPLACE FUNCTION public.jwt_has_role(required_role text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'roles') = 'array' THEN auth.jwt() -> 'app_metadata' -> 'roles'
        WHEN jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'user_roles') = 'array' THEN auth.jwt() -> 'app_metadata' -> 'user_roles'
        ELSE jsonb_build_array(auth.jwt() -> 'app_metadata' ->> 'role')
      END
    ) AS role_value
    WHERE lower(trim(role_value)) = lower(trim(required_role))
  );
$$;

DROP POLICY IF EXISTS "admin_select_open_mics" ON open_mics;
DROP POLICY IF EXISTS "admin_insert_open_mics" ON open_mics;
DROP POLICY IF EXISTS "admin_update_open_mics" ON open_mics;
DROP POLICY IF EXISTS "admin_delete_open_mics" ON open_mics;
DROP POLICY IF EXISTS "operational_admin_select_open_mics" ON open_mics;
DROP POLICY IF EXISTS "operational_admin_insert_open_mics" ON open_mics;
DROP POLICY IF EXISTS "operational_admin_update_open_mics" ON open_mics;
DROP POLICY IF EXISTS "operational_admin_delete_open_mics" ON open_mics;
CREATE POLICY "operational_admin_select_open_mics" ON open_mics FOR SELECT TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('open_mic_admin'));
CREATE POLICY "operational_admin_insert_open_mics" ON open_mics FOR INSERT TO authenticated
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('open_mic_admin'));
CREATE POLICY "operational_admin_update_open_mics" ON open_mics FOR UPDATE TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('open_mic_admin'))
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('open_mic_admin'));
CREATE POLICY "operational_admin_delete_open_mics" ON open_mics FOR DELETE TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('open_mic_admin'));

DROP POLICY IF EXISTS "admin_select_events" ON events;
DROP POLICY IF EXISTS "admin_insert_events" ON events;
DROP POLICY IF EXISTS "admin_update_events" ON events;
DROP POLICY IF EXISTS "admin_delete_events" ON events;
DROP POLICY IF EXISTS "operational_admin_select_events" ON events;
DROP POLICY IF EXISTS "operational_admin_insert_events" ON events;
DROP POLICY IF EXISTS "operational_admin_update_events" ON events;
DROP POLICY IF EXISTS "operational_admin_delete_events" ON events;
CREATE POLICY "operational_admin_select_events" ON events FOR SELECT TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));
CREATE POLICY "operational_admin_insert_events" ON events FOR INSERT TO authenticated
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));
CREATE POLICY "operational_admin_update_events" ON events FOR UPDATE TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'))
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));
CREATE POLICY "operational_admin_delete_events" ON events FOR DELETE TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));

DROP POLICY IF EXISTS "admin_select_event_tickets" ON event_tickets;
DROP POLICY IF EXISTS "admin_insert_event_tickets" ON event_tickets;
DROP POLICY IF EXISTS "admin_update_event_tickets" ON event_tickets;
DROP POLICY IF EXISTS "admin_delete_event_tickets" ON event_tickets;
DROP POLICY IF EXISTS "operational_admin_select_event_tickets" ON event_tickets;
DROP POLICY IF EXISTS "operational_admin_insert_event_tickets" ON event_tickets;
DROP POLICY IF EXISTS "operational_admin_update_event_tickets" ON event_tickets;
DROP POLICY IF EXISTS "operational_admin_delete_event_tickets" ON event_tickets;
CREATE POLICY "operational_admin_select_event_tickets" ON event_tickets FOR SELECT TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));
CREATE POLICY "operational_admin_insert_event_tickets" ON event_tickets FOR INSERT TO authenticated
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));
CREATE POLICY "operational_admin_update_event_tickets" ON event_tickets FOR UPDATE TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'))
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));
CREATE POLICY "operational_admin_delete_event_tickets" ON event_tickets FOR DELETE TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));

DROP POLICY IF EXISTS "admin_select_registrations" ON open_mic_registrations;
DROP POLICY IF EXISTS "admin_insert_registrations" ON open_mic_registrations;
DROP POLICY IF EXISTS "admin_update_registrations" ON open_mic_registrations;
DROP POLICY IF EXISTS "admin_delete_registrations" ON open_mic_registrations;
DROP POLICY IF EXISTS "operational_admin_select_registrations" ON open_mic_registrations;
DROP POLICY IF EXISTS "operational_admin_insert_registrations" ON open_mic_registrations;
DROP POLICY IF EXISTS "operational_admin_update_registrations" ON open_mic_registrations;
DROP POLICY IF EXISTS "operational_admin_delete_registrations" ON open_mic_registrations;
CREATE POLICY "operational_admin_select_registrations" ON open_mic_registrations FOR SELECT TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('open_mic_admin'));
CREATE POLICY "operational_admin_insert_registrations" ON open_mic_registrations FOR INSERT TO authenticated
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('open_mic_admin'));
CREATE POLICY "operational_admin_update_registrations" ON open_mic_registrations FOR UPDATE TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('open_mic_admin'))
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('open_mic_admin'));
CREATE POLICY "operational_admin_delete_registrations" ON open_mic_registrations FOR DELETE TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('open_mic_admin'));

DROP POLICY IF EXISTS "admin_select_event_participants" ON event_participants;
DROP POLICY IF EXISTS "admin_update_event_participants" ON event_participants;
DROP POLICY IF EXISTS "admin_delete_event_participants" ON event_participants;
DROP POLICY IF EXISTS "operational_admin_select_event_participants" ON event_participants;
DROP POLICY IF EXISTS "operational_admin_update_event_participants" ON event_participants;
DROP POLICY IF EXISTS "operational_admin_delete_event_participants" ON event_participants;
CREATE POLICY "operational_admin_select_event_participants" ON event_participants FOR SELECT TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));
CREATE POLICY "operational_admin_update_event_participants" ON event_participants FOR UPDATE TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'))
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));
CREATE POLICY "operational_admin_delete_event_participants" ON event_participants FOR DELETE TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));

DROP POLICY IF EXISTS "admin_read_ticket_orders" ON public.ticket_orders;
DROP POLICY IF EXISTS "admin_update_ticket_orders" ON public.ticket_orders;
DROP POLICY IF EXISTS "admin_delete_ticket_orders" ON public.ticket_orders;
DROP POLICY IF EXISTS "operational_admin_read_ticket_orders" ON public.ticket_orders;
DROP POLICY IF EXISTS "operational_admin_update_ticket_orders" ON public.ticket_orders;
DROP POLICY IF EXISTS "operational_admin_delete_ticket_orders" ON public.ticket_orders;
CREATE POLICY "operational_admin_read_ticket_orders" ON public.ticket_orders FOR SELECT TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));
CREATE POLICY "operational_admin_update_ticket_orders" ON public.ticket_orders FOR UPDATE TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'))
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));
CREATE POLICY "operational_admin_delete_ticket_orders" ON public.ticket_orders FOR DELETE TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));

DROP POLICY IF EXISTS "admin_select_community_applications" ON community_applications;
DROP POLICY IF EXISTS "admin_update_community_applications" ON community_applications;
DROP POLICY IF EXISTS "admin_delete_community_applications" ON community_applications;
CREATE POLICY "admin_select_community_applications" ON community_applications FOR SELECT TO authenticated USING (public.jwt_has_role('admin'));
CREATE POLICY "admin_update_community_applications" ON community_applications FOR UPDATE TO authenticated USING (public.jwt_has_role('admin')) WITH CHECK (public.jwt_has_role('admin'));
CREATE POLICY "admin_delete_community_applications" ON community_applications FOR DELETE TO authenticated USING (public.jwt_has_role('admin'));

DROP POLICY IF EXISTS "admin_manage_partners" ON public.partners;
DROP POLICY IF EXISTS "operational_admin_manage_partners" ON public.partners;
CREATE POLICY "operational_admin_manage_partners" ON public.partners FOR ALL TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'))
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));

DROP POLICY IF EXISTS "admin_manage_event_partnerships" ON public.event_partnerships;
DROP POLICY IF EXISTS "operational_admin_manage_event_partnerships" ON public.event_partnerships;
CREATE POLICY "operational_admin_manage_event_partnerships" ON public.event_partnerships FOR ALL TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'))
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('event_admin'));
