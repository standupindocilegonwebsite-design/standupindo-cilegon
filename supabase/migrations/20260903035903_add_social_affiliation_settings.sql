ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS affiliation_name text,
  ADD COLUMN IF NOT EXISTS affiliation_website text,
  ADD COLUMN IF NOT EXISTS affiliation_logo_url text;

UPDATE site_settings
SET
  whatsapp_admin = '082240154499',
  affiliation_name = 'Standup Indo',
  affiliation_website = 'https://standupindo.id/',
  affiliation_logo_url = '/assets/images/image.png'
WHERE id = 1;

UPDATE events
SET whatsapp_number = '082240154499'
WHERE whatsapp_number IS DISTINCT FROM '082240154499';