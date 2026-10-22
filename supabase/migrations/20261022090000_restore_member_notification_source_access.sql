DROP POLICY IF EXISTS "member_read_own_profile" ON public.komika;
CREATE POLICY "member_read_own_profile" ON public.komika
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "member_read_own_open_mic_registrations" ON public.open_mic_registrations;
CREATE POLICY "member_read_own_open_mic_registrations" ON public.open_mic_registrations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.komika k
      WHERE k.id = open_mic_registrations.komika_id
        AND k.user_id = auth.uid()
    )
  );

ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS komika_id uuid REFERENCES public.komika(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_event_participants_komika_id
  ON public.event_participants(komika_id);

DROP POLICY IF EXISTS "member_read_own_event_participants" ON public.event_participants;
CREATE POLICY "member_read_own_event_participants" ON public.event_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.komika k
      WHERE k.id = event_participants.komika_id
        AND k.user_id = auth.uid()
    )
  );
