DROP POLICY IF EXISTS "public_read_approved_event_participants" ON event_participants;
CREATE POLICY "public_read_approved_event_participants" ON event_participants
  FOR SELECT TO anon
  USING (
    status = 'approved'
    AND EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_participants.event_id
        AND events.published = true
    )
  );

GRANT SELECT (id, event_id, stage_name, community, instagram, status, created_at)
  ON TABLE event_participants TO anon;