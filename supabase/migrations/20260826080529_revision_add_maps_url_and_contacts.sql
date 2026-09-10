/*
# Revision: Add maps_url + update contact info

## Overview
1. Adds `maps_url` text column to `open_mics` and `events` tables for clickable
   location links (Google Maps / native Maps app). Nullable — old rows simply
   have no map link until an admin fills it in.
2. Updates `site_settings` with the real Standup Indo Cilegon contact info:
   WhatsApp 082240154499 (stored as 6282240154499 for wa.me), Instagram
   @standupind_cilegon, TikTok @standupind_cilegon, YouTube @standupindocilegon.

## Security
- No RLS / policy changes. Existing policies cover the new nullable column
  (SELECT is already public for published rows; authenticated admin has full
  CRUD via the existing `admin_all_*` FOR ALL policies).
*/

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
