/*
  Keep the public lineup query limited to confirmed registrations while
  allowing it to read attendance_status for completed Open Mic archives.
*/

DROP POLICY IF EXISTS "public_read_confirmed_registrations" ON public.open_mic_registrations;

CREATE POLICY "public_read_confirmed_registrations"
  ON public.open_mic_registrations
  FOR SELECT
  TO anon, authenticated
  USING (status = 'confirmed');

GRANT SELECT (attendance_status)
  ON public.open_mic_registrations
  TO anon, authenticated;
