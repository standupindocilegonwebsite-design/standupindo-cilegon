ALTER TABLE public.event_tickets
  ADD COLUMN IF NOT EXISTS qr_per_purchase integer NOT NULL DEFAULT 1;

ALTER TABLE public.event_tickets
  DROP CONSTRAINT IF EXISTS event_tickets_qr_per_purchase_check;

ALTER TABLE public.event_tickets
  ADD CONSTRAINT event_tickets_qr_per_purchase_check
  CHECK (qr_per_purchase BETWEEN 1 AND 10);

UPDATE public.event_tickets
SET qr_per_purchase = 1
WHERE qr_per_purchase IS NULL;

DO $$
DECLARE
  function_definition text;
  function_row record;
BEGIN
  FOR function_row IN
    SELECT p.oid
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_ticket_order_priced_with_payment',
        'create_ticket_order_priced',
        'resolve_ticket_order_payment',
        'settle_midtrans_ticket_order',
        'issue_ticket_ots',
        'issue_ticket_free_pass'
      )
  LOOP
    function_definition := pg_get_functiondef(function_row.oid);
    function_definition := replace(
      function_definition,
      'jsonb_array_length(p_qr_tokens) <> p_quantity',
      'jsonb_array_length(p_qr_tokens) <> p_quantity * selected_ticket.qr_per_purchase'
    );
    function_definition := replace(
      function_definition,
      'jsonb_array_length(p_qr_tokens) <> selected_order.quantity',
      'jsonb_array_length(p_qr_tokens) <> selected_order.quantity * selected_ticket.qr_per_purchase'
    );
    function_definition := replace(
      function_definition,
      'committed_quantity + p_quantity > selected_ticket.quota',
      'committed_quantity + (p_quantity * selected_ticket.qr_per_purchase) > selected_ticket.quota'
    );
    function_definition := replace(
      function_definition,
      'committed_quantity + selected_order.quantity > selected_ticket.quota',
      'committed_quantity + (selected_order.quantity * selected_ticket.qr_per_purchase) > selected_ticket.quota'
    );
    function_definition := replace(
      function_definition,
      'coalesce(sum(quantity), 0)',
      'coalesce(sum(quantity), 0) * selected_ticket.qr_per_purchase'
    );
    function_definition := replace(
      function_definition,
      'coalesce(sum(order_row.quantity), 0)',
      'coalesce(sum(order_row.quantity), 0) * selected_ticket.qr_per_purchase'
    );
    function_definition := replace(
      function_definition,
      'RETURN QUERY SELECT new_order_id, selected_code.id, p_quantity;',
      'RETURN QUERY SELECT new_order_id, selected_code.id, p_quantity * selected_ticket.qr_per_purchase;'
    );
    EXECUTE function_definition;
  END LOOP;
END;
$$;
