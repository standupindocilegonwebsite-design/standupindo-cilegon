ALTER TABLE komika
  ADD COLUMN IF NOT EXISTS full_name text;

UPDATE komika
SET full_name = stage_name
WHERE full_name IS NULL OR btrim(full_name) = '';

ALTER TABLE komika
  ALTER COLUMN full_name SET NOT NULL;

ALTER TABLE komika
  ADD COLUMN IF NOT EXISTS whatsapp text;

REVOKE SELECT ON TABLE komika FROM anon;

GRANT SELECT (
  id,
  full_name,
  stage_name,
  slug,
  photo,
  bio,
  instagram_url,
  tiktok_url,
  youtube_url,
  specialties,
  joined_at,
  status,
  published,
  created_at,
  updated_at
) ON TABLE komika TO anon;
