CREATE TABLE IF NOT EXISTS public.annual_recaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year smallint NOT NULL UNIQUE,
  published boolean NOT NULL DEFAULT false,
  closing_narrative text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.annual_recaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_published_annual_recaps" ON public.annual_recaps;
CREATE POLICY "public_select_published_annual_recaps"
ON public.annual_recaps
FOR SELECT
TO anon, authenticated
USING (published = true);

DROP POLICY IF EXISTS "admin_select_all_annual_recaps" ON public.annual_recaps;
CREATE POLICY "admin_select_all_annual_recaps"
ON public.annual_recaps
FOR SELECT
TO authenticated
USING (public.jwt_has_role('admin'));

DROP POLICY IF EXISTS "annual_recaps_select_visibility_guard" ON public.annual_recaps;
CREATE POLICY "annual_recaps_select_visibility_guard"
ON public.annual_recaps
AS RESTRICTIVE
FOR SELECT
TO anon, authenticated
USING (published = true OR public.jwt_has_role('admin'));

DROP POLICY IF EXISTS "admin_manage_annual_recaps" ON public.annual_recaps;
CREATE POLICY "admin_manage_annual_recaps"
ON public.annual_recaps
FOR INSERT
TO authenticated
WITH CHECK (public.jwt_has_role('admin'));

DROP POLICY IF EXISTS "annual_recaps_insert_admin_guard" ON public.annual_recaps;
CREATE POLICY "annual_recaps_insert_admin_guard"
ON public.annual_recaps
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (public.jwt_has_role('admin'));

DROP POLICY IF EXISTS "admin_manage_annual_recaps_update" ON public.annual_recaps;
CREATE POLICY "admin_manage_annual_recaps_update"
ON public.annual_recaps
FOR UPDATE
TO authenticated
USING (public.jwt_has_role('admin'))
WITH CHECK (public.jwt_has_role('admin'));

DROP POLICY IF EXISTS "annual_recaps_update_admin_guard" ON public.annual_recaps;
CREATE POLICY "annual_recaps_update_admin_guard"
ON public.annual_recaps
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (public.jwt_has_role('admin'))
WITH CHECK (public.jwt_has_role('admin'));

DROP POLICY IF EXISTS "admin_manage_annual_recaps_delete" ON public.annual_recaps;
CREATE POLICY "admin_manage_annual_recaps_delete"
ON public.annual_recaps
FOR DELETE
TO authenticated
USING (public.jwt_has_role('admin'));

DROP POLICY IF EXISTS "annual_recaps_delete_admin_guard" ON public.annual_recaps;
CREATE POLICY "annual_recaps_delete_admin_guard"
ON public.annual_recaps
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (public.jwt_has_role('admin'));

REVOKE ALL ON TABLE public.annual_recaps FROM PUBLIC;
REVOKE ALL ON TABLE public.annual_recaps FROM anon;
REVOKE ALL ON TABLE public.annual_recaps FROM authenticated;
GRANT SELECT ON TABLE public.annual_recaps TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.annual_recaps TO authenticated;

NOTIFY pgrst, 'reload schema';
