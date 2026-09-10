ALTER TABLE open_mics
  ADD COLUMN IF NOT EXISTS maps_url text;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS maps_url text;

UPDATE site_settings
SET
  whatsapp_admin = '6282240154499',
  instagram_url = 'https://instagram.com/standupindo_cilegon',
  tiktok_url = 'https://www.tiktok.com/@standupindo_cilegon',
  youtube_url = 'https://www.youtube.com/@standupindocilegon',
  address = 'Cilegon, Banten'
WHERE id = 1;