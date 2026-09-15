DROP POLICY IF EXISTS "member_read_own_evaluations" ON evaluations;
CREATE POLICY "member_read_own_evaluations" ON evaluations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM komika k
      WHERE k.id = evaluations.performer_komika_id
        AND k.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM open_mic_registrations r
      JOIN komika k ON k.id = r.komika_id
      WHERE r.id = evaluations.performer_registration_id
        AND (k.user_id = auth.uid() OR k.id = auth.uid())
    )
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );