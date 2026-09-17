CREATE UNIQUE INDEX IF NOT EXISTS uq_open_mic_registrations_active_member
  ON open_mic_registrations (open_mic_id, komika_id)
  WHERE komika_id IS NOT NULL
    AND status IN ('pending', 'confirmed');
