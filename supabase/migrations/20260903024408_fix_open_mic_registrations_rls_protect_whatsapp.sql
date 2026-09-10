/*
# Fix open_mic_registrations RLS: public lineup + protect sensitive columns

1. Problem:
- No public SELECT policy for anon on open_mic_registrations → public lineup query returns nothing.
- Sensitive columns (whatsapp, full_name, notes) are readable by anyone via the data API.

2. Changes:
- Replace the overly broad admin_all_registrations (FOR ALL) with 4 verb-specific policies for authenticated.
- Add public SELECT policy for confirmed registrations only (lineup display).
- Keep public INSERT for registration signup.
- Revoke table-level SELECT from anon, grant column-level SELECT excluding whatsapp, full_name, notes.

3. Security:
- anon can only SELECT safe columns (id, registration_id, open_mic_id, stage_name, community, instagram, status, created_at, updated_at) of confirmed rows.
- anon cannot SELECT whatsapp, full_name, or notes — these are private registrant data.
- authenticated (admin) retains full access to all rows and columns.
*/

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
