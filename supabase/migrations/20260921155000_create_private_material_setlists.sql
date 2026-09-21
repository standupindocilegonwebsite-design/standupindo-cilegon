CREATE TABLE IF NOT EXISTS public.material_setlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.material_setlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setlist_id uuid NOT NULL REFERENCES public.material_setlists(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (setlist_id, material_id)
);

ALTER TABLE public.material_setlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_setlist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_manage_own_material_setlists" ON public.material_setlists;
CREATE POLICY "members_manage_own_material_setlists"
  ON public.material_setlists
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "members_manage_own_material_setlist_items" ON public.material_setlist_items;
CREATE POLICY "members_manage_own_material_setlist_items"
  ON public.material_setlist_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.material_setlists
      WHERE material_setlists.id = material_setlist_items.setlist_id
        AND material_setlists.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.materials
      WHERE materials.id = material_setlist_items.material_id
        AND materials.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.material_setlists
      WHERE material_setlists.id = material_setlist_items.setlist_id
        AND material_setlists.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.materials
      WHERE materials.id = material_setlist_items.material_id
        AND materials.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_material_setlists_user_updated
  ON public.material_setlists(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_material_setlist_items_setlist_order
  ON public.material_setlist_items(setlist_id, sort_order);
