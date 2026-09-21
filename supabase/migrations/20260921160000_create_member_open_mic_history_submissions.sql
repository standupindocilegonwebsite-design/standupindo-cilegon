CREATE TABLE IF NOT EXISTS member_open_mic_history_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  komika_id uuid NOT NULL REFERENCES komika(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 2 AND 160),
  organizer_name text NOT NULL CHECK (char_length(trim(organizer_name)) BETWEEN 2 AND 160),
  event_date date NOT NULL,
  venue text NOT NULL CHECK (char_length(trim(venue)) BETWEEN 2 AND 160),
  city text,
  notes text,
  proof_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_open_mic_history_review_fields_consistent
    CHECK ((status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR status IN ('approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_member_open_mic_history_user_id
  ON member_open_mic_history_submissions(user_id);

CREATE INDEX IF NOT EXISTS idx_member_open_mic_history_komika_id
  ON member_open_mic_history_submissions(komika_id);

CREATE INDEX IF NOT EXISTS idx_member_open_mic_history_status
  ON member_open_mic_history_submissions(status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_member_open_mic_history_duplicate
  ON member_open_mic_history_submissions (
    user_id,
    lower(trim(title)),
    event_date,
    lower(trim(venue))
  );

ALTER TABLE member_open_mic_history_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_read_own_open_mic_history" ON member_open_mic_history_submissions;
CREATE POLICY "member_read_own_open_mic_history"
  ON member_open_mic_history_submissions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.jwt_has_role('admin')
    OR public.jwt_has_role('open_mic_admin')
  );

DROP POLICY IF EXISTS "member_insert_own_open_mic_history" ON member_open_mic_history_submissions;
CREATE POLICY "member_insert_own_open_mic_history"
  ON member_open_mic_history_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM komika
      WHERE komika.id = member_open_mic_history_submissions.komika_id
        AND komika.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "member_update_pending_open_mic_history" ON member_open_mic_history_submissions;
CREATE POLICY "member_update_pending_open_mic_history"
  ON member_open_mic_history_submissions
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM komika
      WHERE komika.id = member_open_mic_history_submissions.komika_id
        AND komika.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_manage_open_mic_history" ON member_open_mic_history_submissions;
CREATE POLICY "admin_manage_open_mic_history"
  ON member_open_mic_history_submissions
  FOR ALL TO authenticated
  USING (public.jwt_has_role('admin') OR public.jwt_has_role('open_mic_admin'))
  WITH CHECK (public.jwt_has_role('admin') OR public.jwt_has_role('open_mic_admin'));
