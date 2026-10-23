UPDATE public.event_lineups AS lineup
SET
  komika_id = member.id,
  performer_name = member.stage_name,
  updated_at = now()
FROM public.komika AS member
JOIN public.events AS event ON event.published = true
WHERE lineup.event_id = event.id
  AND lineup.komika_id IS NULL
  AND lower(trim(lineup.performer_name)) = 'adnan'
  AND lineup.role_category = 'opener'
  AND lower(trim(member.stage_name)) = 'adnan faidh'
  AND member.published = true
  AND member.status = 'active'
  AND event.date = DATE '2025-08-02'
  AND lower(trim(event.title)) = 'grand final recomic 5'
  AND NOT EXISTS (
    SELECT 1
    FROM public.event_lineups AS existing
    WHERE existing.event_id = lineup.event_id
      AND existing.komika_id = member.id
      AND existing.id <> lineup.id
  );
