CREATE TABLE IF NOT EXISTS evaluator_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  open_mic_id uuid NOT NULL REFERENCES open_mics(id) ON DELETE CASCADE,
  evaluator_user_id uuid NOT NULL,
  assigned_by uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evaluator_assignments_open_mic_id
  ON evaluator_assignments(open_mic_id);
CREATE INDEX IF NOT EXISTS idx_evaluator_assignments_evaluator_user_id
  ON evaluator_assignments(evaluator_user_id);

CREATE TABLE IF NOT EXISTS evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  open_mic_id uuid NOT NULL REFERENCES open_mics(id) ON DELETE CASCADE,
  evaluator_user_id uuid NOT NULL,
  performer_registration_id uuid NOT NULL REFERENCES open_mic_registrations(id) ON DELETE CASCADE,
  performer_komika_id uuid REFERENCES komika(id) ON DELETE SET NULL,
  material_score numeric(3,1) CHECK (material_score BETWEEN 0 AND 10),
  punchline_score numeric(3,1) CHECK (punchline_score BETWEEN 0 AND 10),
  delivery_score numeric(3,1) CHECK (delivery_score BETWEEN 0 AND 10),
  timing_score numeric(3,1) CHECK (timing_score BETWEEN 0 AND 10),
  stage_presence_score numeric(3,1) CHECK (stage_presence_score BETWEEN 0 AND 10),
  crowd_interaction_score numeric(3,1) CHECK (crowd_interaction_score BETWEEN 0 AND 10),
  strengths text,
  improvements text,
  notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE komika ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS idx_komika_user_id ON komika(user_id);

CREATE INDEX IF NOT EXISTS idx_evaluations_open_mic_id
  ON evaluations(open_mic_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_evaluator_user_id
  ON evaluations(evaluator_user_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_performer_registration_id
  ON evaluations(performer_registration_id);

ALTER TABLE evaluator_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_evaluator_assignments" ON evaluator_assignments;
CREATE POLICY "admin_all_evaluator_assignments" ON evaluator_assignments
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "evaluator_read_own_assignments" ON evaluator_assignments;
CREATE POLICY "evaluator_read_own_assignments" ON evaluator_assignments
  FOR SELECT TO authenticated
  USING (evaluator_user_id = auth.uid() OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "admin_all_evaluations" ON evaluations;
CREATE POLICY "admin_all_evaluations" ON evaluations
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "evaluator_manage_own_evaluations" ON evaluations;
CREATE POLICY "evaluator_manage_own_evaluations" ON evaluations
  FOR INSERT TO authenticated
  WITH CHECK (
    evaluator_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM evaluator_assignments ea
      WHERE ea.open_mic_id = evaluations.open_mic_id
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

CREATE POLICY "evaluator_update_own_evaluations" ON evaluations
  FOR UPDATE TO authenticated
  USING (
    evaluator_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM evaluator_assignments ea
      WHERE ea.open_mic_id = evaluations.open_mic_id
        AND ea.evaluator_user_id = auth.uid()
        AND ea.status = 'active'
    )
  )
  WITH CHECK (
    evaluator_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM evaluator_assignments ea
      WHERE ea.open_mic_id = evaluations.open_mic_id
        AND ea.evaluator_user_id = auth.uid()
        AND ea.status = 'active'
    )
  );

CREATE POLICY "evaluator_read_own_evaluations" ON evaluations
  FOR SELECT TO authenticated
  USING (
    evaluator_user_id = auth.uid()
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "member_read_own_evaluations" ON evaluations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM open_mic_registrations r
      JOIN komika k ON k.id = r.komika_id
      WHERE r.id = evaluations.performer_registration_id
        AND (k.user_id = auth.uid() OR k.id = auth.uid())
    )
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
