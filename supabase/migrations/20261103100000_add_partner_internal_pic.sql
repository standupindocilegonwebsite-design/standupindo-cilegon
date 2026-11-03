ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS internal_pic_komika_id uuid REFERENCES public.komika(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS internal_pic_name text;

CREATE INDEX IF NOT EXISTS idx_partners_internal_pic_komika_id
  ON public.partners(internal_pic_komika_id);
