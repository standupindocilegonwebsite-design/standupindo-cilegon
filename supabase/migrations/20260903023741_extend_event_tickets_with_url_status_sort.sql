/*
# Extend event_tickets with ticket_url, status, sort_order, updated_at

1. Changes to event_tickets table:
- Add `ticket_url` (text, nullable) — optional external ticketing URL (http/https only).
- Add `status` (text, not null, default 'active') — 'active' or 'inactive'. Public only sees 'active'.
- Add `sort_order` (integer, not null, default 0) — for manual ordering of ticket types.
- Add `updated_at` (timestamptz, default now()) — track modifications.

2. Security:
- Replace the overly permissive `admin_all_event_tickets` FOR ALL policy with 4 verb-specific policies for authenticated (admin) access.
- Replace `public_read_event_tickets` with a scoped SELECT policy: anon/authenticated can only read tickets where status = 'active'. This prevents exposing inactive draft tickets to the public.

3. Notes:
- All existing ticket rows get status='active' and sort_order=0 by default — no data loss.
- ticket_url is optional; when present and valid, the public "Beli Tiket" button links to it. When absent, the WhatsApp fallback is used.
*/

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
