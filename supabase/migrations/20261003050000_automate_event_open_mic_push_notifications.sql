CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.push_notification_automation_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('event', 'open-mic')),
  entity_id uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_notification_automation_one_active_cycle
  ON public.push_notification_automation_cycles (entity_type, entity_id)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS public.push_notification_automation_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.push_notification_automation_cycles(id) ON DELETE CASCADE,
  stage_key text NOT NULL,
  notification_id text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  sent_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (cycle_id, stage_key)
);

ALTER TABLE public.push_notification_automation_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notification_automation_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_notification_automation_cycles FROM anon, authenticated;
REVOKE ALL ON public.push_notification_automation_deliveries FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.track_public_push_notification_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  item_kind text := CASE WHEN TG_TABLE_NAME = 'events' THEN 'event' ELSE 'open-mic' END;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.push_notification_automation_cycles
    SET is_active = false
    WHERE entity_type = item_kind AND entity_id = OLD.id AND is_active;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.published THEN
      INSERT INTO public.push_notification_automation_cycles (entity_type, entity_id, published_at, is_active)
      VALUES (item_kind, NEW.id, now(), true);
    END IF;
  ELSIF OLD.published AND NOT NEW.published THEN
    UPDATE public.push_notification_automation_cycles
    SET is_active = false
    WHERE entity_type = item_kind AND entity_id = NEW.id AND is_active;
  ELSIF NEW.published AND NOT OLD.published THEN
    UPDATE public.push_notification_automation_cycles
    SET is_active = false
    WHERE entity_type = item_kind AND entity_id = NEW.id AND is_active;
    INSERT INTO public.push_notification_automation_cycles (entity_type, entity_id, published_at, is_active)
    VALUES (item_kind, NEW.id, now(), true);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.track_public_push_notification_cycle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS track_event_public_push_notification_cycle ON public.events;
CREATE TRIGGER track_event_public_push_notification_cycle
AFTER INSERT OR UPDATE OF published OR DELETE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.track_public_push_notification_cycle();

DROP TRIGGER IF EXISTS track_open_mic_public_push_notification_cycle ON public.open_mics;
CREATE TRIGGER track_open_mic_public_push_notification_cycle
AFTER INSERT OR UPDATE OF published OR DELETE ON public.open_mics
FOR EACH ROW EXECUTE FUNCTION public.track_public_push_notification_cycle();

INSERT INTO public.push_notification_automation_cycles (entity_type, entity_id, published_at, is_active)
SELECT 'event', id, now(), true FROM public.events WHERE published
ON CONFLICT (entity_type, entity_id) WHERE is_active DO NOTHING;

INSERT INTO public.push_notification_automation_cycles (entity_type, entity_id, published_at, is_active)
SELECT 'open-mic', id, now(), true FROM public.open_mics WHERE published
ON CONFLICT (entity_type, entity_id) WHERE is_active DO NOTHING;

CREATE OR REPLACE FUNCTION public.invoke_automated_public_event_push()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, net, vault
AS $$
DECLARE
  project_url text;
  service_role_key text;
BEGIN
  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets
  WHERE name = 'event_open_mic_push_project_url'
  LIMIT 1;

  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'event_open_mic_push_service_role_key'
  LIMIT 1;

  IF COALESCE(project_url, '') = '' OR COALESCE(service_role_key, '') = '' THEN
    RAISE WARNING 'Event/Open Mic push cron awaits the project URL and service-role key in Supabase Vault.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/automate-public-event-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key,
      'apikey', service_role_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_automated_public_event_push() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'automate-public-event-push';
  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
  PERFORM cron.schedule(
    'automate-public-event-push',
    '*/15 * * * *',
    'SELECT public.invoke_automated_public_event_push();'
  );
END;
$$;
