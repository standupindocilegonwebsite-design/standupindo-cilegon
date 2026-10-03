ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS app_identity text NOT NULL DEFAULT 'public';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.push_subscriptions'::regclass
      AND conname = 'push_subscriptions_app_identity_check'
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_app_identity_check
      CHECK (app_identity IN ('public', 'admin', 'member'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_app_identity_user_id
  ON public.push_subscriptions (app_identity, user_id);

ALTER TABLE public.push_notification_automation_deliveries
  ADD COLUMN IF NOT EXISTS target_key text NOT NULL DEFAULT 'public';

ALTER TABLE public.push_notification_automation_deliveries
  DROP CONSTRAINT IF EXISTS push_notification_automation_deliveries_cycle_id_stage_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS push_notification_automation_deliveries_cycle_stage_target
  ON public.push_notification_automation_deliveries (cycle_id, stage_key, target_key);

CREATE TABLE IF NOT EXISTS public.push_evaluator_assignment_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.evaluator_assignments(id) ON DELETE CASCADE,
  target_subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (assignment_id, target_subscription_id)
);

ALTER TABLE public.push_evaluator_assignment_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_evaluator_assignment_deliveries FROM anon, authenticated;

ALTER TABLE public.evaluator_assignments
  ADD COLUMN IF NOT EXISTS notification_pending_at timestamptz;

CREATE OR REPLACE FUNCTION public.mark_evaluator_assignment_push_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.notification_pending_at := now();
    ELSIF OLD.status IS DISTINCT FROM 'active' THEN
      NEW.notification_pending_at := now();
    END IF;
  ELSIF NEW.status <> 'active' THEN
    NEW.notification_pending_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_evaluator_assignment_push_pending() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS mark_evaluator_assignment_push_pending ON public.evaluator_assignments;
CREATE TRIGGER mark_evaluator_assignment_push_pending
BEFORE INSERT OR UPDATE OF status ON public.evaluator_assignments
FOR EACH ROW EXECUTE FUNCTION public.mark_evaluator_assignment_push_pending();
