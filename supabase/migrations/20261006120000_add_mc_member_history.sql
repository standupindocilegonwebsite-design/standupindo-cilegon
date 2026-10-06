ALTER TABLE public.member_open_mic_history_submissions
  ADD COLUMN IF NOT EXISTS activity_type text NOT NULL DEFAULT 'performance',
  ADD COLUMN IF NOT EXISTS internal_open_mic_id uuid,
  ADD COLUMN IF NOT EXISTS event_time text;

ALTER TABLE public.member_open_mic_history_submissions
  DROP CONSTRAINT IF EXISTS member_open_mic_history_submissions_internal_open_mic_id_fkey;
ALTER TABLE public.member_open_mic_history_submissions
  ADD CONSTRAINT member_open_mic_history_submissions_internal_open_mic_id_fkey
  FOREIGN KEY (internal_open_mic_id) REFERENCES public.open_mics(id) ON DELETE SET NULL;

ALTER TABLE public.member_open_mic_history_submissions
  DROP CONSTRAINT IF EXISTS member_open_mic_history_activity_type_check;
ALTER TABLE public.member_open_mic_history_submissions
  ADD CONSTRAINT member_open_mic_history_activity_type_check
  CHECK (activity_type IN ('performance', 'mc_internal', 'mc_external'));

DROP INDEX IF EXISTS public.uq_member_open_mic_history_duplicate;
CREATE UNIQUE INDEX uq_member_open_mic_history_duplicate
  ON public.member_open_mic_history_submissions (
    user_id,
    activity_type,
    lower(trim(title)),
    event_date,
    lower(trim(venue))
  )
  WHERE activity_type <> 'mc_internal';

CREATE UNIQUE INDEX IF NOT EXISTS uq_member_mc_internal_open_mic
  ON public.member_open_mic_history_submissions (user_id, internal_open_mic_id)
  WHERE activity_type = 'mc_internal';

CREATE OR REPLACE FUNCTION public.prepare_member_mc_history_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  selected_open_mic public.open_mics%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE'
    AND auth.uid() = OLD.user_id
    AND (
      NEW.activity_type IS DISTINCT FROM OLD.activity_type
      OR NEW.internal_open_mic_id IS DISTINCT FROM OLD.internal_open_mic_id
    ) THEN
    RAISE EXCEPTION 'Jenis riwayat dan Open Mic internal tidak dapat diubah setelah pengajuan';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.activity_type = 'mc_internal'
    AND NEW.activity_type = 'mc_internal'
    AND OLD.internal_open_mic_id IS NOT NULL
    AND NEW.internal_open_mic_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.activity_type = 'mc_internal' THEN
    IF NEW.internal_open_mic_id IS NULL THEN
      RAISE EXCEPTION 'Pilih Open Mic internal untuk pengajuan MC';
    END IF;

    SELECT * INTO selected_open_mic
    FROM public.open_mics
    WHERE id = NEW.internal_open_mic_id
      AND status <> 'cancelled'
      AND (status = 'completed' OR date < (now() AT TIME ZONE 'Asia/Jakarta')::date);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Open Mic internal belum selesai atau tidak ditemukan';
    END IF;

    NEW.title := selected_open_mic.title;
    NEW.organizer_name := 'Standupindo Cilegon';
    NEW.event_date := selected_open_mic.date;
    NEW.event_time := selected_open_mic.time;
    NEW.venue := selected_open_mic.venue;
    NEW.city := selected_open_mic.location;
    NEW.proof_url := NULL;
  ELSIF NEW.activity_type = 'mc_external' THEN
    IF nullif(trim(NEW.title), '') IS NULL
      OR nullif(trim(NEW.organizer_name), '') IS NULL
      OR NEW.event_date IS NULL
      OR nullif(trim(NEW.venue), '') IS NULL
      OR nullif(trim(NEW.proof_url), '') IS NULL THEN
      RAISE EXCEPTION 'Data MC eksternal dan bukti dokumentasi wajib diisi';
    END IF;
    NEW.internal_open_mic_id := NULL;
  ELSIF NEW.activity_type = 'performance' THEN
    NEW.internal_open_mic_id := NULL;
  ELSE
    RAISE EXCEPTION 'Jenis aktivitas riwayat tidak valid';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepare_member_mc_history_submission
  ON public.member_open_mic_history_submissions;
CREATE TRIGGER prepare_member_mc_history_submission
  BEFORE INSERT OR UPDATE OF activity_type, internal_open_mic_id, title, organizer_name, event_date, event_time, venue, city, proof_url
  ON public.member_open_mic_history_submissions
  FOR EACH ROW EXECUTE FUNCTION public.prepare_member_mc_history_submission();

REVOKE ALL ON FUNCTION public.prepare_member_mc_history_submission() FROM PUBLIC, anon, authenticated;
