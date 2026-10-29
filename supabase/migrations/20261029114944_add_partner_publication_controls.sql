DO $$
BEGIN
  IF to_regclass('public.partners') IS NULL OR to_regclass('public.event_partnerships') IS NULL THEN
    RAISE EXCEPTION 'Partner tables are missing; refusing to apply Partner publication controls.';
  END IF;

  IF to_regclass('public.events') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'events'
        AND column_name IN ('published', 'status')
      GROUP BY table_name
      HAVING count(*) = 2
    ) THEN
    RAISE EXCEPTION 'Required public Event fields are missing; refusing to create Partner public views.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'partners'
      AND column_name IN ('is_active', 'show_on_home', 'show_on_partnership_page')
      AND (data_type <> 'boolean' OR is_nullable <> 'NO')
  ) THEN
    RAISE EXCEPTION 'Existing Partner publication columns have an incompatible type or nullability.';
  END IF;
END;
$$;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_on_home boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_on_partnership_page boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'partners'
      AND (
        (column_name = 'is_active' AND column_default IS DISTINCT FROM 'true')
        OR (column_name IN ('show_on_home', 'show_on_partnership_page') AND column_default IS DISTINCT FROM 'false')
      )
  ) THEN
    RAISE EXCEPTION 'Partner publication column defaults are incompatible with the safe unpublished defaults.';
  END IF;
END;
$$;

CREATE VIEW public.partner_home_public WITH (security_barrier = true) AS
SELECT DISTINCT
  p.id,
  p.name,
  p.logo_url,
  p.category,
  p.sort_order
FROM public.partners p
JOIN public.event_partnerships ep ON ep.partner_id = p.id
JOIN public.events e ON e.id = ep.event_id
WHERE p.is_active = true
  AND p.show_on_home = true
  AND e.published = true
  AND e.status <> 'cancelled';

CREATE VIEW public.partner_page_public WITH (security_barrier = true) AS
SELECT
  p.id,
  p.name,
  p.logo_url,
  p.category,
  p.sort_order
FROM public.partners p
WHERE p.is_active = true
  AND p.show_on_partnership_page = true;

CREATE VIEW public.event_partner_public WITH (security_barrier = true) AS
SELECT
  ep.id AS event_partnership_id,
  ep.event_id,
  p.id,
  ep.role,
  ep.sort_order,
  ep.created_at,
  p.name,
  p.logo_url,
  p.category
FROM public.event_partnerships ep
JOIN public.partners p ON p.id = ep.partner_id
JOIN public.events e ON e.id = ep.event_id
WHERE p.is_active = true
  AND e.published = true
  AND e.status <> 'cancelled';

COMMENT ON VIEW public.partner_home_public IS
  'Public logo projection for active Home partners linked to a published, non-cancelled Event.';
COMMENT ON VIEW public.partner_page_public IS
  'Public logo projection for active partners explicitly published on the Kerja Sama page.';
COMMENT ON VIEW public.event_partner_public IS
  'Public logo projection for active partners explicitly linked to a published, non-cancelled Event.';

REVOKE ALL PRIVILEGES ON TABLE public.partners, public.event_partnerships FROM anon, PUBLIC;
REVOKE SELECT (
  id,
  name,
  logo_url,
  website_url,
  contact_name,
  contact_phone,
  notes,
  category,
  is_published,
  sort_order,
  created_at,
  updated_at,
  is_active,
  show_on_home,
  show_on_partnership_page
) ON TABLE public.partners FROM anon, PUBLIC;
REVOKE SELECT (
  id,
  event_id,
  partner_id,
  role,
  notes,
  sort_order,
  created_at,
  updated_at,
  pic_name,
  pic_phone
) ON TABLE public.event_partnerships FROM anon, PUBLIC;

REVOKE ALL PRIVILEGES ON TABLE public.partner_home_public, public.partner_page_public, public.event_partner_public FROM anon, authenticated, PUBLIC;
GRANT SELECT ON TABLE public.partner_home_public, public.partner_page_public, public.event_partner_public TO anon, authenticated;
