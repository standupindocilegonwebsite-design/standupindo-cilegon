CREATE TABLE IF NOT EXISTS public.material_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.material_nodes(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'Ide',
  title text NOT NULL,
  content text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.material_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_manage_own_material_nodes" ON public.material_nodes;
CREATE POLICY "members_manage_own_material_nodes"
  ON public.material_nodes
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.materials
    WHERE materials.id = material_nodes.material_id
      AND materials.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.materials
    WHERE materials.id = material_nodes.material_id
      AND materials.user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_material_nodes_material_parent
  ON public.material_nodes(material_id, parent_id, sort_order);
