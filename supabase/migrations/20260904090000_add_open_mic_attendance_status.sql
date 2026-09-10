ALTER TABLE open_mic_registrations
  ADD COLUMN IF NOT EXISTS attendance_status text NOT NULL DEFAULT 'unmarked'
  CHECK (attendance_status IN ('unmarked', 'attended', 'absent'));

CREATE INDEX IF NOT EXISTS idx_open_mic_reg_attendance_status
  ON open_mic_registrations(attendance_status);

GRANT SELECT (attendance_status) ON open_mic_registrations TO anon;
