DROP POLICY IF EXISTS "evaluator_manage_own_evaluations" ON evaluations;
CREATE POLICY "evaluator_manage_own_evaluations" ON evaluations
  FOR INSERT TO authenticated
  WITH CHECK (
    evaluator_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM evaluator_assignments ea
      WHERE (ea.open_mic_id = evaluations.open_mic_id OR ea.open_mic_id IS NULL)
        AND ea.evaluator_user_id = auth.uid()
        AND ea.status = 'active'
    )
    AND EXISTS (
      SELECT 1
      FROM open_mic_registrations r
      WHERE r.id = evaluations.performer_registration_id
        AND r.open_mic_id = evaluations.open_mic_id
    )
  );

DROP POLICY IF EXISTS "evaluator_update_own_evaluations" ON evaluations;
CREATE POLICY "evaluator_update_own_evaluations" ON evaluations
  FOR UPDATE TO authenticated
  USING (
    evaluator_user_id = auth.uid()
    AND evaluations.status = 'draft'
    AND EXISTS (
      SELECT 1
      FROM evaluator_assignments ea
      WHERE (ea.open_mic_id = evaluations.open_mic_id OR ea.open_mic_id IS NULL)
        AND ea.evaluator_user_id = auth.uid()
        AND ea.status = 'active'
    )
  )
  WITH CHECK (
    evaluator_user_id = auth.uid()
    AND evaluations.status = 'draft'
    AND EXISTS (
      SELECT 1
      FROM evaluator_assignments ea
      WHERE (ea.open_mic_id = evaluations.open_mic_id OR ea.open_mic_id IS NULL)
        AND ea.evaluator_user_id = auth.uid()
        AND ea.status = 'active'
    )
  );