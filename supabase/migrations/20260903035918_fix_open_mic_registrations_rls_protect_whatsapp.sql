-- Drop old policies
DROP POLICY IF EXISTS "admin_all_registrations" ON open_mic_registrations;
DROP POLICY IF EXISTS "public_insert_registrations" ON open_mic_registrations;

-- Admin: full CRUD (authenticated only)
CREATE POLICY "admin_select_registrations" ON open_mic_registrations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_insert_registrations" ON open_mic_registrations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "admin_update_registrations" ON open_mic_registrations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "admin_delete_registrations" ON open_mic_registrations
  FOR DELETE TO authenticated USING (true);

-- Public: can read only confirmed registrations (for lineup)
CREATE POLICY "public_read_confirmed_registrations" ON open_mic_registrations
  FOR SELECT TO anon, authenticated
  USING (status = 'confirmed');

-- Public: can insert registrations (for signup)
CREATE POLICY "public_insert_registrations" ON open_mic_registrations
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Column-level: protect sensitive columns from anon
REVOKE SELECT ON open_mic_registrations FROM anon;
GRANT SELECT (id, registration_id, open_mic_id, stage_name, community, instagram, status, created_at, updated_at) ON open_mic_registrations TO anon;