INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
  'standupindo-media',
  'standupindo-media',
  true,
  ARRAY['image/jpeg', 'image/png', 'image/webp'],
  5242880
) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "media_public_read" ON storage.objects;
CREATE POLICY "media_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'standupindo-media');

DROP POLICY IF EXISTS "media_admin_insert" ON storage.objects;
CREATE POLICY "media_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'standupindo-media');

DROP POLICY IF EXISTS "media_admin_update" ON storage.objects;
CREATE POLICY "media_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'standupindo-media')
WITH CHECK (bucket_id = 'standupindo-media');

DROP POLICY IF EXISTS "media_admin_delete" ON storage.objects;
CREATE POLICY "media_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'standupindo-media');