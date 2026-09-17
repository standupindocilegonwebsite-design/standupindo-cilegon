CREATE TABLE IF NOT EXISTS member_notification_reads (
  user_id uuid NOT NULL,
  notification_key text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_key)
);

ALTER TABLE member_notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_manage_own_notification_reads" ON member_notification_reads;
CREATE POLICY "member_manage_own_notification_reads" ON member_notification_reads
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
