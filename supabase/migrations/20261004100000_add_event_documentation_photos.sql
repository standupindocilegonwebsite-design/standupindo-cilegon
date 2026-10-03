ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS documentation_photos text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.events
ADD CONSTRAINT events_documentation_photos_max_15
CHECK (cardinality(documentation_photos) <= 15);
