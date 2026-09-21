-- Allow the Open Mic operational admin to manage evaluator assignments
-- without granting access to the full Admin workspace.

DROP POLICY IF EXISTS "open_mic_admin_manage_evaluator_assignments" ON evaluator_assignments;
CREATE POLICY "open_mic_admin_manage_evaluator_assignments" ON evaluator_assignments
  FOR ALL TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('open_mic_admin'))
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('open_mic_admin'));
