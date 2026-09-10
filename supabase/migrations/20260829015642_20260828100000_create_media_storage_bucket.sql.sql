/*
# Create standupindo-media storage bucket with RLS policies

## Overview
Creates a public-readable storage bucket `standupindo-media` for
Standup Indo Cilegon admin-uploaded images (posters, photos).
Only authenticated admin users can upload/update/delete files.
Public users can read (view) files.

## New Storage Bucket
- `standupindo-media` — public bucket for website media
  - Allowed MIME types: image/jpeg, image/png, image/webp
  - Max file size: 5 MB
  - Folders: open-mic/, events/, komika/

## Security (RLS policies on storage.objects)
- SELECT (read): public — anyone can view images on the website
- INSERT (upload): authenticated only
- UPDATE (replace): authenticated only
- DELETE (remove): authenticated only

## Important Notes
1. Bucket is public so images can be served via public URLs.
2. Write access is restricted to authenticated users (admin).
3. File size and MIME type limits enforced at bucket level.
4. Existing data with external URLs remains fully supported.
*/

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
