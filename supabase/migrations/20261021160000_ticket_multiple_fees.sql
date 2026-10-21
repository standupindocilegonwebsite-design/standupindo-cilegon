ALTER TABLE public.ticket_fee_settings
  DROP CONSTRAINT ticket_fee_settings_event_id_key;

CREATE OR REPLACE FUNCTION public.save_ticket_fee_setting(
  p_setting_id uuid,
  p_event_id uuid,
  p_is_enabled boolean,
  p_calculation_type text,
  p_calculation_value numeric,
  p_label text,
  p_calculation_basis text,
  p_charge_unit text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  saved_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text, 1));
  IF NOT public.user_has_scoped_ticket_admin_access(p_event_id) THEN
    RAISE EXCEPTION 'Hanya Admin Tiket dengan scope Event yang dapat mengubah pengaturan biaya';
  END IF;
  IF p_calculation_type NOT IN ('percentage', 'fixed')
    OR p_calculation_type IS NULL
    OR p_calculation_value IS NULL OR p_calculation_value < 0
    OR (p_calculation_type = 'percentage' AND p_calculation_value > 100)
    OR (p_calculation_type = 'fixed' AND p_calculation_value <> trunc(p_calculation_value))
    OR p_calculation_basis IS NULL
    OR p_calculation_basis NOT IN ('before_discount', 'after_discount')
    OR p_charge_unit IS NULL
    OR p_charge_unit NOT IN ('per_ticket', 'per_order')
    OR nullif(trim(p_label), '') IS NULL OR length(trim(p_label)) > 60 THEN
    RAISE EXCEPTION 'Konfigurasi biaya tidak valid';
  END IF;

  IF p_setting_id IS NULL THEN
    INSERT INTO public.ticket_fee_settings (
      event_id, is_enabled, calculation_type, calculation_value, label,
      calculation_basis, charge_unit, updated_by, updated_at
    ) VALUES (
      p_event_id, coalesce(p_is_enabled, false), p_calculation_type,
      p_calculation_value, trim(p_label), p_calculation_basis, p_charge_unit,
      auth.uid(), now()
    )
    RETURNING id INTO saved_id;
  ELSE
    UPDATE public.ticket_fee_settings
    SET is_enabled = coalesce(p_is_enabled, false),
        calculation_type = p_calculation_type,
        calculation_value = p_calculation_value,
        label = trim(p_label),
        calculation_basis = p_calculation_basis,
        charge_unit = p_charge_unit,
        updated_by = auth.uid(),
        updated_at = now()
    WHERE id = p_setting_id
      AND event_id = p_event_id
      AND public.user_has_scoped_ticket_admin_access(event_id)
    RETURNING id INTO saved_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pengaturan biaya tidak ditemukan untuk Event ini';
    END IF;
  END IF;
  RETURN saved_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_ticket_fee_setting(uuid, uuid, boolean, text, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ticket_fee_setting(uuid, uuid, boolean, text, numeric, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_ticket_fee_setting(
  p_event_id uuid,
  p_is_enabled boolean,
  p_calculation_type text,
  p_calculation_value numeric,
  p_label text,
  p_calculation_basis text,
  p_charge_unit text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing_setting_id uuid;
BEGIN
  SELECT id INTO existing_setting_id
  FROM public.ticket_fee_settings
  WHERE event_id = p_event_id
  ORDER BY created_at, id
  LIMIT 1;
  RETURN public.save_ticket_fee_setting(
    existing_setting_id, p_event_id, p_is_enabled, p_calculation_type,
    p_calculation_value, p_label, p_calculation_basis, p_charge_unit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_ticket_fee_setting_by_id(p_fee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  selected_event_id uuid;
BEGIN
  SELECT event_id INTO selected_event_id
  FROM public.ticket_fee_settings
  WHERE id = p_fee_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public.user_has_scoped_ticket_admin_access(selected_event_id) THEN
    RAISE EXCEPTION 'Biaya tidak ditemukan atau berada di luar scope Admin Tiket';
  END IF;
  DELETE FROM public.ticket_fee_settings WHERE id = p_fee_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_ticket_fee_setting_by_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_ticket_fee_setting_by_id(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_ticket_fee_setting(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  oldest_setting_id uuid;
BEGIN
  SELECT id INTO oldest_setting_id
  FROM public.ticket_fee_settings
  WHERE event_id = p_event_id
  ORDER BY created_at, id
  LIMIT 1;
  IF oldest_setting_id IS NOT NULL THEN
    PERFORM public.delete_ticket_fee_setting_by_id(oldest_setting_id);
  ELSIF NOT public.user_has_scoped_ticket_admin_access(p_event_id) THEN
    RAISE EXCEPTION 'Hanya Admin Tiket dengan scope Event yang dapat menghapus pengaturan biaya';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_ticket_order_pricing(
  p_event_id uuid,
  p_ticket_id uuid,
  p_quantity integer,
  p_whatsapp text,
  p_voucher_code text,
  p_lock_voucher boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  selected_ticket public.event_tickets%ROWTYPE;
  selected_event public.events%ROWTYPE;
  selected_fee public.ticket_fee_settings%ROWTYPE;
  selected_voucher public.ticket_vouchers%ROWTYPE;
  selected_voucher_id uuid;
  normalized_phone text := public.normalize_ticket_whatsapp(p_whatsapp);
  normalized_code text := upper(regexp_replace(trim(coalesce(p_voucher_code, '')), '\s+', '', 'g'));
  ticket_subtotal bigint;
  discount_amount bigint := 0;
  fee_base bigint := 0;
  fee_amount bigint := 0;
  fee_item_amount bigint := 0;
  total_price bigint;
  redemption_count bigint;
  buyer_redemption_count bigint;
  fee_snapshot jsonb := '[]'::jsonb;
  voucher_snapshot jsonb := NULL;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 10 THEN
    RAISE EXCEPTION 'Jumlah tiket harus antara 1 dan 10';
  END IF;
  SELECT * INTO selected_event
  FROM public.events
  WHERE id = p_event_id AND published = true AND status = 'upcoming'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event tidak tersedia untuk pemesanan'; END IF;
  SELECT * INTO selected_ticket
  FROM public.event_tickets
  WHERE id = p_ticket_id AND event_id = p_event_id
    AND status = 'active' AND available_public = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jenis tiket tidak tersedia untuk pembelian online'; END IF;

  ticket_subtotal := selected_ticket.price::bigint * p_quantity;

  IF normalized_code <> '' THEN
    IF ticket_subtotal <= 0 OR length(normalized_phone) NOT BETWEEN 10 AND 15 THEN
      RAISE EXCEPTION 'Kode voucher tidak berlaku untuk pembelian ini';
    END IF;
    SELECT id INTO selected_voucher_id
    FROM public.ticket_vouchers
    WHERE code = normalized_code AND event_id = p_event_id
      AND is_active = true AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kode voucher tidak berlaku'; END IF;
    IF coalesce(p_lock_voucher, false) THEN
      SELECT * INTO selected_voucher FROM public.ticket_vouchers WHERE id = selected_voucher_id FOR UPDATE;
    ELSE
      SELECT * INTO selected_voucher FROM public.ticket_vouchers WHERE id = selected_voucher_id;
    END IF;
    IF NOT FOUND OR selected_voucher.is_active = false
      OR selected_voucher.deleted_at IS NOT NULL
      OR selected_voucher.code <> normalized_code
      OR selected_voucher.starts_at > now()
      OR selected_voucher.ends_at <= now()
      OR (selected_voucher.minimum_purchase IS NOT NULL AND ticket_subtotal < selected_voucher.minimum_purchase)
      OR (NOT selected_voucher.all_categories AND NOT EXISTS (
        SELECT 1 FROM public.ticket_voucher_categories category
        WHERE category.voucher_id = selected_voucher.id AND category.ticket_id = p_ticket_id
      )) THEN
      RAISE EXCEPTION 'Kode voucher tidak berlaku untuk pembelian ini';
    END IF;
    IF selected_voucher.audience = 'special'
      AND NOT EXISTS (
        SELECT 1 FROM public.ticket_voucher_allowed_buyers allowed
        WHERE allowed.voucher_id = selected_voucher.id
          AND allowed.whatsapp_normalized = normalized_phone
      ) THEN
      RAISE EXCEPTION 'Nomor WhatsApp ini tidak memenuhi syarat voucher khusus';
    END IF;

    SELECT count(*) INTO redemption_count
    FROM public.ticket_voucher_redemptions redemption
    WHERE redemption.voucher_id = selected_voucher.id
      AND redemption.usage_status IN ('reserved', 'redeemed')
      AND (redemption.usage_status = 'redeemed' OR EXISTS (
        SELECT 1 FROM public.ticket_orders order_row
        WHERE order_row.id = redemption.ticket_order_id
          AND (order_row.expires_at IS NULL OR order_row.expires_at > now())
      ));
    SELECT count(*) INTO buyer_redemption_count
    FROM public.ticket_voucher_redemptions redemption
    WHERE redemption.voucher_id = selected_voucher.id
      AND redemption.whatsapp_normalized = normalized_phone
      AND redemption.usage_status IN ('reserved', 'redeemed')
      AND (redemption.usage_status = 'redeemed' OR EXISTS (
        SELECT 1 FROM public.ticket_orders order_row
        WHERE order_row.id = redemption.ticket_order_id
          AND (order_row.expires_at IS NULL OR order_row.expires_at > now())
      ));
    IF selected_voucher.total_quota IS NOT NULL AND redemption_count >= selected_voucher.total_quota THEN
      RAISE EXCEPTION 'Kuota voucher sudah habis';
    END IF;
    IF selected_voucher.per_buyer_limit IS NOT NULL AND buyer_redemption_count >= selected_voucher.per_buyer_limit THEN
      RAISE EXCEPTION 'Batas penggunaan voucher untuk pembeli ini sudah tercapai';
    END IF;
    IF selected_voucher.discount_type = 'percentage' THEN
      discount_amount := round(ticket_subtotal * selected_voucher.discount_value / 100);
      IF selected_voucher.maximum_discount IS NOT NULL THEN
        discount_amount := least(discount_amount, selected_voucher.maximum_discount);
      END IF;
    ELSE
      discount_amount := selected_voucher.discount_value;
    END IF;
    discount_amount := least(discount_amount, ticket_subtotal);
    voucher_snapshot := jsonb_build_object(
      'code', selected_voucher.code,
      'discount_type', selected_voucher.discount_type,
      'discount_value', selected_voucher.discount_value,
      'maximum_discount', selected_voucher.maximum_discount
    );
  END IF;

  IF selected_ticket.price > 0 THEN
    FOR selected_fee IN
      SELECT * FROM public.ticket_fee_settings
      WHERE event_id = p_event_id AND is_enabled = true
      ORDER BY created_at, id
    LOOP
      fee_base := CASE
        WHEN selected_fee.calculation_basis = 'before_discount' THEN ticket_subtotal
        ELSE ticket_subtotal - discount_amount
      END;
      IF selected_fee.calculation_type = 'percentage' THEN
        IF selected_fee.charge_unit = 'per_ticket' THEN
          fee_item_amount := round((fee_base::numeric / p_quantity) * selected_fee.calculation_value / 100) * p_quantity;
        ELSE
          fee_item_amount := round(fee_base * selected_fee.calculation_value / 100);
        END IF;
      ELSE
        fee_item_amount := selected_fee.calculation_value::bigint
          * CASE WHEN selected_fee.charge_unit = 'per_ticket' THEN p_quantity ELSE 1 END;
      END IF;
      fee_amount := fee_amount + fee_item_amount;
      fee_snapshot := fee_snapshot || jsonb_build_array(jsonb_build_object(
        'enabled', true,
        'label', selected_fee.label,
        'calculation_type', selected_fee.calculation_type,
        'calculation_value', selected_fee.calculation_value,
        'calculation_basis', selected_fee.calculation_basis,
        'charge_unit', selected_fee.charge_unit,
        'amount', fee_item_amount
      ));
    END LOOP;
  END IF;

  total_price := ticket_subtotal - discount_amount + fee_amount;
  IF total_price < 0 OR total_price > 2147483647
    OR discount_amount > 2147483647 OR fee_amount > 2147483647 THEN
    RAISE EXCEPTION 'Total pembayaran berada di luar batas yang didukung';
  END IF;

  RETURN jsonb_build_object(
    'event_id', p_event_id,
    'ticket_id', p_ticket_id,
    'quantity', p_quantity,
    'ticket_subtotal', ticket_subtotal,
    'discount_amount', discount_amount,
    'additional_fee_amount', fee_amount,
    'total_price', total_price,
    'voucher_id', selected_voucher.id,
    'voucher_code', CASE WHEN selected_voucher.id IS NULL THEN NULL ELSE selected_voucher.code END,
    'voucher_snapshot', voucher_snapshot,
    'fee_snapshot', fee_snapshot,
    'price_breakdown', jsonb_build_object(
      'ticket_subtotal', ticket_subtotal,
      'discount_amount', discount_amount,
      'voucher_code', CASE WHEN selected_voucher.id IS NULL THEN NULL ELSE selected_voucher.code END,
      'voucher', voucher_snapshot,
      'additional_fee_amount', fee_amount,
      'fees', fee_snapshot,
      'fee', CASE WHEN jsonb_array_length(fee_snapshot) = 1 THEN fee_snapshot->0 ELSE NULL END,
      'total_price', total_price
    )
  );
END;
$$;
