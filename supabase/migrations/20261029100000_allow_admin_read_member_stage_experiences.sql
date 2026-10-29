DROP POLICY IF EXISTS "admin_read_member_stage_experiences"
  ON public.member_stage_experiences;

CREATE POLICY "admin_read_member_stage_experiences"
  ON public.member_stage_experiences
  FOR SELECT TO authenticated
  USING (public.jwt_has_role('admin'));
