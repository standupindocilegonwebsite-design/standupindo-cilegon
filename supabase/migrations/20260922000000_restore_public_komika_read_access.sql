DROP POLICY IF EXISTS "public_read_komika" ON public.komika;

CREATE POLICY "public_read_komika" ON public.komika
  FOR SELECT TO anon, authenticated
  USING (published = true AND status = 'active');
