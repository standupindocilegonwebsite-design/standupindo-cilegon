DROP POLICY IF EXISTS "admin_all_komika" ON public.komika;
DROP POLICY IF EXISTS "admin_select_komika" ON public.komika;
DROP POLICY IF EXISTS "admin_insert_komika" ON public.komika;
DROP POLICY IF EXISTS "admin_update_komika" ON public.komika;
DROP POLICY IF EXISTS "admin_delete_komika" ON public.komika;
DROP POLICY IF EXISTS "member_update_own_profile" ON public.komika;

CREATE POLICY "admin_select_komika" ON public.komika FOR SELECT TO authenticated
  USING (public.jwt_has_role('admin'));
CREATE POLICY "admin_insert_komika" ON public.komika FOR INSERT TO authenticated
  WITH CHECK (public.jwt_has_role('admin'));
CREATE POLICY "admin_update_komika" ON public.komika FOR UPDATE TO authenticated
  USING (public.jwt_has_role('admin'))
  WITH CHECK (public.jwt_has_role('admin'));
CREATE POLICY "admin_delete_komika" ON public.komika FOR DELETE TO authenticated
  USING (public.jwt_has_role('admin'));
CREATE POLICY "member_update_own_profile" ON public.komika FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.prevent_member_komika_protected_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.jwt_has_role('admin') THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.full_name IS DISTINCT FROM OLD.full_name
      OR NEW.slug IS DISTINCT FROM OLD.slug
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

DROP TRIGGER IF EXISTS protect_member_komika_fields ON public.komika;
CREATE TRIGGER protect_member_komika_fields
  BEFORE UPDATE ON public.komika
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_member_komika_protected_changes();