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

DROP POLICY IF EXISTS "public_insert_registrations" ON open_mic_registrations;
CREATE POLICY "public_insert_registrations" ON open_mic_registrations
  FOR INSERT TO anon
  WITH CHECK (
    status = 'pending'
    AND komika_id IS NULL
    AND EXISTS (
      SELECT 1 FROM open_mics
      WHERE open_mics.id = open_mic_registrations.open_mic_id
        AND open_mics.published = true
        AND open_mics.status = 'upcoming'
        AND open_mics.registration_status = 'open'
    )
  );

DROP POLICY IF EXISTS "admin_select_registrations" ON open_mic_registrations;
DROP POLICY IF EXISTS "admin_insert_registrations" ON open_mic_registrations;
DROP POLICY IF EXISTS "admin_update_registrations" ON open_mic_registrations;
DROP POLICY IF EXISTS "admin_delete_registrations" ON open_mic_registrations;
CREATE POLICY "admin_select_registrations" ON open_mic_registrations FOR SELECT TO authenticated USING (public.jwt_has_role('admin'));
CREATE POLICY "admin_insert_registrations" ON open_mic_registrations FOR INSERT TO authenticated WITH CHECK (public.jwt_has_role('admin'));
CREATE POLICY "admin_update_registrations" ON open_mic_registrations FOR UPDATE TO authenticated USING (public.jwt_has_role('admin')) WITH CHECK (public.jwt_has_role('admin'));
CREATE POLICY "admin_delete_registrations" ON open_mic_registrations FOR DELETE TO authenticated USING (public.jwt_has_role('admin'));

DROP POLICY IF EXISTS "public_read_confirmed_registrations" ON open_mic_registrations;
CREATE POLICY "public_read_confirmed_registrations" ON open_mic_registrations
  FOR SELECT TO anon
  USING (status = 'confirmed');

DROP POLICY IF EXISTS "member_read_own_open_mic_registrations" ON open_mic_registrations;
CREATE POLICY "member_read_own_open_mic_registrations" ON open_mic_registrations
  FOR SELECT TO authenticated
  USING (
    public.jwt_has_role('admin')
    OR EXISTS (
      SELECT 1 FROM komika k
      WHERE k.id = open_mic_registrations.komika_id
        AND k.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "member_insert_own_open_mic_registration" ON open_mic_registrations;
CREATE POLICY "member_insert_own_open_mic_registration" ON open_mic_registrations
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM komika k
      WHERE k.id = open_mic_registrations.komika_id
        AND k.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.prevent_member_komika_protected_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.jwt_has_role('admin') THEN
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
