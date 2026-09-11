-- Add PIC fields for partner-event relationships so admin can store who the contact is per event.

ALTER TABLE public.event_partnerships
  ADD COLUMN IF NOT EXISTS pic_name text,
  ADD COLUMN IF NOT EXISTS pic_phone text;
