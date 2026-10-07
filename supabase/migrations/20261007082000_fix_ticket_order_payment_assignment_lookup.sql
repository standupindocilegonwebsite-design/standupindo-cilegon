CREATE OR REPLACE FUNCTION public.create_ticket_order(
  p_order_number text,
  p_event_id uuid,
  p_ticket_id uuid,
  p_full_name text,
  p_email text,
  p_whatsapp text,
  p_quantity integer,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_event public.events%ROWTYPE;
  selected_ticket public.event_tickets%ROWTYPE;
  selected_payment public.event_payment_methods%ROWTYPE;
  normalized_phone text;
  committed_quantity bigint;
  new_order_id uuid := gen_random_uuid();
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 10 THEN
    RAISE EXCEPTION 'Jumlah tiket harus antara 1 dan 10';
  END IF;
  IF nullif(trim(p_full_name), '') IS NULL THEN RAISE EXCEPTION 'Nama pembeli wajib diisi'; END IF;
  normalized_phone := public.normalize_ticket_whatsapp(p_whatsapp);
  IF length(normalized_phone) < 10 OR length(normalized_phone) > 15 THEN
    RAISE EXCEPTION 'Nomor WhatsApp tidak valid';
  END IF;
  IF p_order_number !~ '^[A-Z]{3}-[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'Nomor order tidak valid'; END IF;

  SELECT * INTO selected_event FROM public.events
  WHERE id = p_event_id AND published = true AND status = 'upcoming'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event tidak tersedia untuk pemesanan'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));
  SELECT * INTO selected_ticket FROM public.event_tickets
  WHERE id = p_ticket_id AND event_id = p_event_id
    AND status = 'active' AND available_public
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jenis tiket tidak tersedia untuk pembelian publik'; END IF;

  SELECT method.* INTO selected_payment
  FROM public.event_payment_method_assignments assignment
  JOIN public.event_payment_methods method ON method.id = assignment.payment_method_id
  WHERE assignment.event_id = p_event_id AND assignment.is_active = true
  FOR SHARE OF assignment, method;
  IF NOT FOUND THEN RAISE EXCEPTION 'Informasi pembayaran Event belum aktif'; END IF;

  UPDATE public.ticket_orders SET status = 'Expired', updated_at = now()
  WHERE ticket_id = p_ticket_id
    AND status IN ('Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar')
    AND expires_at IS NOT NULL AND expires_at <= now();

  SELECT coalesce(sum(quantity), 0) INTO committed_quantity
  FROM public.ticket_orders
  WHERE ticket_id = p_ticket_id
    AND status IN ('Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar', 'Lunas', 'Terverifikasi', 'Selesai');
  IF selected_ticket.quota IS NOT NULL AND committed_quantity + p_quantity > selected_ticket.quota THEN
    RAISE EXCEPTION 'Kuota tiket tidak mencukupi';
  END IF;

  INSERT INTO public.ticket_orders (
    id, order_number, event_id, ticket_id, ticket_category, full_name, email, whatsapp,
    quantity, unit_price, total_price, notes, status, expires_at,
    payment_method_id, payment_method_snapshot, sale_channel
  ) VALUES (
    new_order_id, p_order_number, p_event_id, p_ticket_id, selected_ticket.name,
    trim(p_full_name), nullif(lower(trim(p_email)), ''), normalized_phone,
    p_quantity, selected_ticket.price, selected_ticket.price * p_quantity,
    nullif(trim(p_notes), ''), 'Menunggu Pembayaran', now() + interval '30 minutes',
    selected_payment.id,
    jsonb_build_object(
      'recipient_name', selected_payment.recipient_name,
      'bank_name', selected_payment.bank_name,
      'account_number', selected_payment.account_number,
      'qris_storage_path', selected_payment.qris_storage_path,
      'note', selected_payment.note
    ),
    'online'
  );
  RETURN new_order_id;
END;
$$;
