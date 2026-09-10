ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS whatsapp_admin_name text,
  ADD COLUMN IF NOT EXISTS whatsapp_registration_name text,
  ADD COLUMN IF NOT EXISTS whatsapp_partnership_name text,
  ADD COLUMN IF NOT EXISTS whatsapp_ticket_name text;
