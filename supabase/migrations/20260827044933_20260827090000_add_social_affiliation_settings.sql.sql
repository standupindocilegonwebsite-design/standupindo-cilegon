/*
# Add social affiliation settings and centralize WhatsApp destination

## Overview
Adds the configurable parent-organization details needed by the public Contact / Social Media page.
It also synchronizes existing event WhatsApp destinations with the official community WhatsApp setting so event ticket CTAs no longer point to the old number.

## Modified Tables
- `site_settings`
  - `affiliation_name`: public parent organization name.
  - `affiliation_website`: destination opened when the parent organization logo is clicked.
  - `affiliation_logo_url`: public logo asset used for the affiliation section.
- `events`
  - Existing `whatsapp_number` values are updated to the official community number.

## Security
- No new tables are created.
- Existing RLS policies remain in place: site settings are publicly readable and authenticated administrators can manage them; events remain publicly readable only when published.

## Important Notes
1. The affiliation fields are optional configuration values; the public page hides the section if the affiliation is not configured.
2. Phone numbers are stored as configuration only and are never rendered as public contact text on the Contact / Social Media page.
*/

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