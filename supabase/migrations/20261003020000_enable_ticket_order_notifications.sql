DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ticket_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_orders;
  END IF;
END;
$$;
