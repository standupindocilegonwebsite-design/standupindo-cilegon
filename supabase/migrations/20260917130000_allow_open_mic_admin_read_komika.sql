DROP POLICY IF EXISTS "operational_admin_select_komika" ON komika;
CREATE POLICY "operational_admin_select_komika" ON komika
  FOR SELECT TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('open_mic_admin'));
