DELETE FROM public.member_stage_experiences
WHERE id IN (
  '018a91fa-ba38-469d-af7d-63e3b2ca48e1',
  '6c126301-70cf-4251-ab2b-8907d973a2c1',
  '871e15ee-7f73-468f-9b54-20c6b516dc22',
  '4468b583-cb18-4518-b261-4b89a8cff731',
  'e7d56b1f-9383-4153-bb92-a2a8657cb696'
)
AND regexp_replace(lower(coalesce(organizer, '')), '[^a-z0-9]', '', 'g')
  IN ('standupindocilegon', 'komunitasstandupindocilegon');
