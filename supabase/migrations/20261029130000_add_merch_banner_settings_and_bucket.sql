ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS merch_banner_image_url text,
  ADD COLUMN IF NOT EXISTS merch_banner_title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS merch_banner_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS merch_shop_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS merch_banner_enabled boolean NOT NULL DEFAULT false;

INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
  'standupindo-merch',
  'standupindo-merch',
  true,
  ARRAY['image/jpeg', 'image/png', 'image/webp'],
  5242880
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    allowed_mime_types = EXCLUDED.allowed_mime_types,
    file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "merch_public_read" ON storage.objects;
CREATE POLICY "merch_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'standupindo-merch');

DROP POLICY IF EXISTS "merch_admin_insert" ON storage.objects;
CREATE POLICY "merch_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'standupindo-merch' AND public.jwt_has_role('admin'));

DROP POLICY IF EXISTS "merch_admin_update" ON storage.objects;
CREATE POLICY "merch_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'standupindo-merch' AND public.jwt_has_role('admin'))
WITH CHECK (bucket_id = 'standupindo-merch' AND public.jwt_has_role('admin'));

DROP POLICY IF EXISTS "merch_admin_delete" ON storage.objects;
CREATE POLICY "merch_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'standupindo-merch' AND public.jwt_has_role('admin'));

NOTIFY pgrst, 'reload schema';
