-- Admin CRUD must be role-gated. Never trust the frontend route or hidden controls.
DROP POLICY IF EXISTS "admin_all_open_mics" ON open_mics;
DROP POLICY IF EXISTS "admin_all_events" ON events;
DROP POLICY IF EXISTS "admin_all_event_tickets" ON event_tickets;
DROP POLICY IF EXISTS "admin_all_komika" ON komika;
DROP POLICY IF EXISTS "admin_all_site_settings" ON site_settings;
DROP POLICY IF EXISTS "admin_insert_event_tickets" ON event_tickets;
DROP POLICY IF EXISTS "admin_update_event_tickets" ON event_tickets;
DROP POLICY IF EXISTS "admin_delete_event_tickets" ON event_tickets;

CREATE POLICY "admin_select_open_mics" ON open_mics FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_insert_open_mics" ON open_mics FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_update_open_mics" ON open_mics FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_delete_open_mics" ON open_mics FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admin_select_events" ON events FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_insert_events" ON events FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_update_events" ON events FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_delete_events" ON events FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admin_select_event_tickets" ON event_tickets FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_insert_event_tickets" ON event_tickets FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_update_event_tickets" ON event_tickets FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_delete_event_tickets" ON event_tickets FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admin_select_komika" ON komika FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_insert_komika" ON komika FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_update_komika" ON komika FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_delete_komika" ON komika FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admin_select_site_settings" ON site_settings FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_update_site_settings" ON site_settings FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE OR REPLACE FUNCTION public.prevent_member_komika_protected_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.full_name IS DISTINCT FROM OLD.full_name
      OR NEW.slug IS DISTINCT FROM OLD.slug
      OR NEW.specialties IS DISTINCT FROM OLD.specialties
      OR NEW.joined_at IS DISTINCT FROM OLD.joined_at
      OR NEW.featured_order IS DISTINCT FROM OLD.featured_order
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.published IS DISTINCT FROM OLD.published
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Member hanya dapat mengubah data profil publik yang diizinkan';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_member_komika_fields ON komika;
CREATE TRIGGER protect_member_komika_fields
  BEFORE UPDATE ON komika
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_member_komika_protected_changes();
