ALTER TABLE public.materials
  ALTER COLUMN estimated_duration DROP NOT NULL;

ALTER TABLE public.materials
  DROP CONSTRAINT IF EXISTS materials_estimated_duration_check;

ALTER TABLE public.materials
  ADD CONSTRAINT materials_estimated_duration_check
  CHECK (estimated_duration IS NULL OR estimated_duration > 0);
