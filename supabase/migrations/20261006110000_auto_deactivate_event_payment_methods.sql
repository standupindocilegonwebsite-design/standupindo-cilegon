CREATE OR REPLACE FUNCTION public.deactivate_expired_event_payment_assignments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  deactivated_count integer;
BEGIN
  UPDATE public.event_payment_method_assignments AS assignment
  SET is_active = false,
      updated_at = now()
  FROM public.events AS event
  WHERE event.id = assignment.event_id
    AND assignment.is_active
    AND event.date + 2 <= (now() AT TIME ZONE 'Asia/Jakarta')::date;

  GET DIAGNOSTICS deactivated_count = ROW_COUNT;
  RETURN deactivated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_expired_event_payment_assignments() FROM PUBLIC, anon, authenticated;

SELECT public.deactivate_expired_event_payment_assignments();

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'deactivate-expired-event-payment-assignments';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'deactivate-expired-event-payment-assignments',
    '*/15 * * * *',
    'SELECT public.deactivate_expired_event_payment_assignments();'
  );
END;
$$;
