CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_key text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  target_path text NOT NULL CHECK (target_path LIKE '/%'),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  deleted_at timestamptz,
  UNIQUE (user_id, notification_key)
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_inbox
  ON public.user_notifications (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_notifications" ON public.user_notifications;
CREATE POLICY "users_manage_own_notifications" ON public.user_notifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notifications TO authenticated;
