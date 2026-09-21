CREATE TABLE IF NOT EXISTS public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  theme text NOT NULL,
  estimated_duration integer NOT NULL CHECK (estimated_duration > 0),
  content text NOT NULL,
  previous_content text,
  previous_updated_at timestamptz,
  rating integer CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  personal_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_manage_own_materials" ON public.materials;
CREATE POLICY "members_manage_own_materials"
  ON public.materials
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_materials_user_updated
  ON public.materials(user_id, updated_at DESC);
