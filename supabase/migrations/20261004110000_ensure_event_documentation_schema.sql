ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS documentation_photos text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_documentation_photos_max_15'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
    ADD CONSTRAINT events_documentation_photos_max_15
    CHECK (cardinality(documentation_photos) <= 15);
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
