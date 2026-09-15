ALTER TABLE event_participants
  ADD COLUMN IF NOT EXISTS komika_id uuid REFERENCES komika(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_event_participants_komika_id
  ON event_participants(komika_id);

DROP POLICY IF EXISTS "member_read_own_open_mic_registrations" ON open_mic_registrations;
DROP POLICY IF EXISTS "admin_select_registrations" ON open_mic_registrations;
DROP POLICY IF EXISTS "admin_insert_registrations" ON open_mic_registrations;
DROP POLICY IF EXISTS "admin_update_registrations" ON open_mic_registrations;
DROP POLICY IF EXISTS "admin_delete_registrations" ON open_mic_registrations;
CREATE POLICY "admin_select_registrations" ON open_mic_registrations
  FOR SELECT TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_insert_registrations" ON open_mic_registrations
  FOR INSERT TO authenticated WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_update_registrations" ON open_mic_registrations
  FOR UPDATE TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_delete_registrations" ON open_mic_registrations
  FOR DELETE TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "member_read_own_open_mic_registrations" ON open_mic_registrations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM komika k
      WHERE k.id = open_mic_registrations.komika_id
        AND k.user_id = auth.uid()
    )
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "member_insert_own_open_mic_registration" ON open_mic_registrations;
CREATE POLICY "member_insert_own_open_mic_registration" ON open_mic_registrations
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM komika k
      WHERE k.id = open_mic_registrations.komika_id
        AND k.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "member_read_own_event_participants" ON event_participants;
DROP POLICY IF EXISTS "admin_select_event_participants" ON event_participants;
DROP POLICY IF EXISTS "admin_update_event_participants" ON event_participants;
DROP POLICY IF EXISTS "admin_delete_event_participants" ON event_participants;
CREATE POLICY "admin_select_event_participants" ON event_participants
  FOR SELECT TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_update_event_participants" ON event_participants
  FOR UPDATE TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_delete_event_participants" ON event_participants
  FOR DELETE TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "member_read_own_event_participants" ON event_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM komika k
      WHERE k.id = event_participants.komika_id
        AND k.user_id = auth.uid()
    )
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "member_update_own_profile" ON komika;
CREATE POLICY "member_update_own_profile" ON komika
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
