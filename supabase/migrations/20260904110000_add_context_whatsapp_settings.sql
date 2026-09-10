ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS whatsapp_registration text,
  ADD COLUMN IF NOT EXISTS whatsapp_partnership text,
  ADD COLUMN IF NOT EXISTS whatsapp_ticket text;

UPDATE site_settings
SET
  whatsapp_registration = COALESCE(NULLIF(whatsapp_registration, ''), whatsapp_admin),
  whatsapp_partnership = COALESCE(NULLIF(whatsapp_partnership, ''), whatsapp_admin),
  whatsapp_ticket = COALESCE(NULLIF(whatsapp_ticket, ''), whatsapp_admin)
WHERE id = 1;
