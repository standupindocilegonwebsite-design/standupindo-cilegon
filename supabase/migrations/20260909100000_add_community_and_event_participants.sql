-- Public applications for joining the community and participating in events.
ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_status text NOT NULL DEFAULT 'closed' CHECK (registration_status IN ('open', 'closed'));

CREATE TABLE IF NOT EXISTS community_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  whatsapp text NOT NULL,
  instagram text,
  city text,
  interests text[] NOT NULL DEFAULT '{}',
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE community_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_applications DROP CONSTRAINT IF EXISTS community_applications_whatsapp_digits;
ALTER TABLE community_applications ADD CONSTRAINT community_applications_whatsapp_digits CHECK (whatsapp ~ '^[0-9]+$');

DROP POLICY IF EXISTS "public_insert_community_applications" ON community_applications;
CREATE POLICY "public_insert_community_applications" ON community_applications
  FOR INSERT TO anon, authenticated WITH CHECK (status = 'pending');
DROP POLICY IF EXISTS "admin_select_community_applications" ON community_applications;
CREATE POLICY "admin_select_community_applications" ON community_applications
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_update_community_applications" ON community_applications;
CREATE POLICY "admin_update_community_applications" ON community_applications
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "admin_delete_community_applications" ON community_applications;
CREATE POLICY "admin_delete_community_applications" ON community_applications
  FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS event_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id text,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  stage_name text,
  community text,
  whatsapp text NOT NULL,
  instagram text,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS registration_id text;
ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS community text;
CREATE SEQUENCE IF NOT EXISTS event_participant_reg_seq;
UPDATE event_participants SET registration_id = 'EP-' || lpad(nextval('event_participant_reg_seq')::text, 4, '0') WHERE registration_id IS NULL;
ALTER TABLE event_participants ALTER COLUMN registration_id SET DEFAULT 'EP-' || lpad(nextval('event_participant_reg_seq')::text, 4, '0');
ALTER TABLE event_participants ALTER COLUMN registration_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_participants_registration_id ON event_participants(registration_id);
UPDATE event_participants SET stage_name = '' WHERE stage_name IS NULL;
ALTER TABLE event_participants ALTER COLUMN stage_name SET NOT NULL;
ALTER TABLE event_participants DROP CONSTRAINT IF EXISTS event_participants_whatsapp_digits;
ALTER TABLE event_participants ADD CONSTRAINT event_participants_whatsapp_digits CHECK (whatsapp ~ '^[0-9]+$');

DROP POLICY IF EXISTS "public_insert_event_participants" ON event_participants;
CREATE POLICY "public_insert_event_participants" ON event_participants
  FOR INSERT TO anon, authenticated WITH CHECK (status = 'pending');
DROP POLICY IF EXISTS "admin_select_event_participants" ON event_participants;
CREATE POLICY "admin_select_event_participants" ON event_participants
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_update_event_participants" ON event_participants;
CREATE POLICY "admin_update_event_participants" ON event_participants
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "admin_delete_event_participants" ON event_participants;
CREATE POLICY "admin_delete_event_participants" ON event_participants
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_community_applications_status ON community_applications(status);
CREATE INDEX IF NOT EXISTS idx_event_participants_event_id ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_status ON event_participants(status);

-- Tighten the existing public Open Mic insert path: public requests can only
-- create pending registrations for currently published, open Open Mics.
DROP POLICY IF EXISTS "public_insert_registrations" ON open_mic_registrations;
CREATE POLICY "public_insert_registrations" ON open_mic_registrations
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM open_mics
      WHERE open_mics.id = open_mic_registrations.open_mic_id
        AND open_mics.published = true
        AND open_mics.status = 'upcoming'
        AND open_mics.registration_status = 'open'
    )
  );
