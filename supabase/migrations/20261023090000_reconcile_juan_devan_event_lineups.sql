UPDATE public.event_lineups AS lineup
SET
  komika_id = member.id,
  performer_name = member.stage_name,
  updated_at = now()
FROM public.komika AS member
JOIN public.events AS event ON event.published = true
WHERE lineup.event_id = event.id
  AND lineup.komika_id IS NULL
  AND lower(trim(lineup.performer_name)) = 'juan hendrik'
  AND lower(trim(member.stage_name)) = 'juan hendrick'
  AND member.published = true
  AND member.status = 'active'
  AND (event.status = 'completed' OR (event.status <> 'cancelled' AND event.date < current_date))
  AND NOT EXISTS (
    SELECT 1
    FROM public.event_lineups AS existing
    WHERE existing.event_id = lineup.event_id
      AND existing.komika_id = member.id
      AND existing.id <> lineup.id
  );

WITH devan_photo AS (
  SELECT photo_url
  FROM public.event_lineups
  WHERE lower(trim(performer_name)) = 'devan yulio'
    AND photo_url IS NOT NULL
  ORDER BY created_at, id
  LIMIT 1
)
UPDATE public.event_lineups AS lineup
SET
  photo_url = devan_photo.photo_url,
  updated_at = now()
FROM devan_photo, public.events AS event
WHERE lineup.event_id = event.id
  AND event.published = true
  AND lower(trim(lineup.performer_name)) = 'devan yulio'
  AND lineup.photo_url IS NULL;
