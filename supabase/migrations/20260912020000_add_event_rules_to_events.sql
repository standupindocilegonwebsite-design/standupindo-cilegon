-- Add editable event rules / peraturan column for public event detail pages.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_rules text;
