CREATE TABLE IF NOT EXISTS public.account_active_sessions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  device_label text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_active_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.account_active_sessions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_active_sessions TO authenticated;

DROP POLICY IF EXISTS "users_manage_own_active_account_session" ON public.account_active_sessions;
CREATE POLICY "users_manage_own_active_account_session"
  ON public.account_active_sessions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'account_active_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.account_active_sessions;
  END IF;
END;
$$;
