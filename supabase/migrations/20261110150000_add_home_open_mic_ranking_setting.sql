ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS home_open_mic_ranking_enabled boolean NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
