-- Restore public read grants for the public website.
-- Some deployments only applied the RLS policies but did not restore or preserve
-- the role grants needed for anon/authenticated to read public data through Supabase.

GRANT SELECT ON TABLE open_mics TO anon, authenticated;
GRANT SELECT ON TABLE events TO anon, authenticated;
GRANT SELECT ON TABLE event_tickets TO anon, authenticated;
GRANT SELECT ON TABLE site_settings TO anon, authenticated;

-- Komika public read must stay column-scoped to avoid exposing private admin-only
-- fields such as whatsapp while still restoring the missing public access.
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
  featured_order,
  status,
  published,
  created_at,
  updated_at
) ON TABLE komika TO anon;

-- Public lineup / approved participants need explicit column access in addition to
-- row-level policies.
GRANT SELECT (
  id,
  registration_id,
  open_mic_id,
  komika_id,
  stage_name,
  community,
  instagram,
  status,
  attendance_status,
  created_at,
  updated_at
) ON TABLE open_mic_registrations TO anon;

GRANT SELECT (
  id,
  event_id,
  stage_name,
  community,
  instagram,
  status,
  created_at
) ON TABLE event_participants TO anon;
