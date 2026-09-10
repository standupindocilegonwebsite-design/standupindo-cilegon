ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS site_name text NOT NULL DEFAULT 'Standupindo Cilegon',
  ADD COLUMN IF NOT EXISTS site_short_name text NOT NULL DEFAULT 'STANDUPINDO CILEGON',
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS brand_primary text NOT NULL DEFAULT '#2563eb',
  ADD COLUMN IF NOT EXISTS brand_hover text NOT NULL DEFAULT '#1d4ed8',
  ADD COLUMN IF NOT EXISTS brand_accent text NOT NULL DEFAULT '#f59e0b';

UPDATE site_settings
SET
  site_name = COALESCE(NULLIF(site_name, ''), 'Standupindo Cilegon'),
  site_short_name = COALESCE(NULLIF(site_short_name, ''), 'STANDUPINDO CILEGON'),
  logo_url = COALESCE(NULLIF(logo_url, ''), '/assets/images/Standupindo_CIlegon_Logo.jpeg'),
  brand_primary = COALESCE(NULLIF(brand_primary, ''), '#2563eb'),
  brand_hover = COALESCE(NULLIF(brand_hover, ''), '#1d4ed8'),
  brand_accent = COALESCE(NULLIF(brand_accent, ''), '#f59e0b')
WHERE id = 1;
