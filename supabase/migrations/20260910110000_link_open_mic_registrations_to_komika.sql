ALTER TABLE open_mic_registrations
  ADD COLUMN IF NOT EXISTS komika_id uuid REFERENCES komika(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_open_mic_registrations_komika_id
  ON open_mic_registrations(komika_id);

DROP POLICY IF EXISTS "public_insert_registrations" ON open_mic_registrations;
CREATE POLICY "public_insert_registrations" ON open_mic_registrations
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND komika_id IS NULL
    AND EXISTS (
      SELECT 1 FROM open_mics
      WHERE open_mics.id = open_mic_registrations.open_mic_id
        AND open_mics.published = true
        AND open_mics.status = 'upcoming'
        AND open_mics.registration_status = 'open'
    )
  );
