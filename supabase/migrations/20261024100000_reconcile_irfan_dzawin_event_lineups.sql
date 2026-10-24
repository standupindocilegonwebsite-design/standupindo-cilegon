WITH matching_member AS (
  SELECT id, stage_name
  FROM (
    SELECT id, stage_name, count(*) OVER () AS match_count
    FROM public.komika
    WHERE lower(trim(full_name)) = 'irfan adhitama'
      AND published = true
      AND status = 'active'
  ) AS candidates
  WHERE match_count = 1
)
UPDATE public.event_lineups AS lineup
SET
  komika_id = member.id,
  performer_name = 'Irfan Adhitama',
  updated_at = now()
FROM matching_member AS member
JOIN public.events AS event ON event.published = true
WHERE lineup.event_id = event.id
  AND lineup.komika_id IS NULL
  AND lower(trim(lineup.performer_name)) = 'koh irfan'
  AND (event.status = 'completed' OR (event.status <> 'cancelled' AND event.date < current_date))
  AND NOT EXISTS (
    SELECT 1
    FROM public.event_lineups AS existing
    WHERE existing.event_id = lineup.event_id
      AND existing.komika_id = member.id
      AND existing.id <> lineup.id
  );

WITH matching_member AS (
  SELECT id, stage_name
  FROM (
    SELECT id, stage_name, count(*) OVER () AS match_count
    FROM public.komika
    WHERE published = true
      AND status = 'active'
      AND (
        lower(trim(stage_name)) IN ('dzawin', 'dzawin nur')
        OR lower(trim(full_name)) IN ('dzawin', 'dzawin nur')
      )
  ) AS candidates
  WHERE match_count = 1
)
UPDATE public.event_lineups AS lineup
SET
  komika_id = member.id,
  performer_name = member.stage_name,
  updated_at = now()
FROM matching_member AS member
JOIN public.events AS event ON event.published = true
WHERE lineup.event_id = event.id
  AND lineup.komika_id IS NULL
  AND lower(trim(lineup.performer_name)) IN ('dzawin', 'dzawin nur')
  AND (event.status = 'completed' OR (event.status <> 'cancelled' AND event.date < current_date))
  AND NOT EXISTS (
    SELECT 1
    FROM public.event_lineups AS existing
    WHERE existing.event_id = lineup.event_id
      AND existing.komika_id = member.id
      AND existing.id <> lineup.id
  );

WITH dzawin_photo AS (
  SELECT COALESCE(member.photo_card, member.photo, lineup.photo_url) AS photo_url
  FROM public.event_lineups AS lineup
  JOIN public.events AS event ON event.id = lineup.event_id
  LEFT JOIN public.komika AS member ON member.id = lineup.komika_id
  WHERE (
      lower(trim(COALESCE(member.stage_name, lineup.performer_name))) IN ('dzawin', 'dzawin nur')
      OR lower(trim(lineup.performer_name)) IN ('dzawin', 'dzawin nur')
    )
    AND event.published = true
    AND (event.status = 'completed' OR (event.status <> 'cancelled' AND event.date < current_date))
    AND COALESCE(member.photo_card, member.photo, lineup.photo_url) IS NOT NULL
  ORDER BY
    CASE WHEN COALESCE(member.photo_card, member.photo) IS NOT NULL THEN 0 ELSE 1 END,
    lineup.created_at,
    lineup.id
  LIMIT 1
)
UPDATE public.event_lineups AS lineup
SET
  photo_url = dzawin_photo.photo_url,
  updated_at = now()
FROM dzawin_photo, public.events AS event
WHERE lineup.event_id = event.id
  AND event.published = true
  AND (event.status = 'completed' OR (event.status <> 'cancelled' AND event.date < current_date))
  AND lower(trim(COALESCE(lineup.performer_name, ''))) IN ('dzawin', 'dzawin nur')
  AND lineup.photo_url IS NULL
  AND dzawin_photo.photo_url IS NOT NULL;
