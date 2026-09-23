DROP POLICY IF EXISTS "member_delete_rejected_open_mic_history" ON member_open_mic_history_submissions;
CREATE POLICY "member_delete_rejected_open_mic_history"
  ON member_open_mic_history_submissions
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND status = 'rejected'
  );
