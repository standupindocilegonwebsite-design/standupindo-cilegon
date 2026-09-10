ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS ticket_url text;
ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Drop old policies
DROP POLICY IF EXISTS "public_read_event_tickets" ON event_tickets;
DROP POLICY IF EXISTS "admin_all_event_tickets" ON event_tickets;

-- Public: only read active tickets
CREATE POLICY "public_read_active_event_tickets" ON event_tickets
  FOR SELECT TO anon, authenticated
  USING (status = 'active');

-- Admin: full CRUD (authenticated only)
CREATE POLICY "admin_insert_event_tickets" ON event_tickets
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "admin_update_event_tickets" ON event_tickets
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "admin_delete_event_tickets" ON event_tickets
  FOR DELETE TO authenticated USING (true);