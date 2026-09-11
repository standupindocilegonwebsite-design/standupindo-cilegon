-- Create partner master data and event-specific partnership history.

CREATE TABLE IF NOT EXISTS public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  website_url text,
  contact_name text,
  contact_phone text,
  notes text,
  category text NOT NULL CHECK (category IN ('sponsor', 'support', 'media_partner')),
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_partnerships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('sponsor', 'support', 'media_partner')),
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_partners_updated_at ON public.partners;
CREATE TRIGGER set_partners_updated_at
BEFORE UPDATE ON public.partners
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_event_partnerships_updated_at ON public.event_partnerships;
CREATE TRIGGER set_event_partnerships_updated_at
BEFORE UPDATE ON public.event_partnerships
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_partners_category_published
ON public.partners(category, is_published, sort_order);

CREATE INDEX IF NOT EXISTS idx_partners_published
ON public.partners(is_published);

CREATE INDEX IF NOT EXISTS idx_event_partnerships_event_id
ON public.event_partnerships(event_id);

CREATE INDEX IF NOT EXISTS idx_event_partnerships_partner_id
ON public.event_partnerships(partner_id);

CREATE INDEX IF NOT EXISTS idx_event_partnerships_role
ON public.event_partnerships(role);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_partnerships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_published_partners" ON public.partners;
CREATE POLICY "public_read_published_partners"
ON public.partners
FOR SELECT
TO anon
USING (is_published = true);

DROP POLICY IF EXISTS "admin_manage_partners" ON public.partners;
CREATE POLICY "admin_manage_partners"
ON public.partners
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "public_read_event_partnerships" ON public.event_partnerships;
CREATE POLICY "public_read_event_partnerships"
ON public.event_partnerships
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.partners p
    WHERE p.id = event_partnerships.partner_id
      AND p.is_published = true
  )
);

DROP POLICY IF EXISTS "admin_manage_event_partnerships" ON public.event_partnerships;
CREATE POLICY "admin_manage_event_partnerships"
ON public.event_partnerships
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

GRANT SELECT (
  id,
  name,
  logo_url,
  website_url,
  category,
  is_published,
  sort_order,
  created_at,
  updated_at
) ON public.partners TO anon;

GRANT SELECT ON TABLE public.partners TO authenticated;

GRANT SELECT (
  id,
  event_id,
  partner_id,
  role,
  sort_order,
  created_at,
  updated_at
) ON public.event_partnerships TO anon;

GRANT SELECT ON TABLE public.event_partnerships TO authenticated;
