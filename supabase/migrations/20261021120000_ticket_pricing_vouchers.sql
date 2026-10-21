CREATE TABLE IF NOT EXISTS public.ticket_fee_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE RESTRICT,
  is_enabled boolean NOT NULL DEFAULT false,
  calculation_type text NOT NULL DEFAULT 'percentage'
    CHECK (calculation_type IN ('percentage', 'fixed')),
  calculation_value numeric(12, 2) NOT NULL DEFAULT 0
    CHECK (
      calculation_value >= 0
      AND (calculation_type <> 'percentage' OR calculation_value <= 100)
      AND (calculation_type <> 'fixed' OR calculation_value = trunc(calculation_value))
    ),
  label text NOT NULL DEFAULT 'Biaya Layanan'
    CHECK (length(trim(label)) BETWEEN 1 AND 60),
  calculation_basis text NOT NULL DEFAULT 'after_discount'
    CHECK (calculation_basis IN ('before_discount', 'after_discount')),
  charge_unit text NOT NULL DEFAULT 'per_order'
    CHECK (charge_unit IN ('per_ticket', 'per_order')),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE
    CHECK (code = upper(regexp_replace(trim(code), '\s+', '', 'g'))),
  internal_name text CHECK (internal_name IS NULL OR length(internal_name) <= 120),
  audience text NOT NULL DEFAULT 'public'
    CHECK (audience IN ('public', 'special')),
  discount_type text NOT NULL
    CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value numeric(12, 2) NOT NULL
    CHECK (
      discount_value > 0
      AND (discount_type <> 'percentage' OR discount_value <= 100)
      AND (discount_type <> 'fixed' OR discount_value = trunc(discount_value))
    ),
  maximum_discount integer CHECK (maximum_discount IS NULL OR maximum_discount > 0),
  minimum_purchase integer CHECK (minimum_purchase IS NULL OR minimum_purchase >= 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  total_quota integer CHECK (total_quota IS NULL OR total_quota > 0),
  per_buyer_limit integer CHECK (per_buyer_limit IS NULL OR per_buyer_limit > 0),
  all_categories boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_vouchers_dates_valid CHECK (ends_at > starts_at),
  CONSTRAINT ticket_vouchers_discount_cap_valid CHECK (
    discount_type <> 'fixed' OR maximum_discount IS NULL
  )
);

CREATE TABLE IF NOT EXISTS public.ticket_voucher_categories (
  voucher_id uuid NOT NULL REFERENCES public.ticket_vouchers(id) ON DELETE RESTRICT,
  ticket_id uuid NOT NULL REFERENCES public.event_tickets(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (voucher_id, ticket_id)
);

CREATE TABLE IF NOT EXISTS public.ticket_voucher_allowed_buyers (
  voucher_id uuid NOT NULL REFERENCES public.ticket_vouchers(id) ON DELETE RESTRICT,
  whatsapp_normalized text NOT NULL
    CHECK (whatsapp_normalized ~ '^[0-9]{10,15}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (voucher_id, whatsapp_normalized)
);

CREATE TABLE IF NOT EXISTS public.ticket_voucher_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES public.ticket_vouchers(id) ON DELETE RESTRICT,
  ticket_order_id uuid NOT NULL UNIQUE REFERENCES public.ticket_orders(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  ticket_id uuid NOT NULL REFERENCES public.event_tickets(id) ON DELETE RESTRICT,
  order_number text NOT NULL,
  voucher_code_snapshot text NOT NULL,
  whatsapp_normalized text NOT NULL CHECK (whatsapp_normalized ~ '^[0-9]{10,15}$'),
  discount_amount integer NOT NULL CHECK (discount_amount > 0),
  transaction_status text NOT NULL,
  usage_status text NOT NULL CHECK (usage_status IN ('reserved', 'redeemed', 'released')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  redeemed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ticket_vouchers_event_active
  ON public.ticket_vouchers(event_id, is_active, ends_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_voucher_redemptions_quota
  ON public.ticket_voucher_redemptions(voucher_id, usage_status, whatsapp_normalized);
CREATE INDEX IF NOT EXISTS idx_ticket_voucher_redemptions_event_created
  ON public.ticket_voucher_redemptions(event_id, created_at DESC);

ALTER TABLE public.ticket_orders
  ADD COLUMN IF NOT EXISTS voucher_id uuid REFERENCES public.ticket_vouchers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS voucher_code_snapshot text,
  ADD COLUMN IF NOT EXISTS ticket_subtotal integer NOT NULL DEFAULT 0 CHECK (ticket_subtotal >= 0),
  ADD COLUMN IF NOT EXISTS discount_amount integer NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  ADD COLUMN IF NOT EXISTS additional_fee_amount integer NOT NULL DEFAULT 0 CHECK (additional_fee_amount >= 0),
  ADD COLUMN IF NOT EXISTS price_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.ticket_orders
SET ticket_subtotal = total_price,
    price_breakdown = jsonb_build_object(
      'legacy', true,
      'ticket_subtotal', total_price,
      'discount_amount', 0,
      'additional_fee_amount', 0,
      'total_price', total_price
    )
WHERE price_breakdown = '{}'::jsonb;

ALTER TABLE public.ticket_fee_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_voucher_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_voucher_allowed_buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_voucher_redemptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ticket_fee_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ticket_vouchers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ticket_voucher_categories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ticket_voucher_allowed_buyers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ticket_voucher_redemptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ticket_fee_settings TO authenticated;
GRANT SELECT ON public.ticket_vouchers TO authenticated;
GRANT SELECT ON public.ticket_voucher_categories TO authenticated;
GRANT SELECT ON public.ticket_voucher_allowed_buyers TO authenticated;
GRANT SELECT ON public.ticket_voucher_redemptions TO authenticated;

CREATE OR REPLACE FUNCTION public.user_has_scoped_ticket_admin_access(target_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT target_event_id IS NOT NULL
    AND public.jwt_has_role('admin_ticket')
    AND EXISTS (
      SELECT 1
      FROM public.admin_event_scopes scope
      WHERE scope.user_id = auth.uid()
        AND scope.role = 'admin_ticket'
        AND (scope.scope_all OR scope.event_id = target_event_id)
    );
$$;

REVOKE ALL ON FUNCTION public.user_has_scoped_ticket_admin_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_scoped_ticket_admin_access(uuid) TO authenticated;

DROP POLICY IF EXISTS "ticket_admin_read_scoped_fee_settings" ON public.ticket_fee_settings;
CREATE POLICY "ticket_admin_read_scoped_fee_settings"
  ON public.ticket_fee_settings
  FOR SELECT TO authenticated
  USING (public.user_has_scoped_ticket_admin_access(event_id));

DROP POLICY IF EXISTS "ticket_admin_read_scoped_vouchers" ON public.ticket_vouchers;
CREATE POLICY "ticket_admin_read_scoped_vouchers"
  ON public.ticket_vouchers
  FOR SELECT TO authenticated
  USING (public.user_has_scoped_ticket_admin_access(event_id));

DROP POLICY IF EXISTS "ticket_admin_read_scoped_voucher_categories" ON public.ticket_voucher_categories;
CREATE POLICY "ticket_admin_read_scoped_voucher_categories"
  ON public.ticket_voucher_categories
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ticket_vouchers voucher
      WHERE voucher.id = ticket_voucher_categories.voucher_id
        AND public.user_has_scoped_ticket_admin_access(voucher.event_id)
    )
  );

DROP POLICY IF EXISTS "ticket_admin_read_scoped_voucher_buyers" ON public.ticket_voucher_allowed_buyers;
CREATE POLICY "ticket_admin_read_scoped_voucher_buyers"
  ON public.ticket_voucher_allowed_buyers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ticket_vouchers voucher
      WHERE voucher.id = ticket_voucher_allowed_buyers.voucher_id
        AND public.user_has_scoped_ticket_admin_access(voucher.event_id)
    )
  );

DROP POLICY IF EXISTS "ticket_admin_read_scoped_voucher_redemptions" ON public.ticket_voucher_redemptions;
CREATE POLICY "ticket_admin_read_scoped_voucher_redemptions"
  ON public.ticket_voucher_redemptions
  FOR SELECT TO authenticated
  USING (public.user_has_scoped_ticket_admin_access(event_id));

CREATE OR REPLACE FUNCTION public.ticket_voucher_admin_summary(p_event_id uuid)
RETURNS TABLE (
  voucher_id uuid,
  usage_count bigint,
  reserved_count bigint,
  redeemed_count bigint,
  remaining_quota bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.user_has_scoped_ticket_admin_access(p_event_id) THEN
    RAISE EXCEPTION 'Hanya Admin Tiket dengan scope Event yang dapat melihat statistik voucher';
  END IF;
  RETURN QUERY
  SELECT voucher.id,
         count(redemption.id),
         count(redemption.id) FILTER (
           WHERE redemption.usage_status = 'reserved'
             AND (redemption.expires_at IS NULL OR redemption.expires_at > now())
         ),
         count(redemption.id) FILTER (WHERE redemption.usage_status = 'redeemed'),
         CASE
           WHEN voucher.total_quota IS NULL THEN NULL::bigint
           ELSE greatest(voucher.total_quota::bigint - count(redemption.id) FILTER (
             WHERE redemption.usage_status IN ('reserved', 'redeemed')
               AND (redemption.usage_status = 'redeemed' OR redemption.expires_at IS NULL OR redemption.expires_at > now())
           ), 0)
         END
  FROM public.ticket_vouchers voucher
  LEFT JOIN public.ticket_voucher_redemptions redemption ON redemption.voucher_id = voucher.id
  WHERE voucher.event_id = p_event_id
  GROUP BY voucher.id;
END;
$$;

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
  saved_id uuid;
BEGIN
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

  INSERT INTO public.ticket_fee_settings (
    event_id, is_enabled, calculation_type, calculation_value, label,
    calculation_basis, charge_unit, updated_by, updated_at
  ) VALUES (
    p_event_id, coalesce(p_is_enabled, false), p_calculation_type,
    p_calculation_value, trim(p_label), p_calculation_basis, p_charge_unit,
    auth.uid(), now()
  )
  ON CONFLICT (event_id) DO UPDATE SET
    is_enabled = EXCLUDED.is_enabled,
    calculation_type = EXCLUDED.calculation_type,
    calculation_value = EXCLUDED.calculation_value,
    label = EXCLUDED.label,
    calculation_basis = EXCLUDED.calculation_basis,
    charge_unit = EXCLUDED.charge_unit,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at
  RETURNING id INTO saved_id;

  RETURN saved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_ticket_voucher(
  p_voucher_id uuid,
  p_event_id uuid,
  p_code text,
  p_internal_name text,
  p_audience text,
  p_discount_type text,
  p_discount_value numeric,
  p_maximum_discount integer,
  p_minimum_purchase integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_total_quota integer,
  p_per_buyer_limit integer,
  p_all_categories boolean,
  p_ticket_ids uuid[],
  p_allowed_whatsapp text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_code text := upper(regexp_replace(trim(coalesce(p_code, '')), '\s+', '', 'g'));
  normalized_buyers text[];
  saved_id uuid;
  existing_event_id uuid;
  selected_ticket_count integer;
BEGIN
  IF NOT public.user_has_scoped_ticket_admin_access(p_event_id) THEN
    RAISE EXCEPTION 'Hanya Admin Tiket dengan scope Event yang dapat mengelola voucher';
  END IF;
  IF normalized_code = '' OR length(normalized_code) > 40
    OR p_audience IS NULL
    OR p_audience NOT IN ('public', 'special')
    OR p_discount_type IS NULL
    OR p_discount_type NOT IN ('percentage', 'fixed')
    OR p_discount_value IS NULL OR p_discount_value <= 0
    OR (p_internal_name IS NOT NULL AND length(trim(p_internal_name)) > 120)
    OR (p_discount_type = 'percentage' AND p_discount_value > 100)
    OR (p_discount_type = 'fixed' AND p_discount_value <> trunc(p_discount_value))
    OR (p_discount_type = 'fixed' AND p_maximum_discount IS NOT NULL)
    OR (p_maximum_discount IS NOT NULL AND p_maximum_discount <= 0)
    OR (p_minimum_purchase IS NOT NULL AND p_minimum_purchase < 0)
    OR p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at
    OR (p_total_quota IS NOT NULL AND p_total_quota <= 0)
    OR (p_per_buyer_limit IS NOT NULL AND p_per_buyer_limit <= 0)
    OR p_all_categories IS NULL THEN
    RAISE EXCEPTION 'Konfigurasi voucher tidak valid';
  END IF;

  IF p_voucher_id IS NOT NULL THEN
    SELECT event_id INTO existing_event_id
    FROM public.ticket_vouchers
    WHERE id = p_voucher_id
    FOR UPDATE;
    IF NOT FOUND OR existing_event_id <> p_event_id THEN
      RAISE EXCEPTION 'Voucher tidak ditemukan untuk Event ini';
    END IF;
  END IF;

  IF p_all_categories THEN
    IF coalesce(cardinality(p_ticket_ids), 0) > 0 THEN
      RAISE EXCEPTION 'Kategori tiket harus kosong untuk cakupan semua kategori';
    END IF;
  ELSE
    SELECT count(DISTINCT ticket_id)::integer INTO selected_ticket_count
    FROM unnest(coalesce(p_ticket_ids, ARRAY[]::uuid[])) AS selected(ticket_id)
    JOIN public.event_tickets ticket ON ticket.id = selected.ticket_id
    WHERE ticket.event_id = p_event_id AND ticket.status = 'active';
    IF selected_ticket_count = 0
      OR selected_ticket_count <> cardinality(coalesce(p_ticket_ids, ARRAY[]::uuid[])) THEN
      RAISE EXCEPTION 'Pilih kategori aktif yang berasal dari Event ini';
    END IF;
  END IF;

  IF p_audience = 'special' AND EXISTS (
    SELECT 1
    FROM unnest(coalesce(p_allowed_whatsapp, ARRAY[]::text[])) AS input(value)
    WHERE length(public.normalize_ticket_whatsapp(value)) NOT BETWEEN 10 AND 15
  ) THEN
    RAISE EXCEPTION 'Setiap nomor WhatsApp yang diizinkan harus valid';
  END IF;
  SELECT array_agg(DISTINCT public.normalize_ticket_whatsapp(value))
  INTO normalized_buyers
  FROM unnest(coalesce(p_allowed_whatsapp, ARRAY[]::text[])) AS input(value)
  WHERE length(public.normalize_ticket_whatsapp(value)) BETWEEN 10 AND 15;

  IF p_audience = 'special' AND coalesce(cardinality(normalized_buyers), 0) = 0 THEN
    RAISE EXCEPTION 'Voucher khusus harus memiliki setidaknya satu nomor WhatsApp yang diizinkan';
  END IF;
  IF p_audience = 'public' AND coalesce(cardinality(normalized_buyers), 0) > 0 THEN
    RAISE EXCEPTION 'Daftar pembeli hanya berlaku untuk voucher khusus';
  END IF;

  IF p_voucher_id IS NULL THEN
    INSERT INTO public.ticket_vouchers (
      event_id, code, internal_name, audience, discount_type, discount_value,
      maximum_discount, minimum_purchase, starts_at, ends_at, total_quota,
      per_buyer_limit, all_categories, created_by
    ) VALUES (
      p_event_id, normalized_code, nullif(trim(p_internal_name), ''),
      p_audience, p_discount_type, p_discount_value, p_maximum_discount,
      p_minimum_purchase, p_starts_at, p_ends_at, p_total_quota,
      p_per_buyer_limit, p_all_categories, auth.uid()
    )
    RETURNING id INTO saved_id;
  ELSE
    UPDATE public.ticket_vouchers
    SET code = normalized_code,
        internal_name = nullif(trim(p_internal_name), ''),
        audience = p_audience,
        discount_type = p_discount_type,
        discount_value = p_discount_value,
        maximum_discount = p_maximum_discount,
        minimum_purchase = p_minimum_purchase,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        total_quota = p_total_quota,
        per_buyer_limit = p_per_buyer_limit,
        all_categories = p_all_categories,
        updated_at = now()
    WHERE id = p_voucher_id
    RETURNING id INTO saved_id;
  END IF;

  DELETE FROM public.ticket_voucher_categories WHERE voucher_id = saved_id;
  IF NOT p_all_categories THEN
    INSERT INTO public.ticket_voucher_categories (voucher_id, ticket_id)
    SELECT saved_id, selected.ticket_id
    FROM unnest(p_ticket_ids) AS selected(ticket_id);
  END IF;

  DELETE FROM public.ticket_voucher_allowed_buyers WHERE voucher_id = saved_id;
  IF p_audience = 'special' THEN
    INSERT INTO public.ticket_voucher_allowed_buyers (voucher_id, whatsapp_normalized)
    SELECT saved_id, buyer
    FROM unnest(normalized_buyers) AS selected(buyer);
  END IF;

  RETURN saved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_ticket_voucher_status(
  p_voucher_id uuid,
  p_is_active boolean,
  p_delete boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  selected_event_id uuid;
BEGIN
  IF NOT public.jwt_has_role('admin_ticket') THEN
    RAISE EXCEPTION 'Hanya Admin Tiket yang dapat mengubah status voucher';
  END IF;
  SELECT event_id INTO selected_event_id
  FROM public.ticket_vouchers
  WHERE id = p_voucher_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public.user_has_scoped_ticket_admin_access(selected_event_id) THEN
    RAISE EXCEPTION 'Voucher berada di luar scope Admin Tiket';
  END IF;
  UPDATE public.ticket_vouchers
  SET is_active = CASE WHEN coalesce(p_delete, false) THEN false ELSE coalesce(p_is_active, false) END,
      deleted_at = CASE WHEN coalesce(p_delete, false) THEN coalesce(deleted_at, now()) ELSE deleted_at END,
      updated_at = now()
  WHERE id = p_voucher_id;
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
  total_price bigint;
  redemption_count bigint;
  buyer_redemption_count bigint;
  fee_snapshot jsonb := NULL;
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
  SELECT * INTO selected_fee
  FROM public.ticket_fee_settings
  WHERE event_id = p_event_id AND is_enabled = true;
  IF FOUND AND selected_ticket.price > 0 THEN
    fee_snapshot := jsonb_build_object(
      'enabled', true,
      'label', selected_fee.label,
      'calculation_type', selected_fee.calculation_type,
      'calculation_value', selected_fee.calculation_value,
      'calculation_basis', selected_fee.calculation_basis,
      'charge_unit', selected_fee.charge_unit
    );
  END IF;

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
      SELECT * INTO selected_voucher
      FROM public.ticket_vouchers
      WHERE id = selected_voucher_id
      FOR UPDATE;
    ELSE
      SELECT * INTO selected_voucher
      FROM public.ticket_vouchers
      WHERE id = selected_voucher_id;
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

  IF fee_snapshot IS NOT NULL THEN
    fee_base := CASE
      WHEN selected_fee.calculation_basis = 'before_discount' THEN ticket_subtotal
      ELSE ticket_subtotal - discount_amount
    END;
    IF selected_fee.calculation_type = 'percentage' THEN
      IF selected_fee.charge_unit = 'per_ticket' THEN
        fee_amount := round((fee_base::numeric / p_quantity) * selected_fee.calculation_value / 100) * p_quantity;
      ELSE
        fee_amount := round(fee_base * selected_fee.calculation_value / 100);
      END IF;
    ELSE
      fee_amount := selected_fee.calculation_value::bigint
        * CASE WHEN selected_fee.charge_unit = 'per_ticket' THEN p_quantity ELSE 1 END;
    END IF;
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
      'fee', fee_snapshot,
      'total_price', total_price
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.quote_ticket_order(
  p_event_id uuid,
  p_ticket_id uuid,
  p_quantity integer,
  p_whatsapp text,
  p_voucher_code text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH calculated AS (
    SELECT public.calculate_ticket_order_pricing(
      p_event_id, p_ticket_id, p_quantity, p_whatsapp, p_voucher_code, false
    ) AS pricing
  )
  SELECT jsonb_build_object(
    'quantity', (pricing->>'quantity')::integer,
    'ticket_subtotal', (pricing->>'ticket_subtotal')::integer,
    'discount_amount', (pricing->>'discount_amount')::integer,
    'additional_fee_amount', (pricing->>'additional_fee_amount')::integer,
    'total_price', (pricing->>'total_price')::integer,
    'voucher_code', pricing->'voucher_code',
    'price_breakdown', (pricing->'price_breakdown') - 'voucher'
  )
  FROM calculated;
$$;

CREATE OR REPLACE FUNCTION public.create_ticket_order_priced(
  p_order_number text,
  p_event_id uuid,
  p_ticket_id uuid,
  p_full_name text,
  p_email text,
  p_whatsapp text,
  p_quantity integer,
  p_notes text,
  p_voucher_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  selected_event public.events%ROWTYPE;
  selected_ticket public.event_tickets%ROWTYPE;
  selected_payment public.event_payment_methods%ROWTYPE;
  normalized_phone text;
  committed_quantity bigint;
  new_order_id uuid := gen_random_uuid();
  pricing jsonb;
  new_total integer;
  new_discount integer;
  new_fee integer;
  new_subtotal integer;
  voucher_id uuid;
  voucher_code text;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 10 THEN
    RAISE EXCEPTION 'Jumlah tiket harus antara 1 dan 10';
  END IF;
  IF nullif(trim(p_full_name), '') IS NULL THEN
    RAISE EXCEPTION 'Nama pembeli wajib diisi';
  END IF;
  normalized_phone := public.normalize_ticket_whatsapp(p_whatsapp);
  IF length(normalized_phone) < 10 OR length(normalized_phone) > 15 THEN
    RAISE EXCEPTION 'Nomor WhatsApp tidak valid';
  END IF;
  IF p_order_number IS NULL OR p_order_number !~ '^[A-Z]{3}-[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'Nomor order tidak valid';
  END IF;

  SELECT * INTO selected_event
  FROM public.events
  WHERE id = p_event_id AND published = true AND status = 'upcoming'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event tidak tersedia untuk pemesanan'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));
  SELECT * INTO selected_ticket
  FROM public.event_tickets
  WHERE id = p_ticket_id AND event_id = p_event_id
    AND status = 'active' AND available_public = true
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jenis tiket tidak tersedia'; END IF;

  pricing := public.calculate_ticket_order_pricing(
    p_event_id, p_ticket_id, p_quantity, normalized_phone, p_voucher_code, true
  );
  new_total := (pricing->>'total_price')::integer;
  new_discount := (pricing->>'discount_amount')::integer;
  new_fee := (pricing->>'additional_fee_amount')::integer;
  new_subtotal := (pricing->>'ticket_subtotal')::integer;
  voucher_id := nullif(pricing->>'voucher_id', '')::uuid;
  voucher_code := nullif(pricing->>'voucher_code', '');

  SELECT method.* INTO selected_payment
  FROM public.event_payment_method_assignments assignment
  JOIN public.event_payment_methods method ON method.id = assignment.payment_method_id
  WHERE assignment.event_id = p_event_id AND assignment.is_active = true
  FOR SHARE OF assignment, method;
  IF NOT FOUND THEN RAISE EXCEPTION 'Informasi pembayaran Event belum aktif'; END IF;

  UPDATE public.ticket_orders
  SET status = 'Expired', updated_at = now()
  WHERE ticket_id = p_ticket_id
    AND status IN ('Draft Pembayaran', 'Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar')
    AND expires_at IS NOT NULL
    AND expires_at <= now();

  SELECT coalesce(sum(quantity), 0) INTO committed_quantity
  FROM public.ticket_orders
  WHERE ticket_id = p_ticket_id
    AND status IN ('Draft Pembayaran', 'Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar', 'Lunas', 'Terverifikasi', 'Selesai');
  IF selected_ticket.quota IS NOT NULL AND committed_quantity + p_quantity > selected_ticket.quota THEN
    RAISE EXCEPTION 'Kuota tiket tidak mencukupi';
  END IF;

  INSERT INTO public.ticket_orders (
    id, order_number, event_id, ticket_id, ticket_category, full_name, email,
    whatsapp, quantity, unit_price, total_price, notes, status, expires_at,
    payment_method_id, payment_method_snapshot, sale_channel, voucher_id, voucher_code_snapshot,
    ticket_subtotal, discount_amount, additional_fee_amount, price_breakdown
  ) VALUES (
    new_order_id, p_order_number, p_event_id, p_ticket_id, selected_ticket.name,
    trim(p_full_name), nullif(lower(trim(p_email)), ''), normalized_phone, p_quantity,
    selected_ticket.price, new_total, nullif(trim(p_notes), ''), 'Menunggu Pembayaran',
    now() + interval '30 minutes', selected_payment.id,
    jsonb_build_object(
      'recipient_name', selected_payment.recipient_name,
      'bank_name', selected_payment.bank_name,
      'account_number', selected_payment.account_number,
      'qris_storage_path', selected_payment.qris_storage_path,
      'note', selected_payment.note
    ),
    'online',
    voucher_id, voucher_code, new_subtotal, new_discount, new_fee,
    pricing->'price_breakdown'
  );

  IF voucher_id IS NOT NULL THEN
    INSERT INTO public.ticket_voucher_redemptions (
      voucher_id, ticket_order_id, event_id, ticket_id, order_number,
      voucher_code_snapshot, whatsapp_normalized, discount_amount,
      transaction_status, usage_status, expires_at
    ) VALUES (
      voucher_id, new_order_id, p_event_id, p_ticket_id, p_order_number,
      voucher_code, normalized_phone, new_discount, 'Menunggu Pembayaran',
      'reserved', now() + interval '30 minutes'
    );
  END IF;

  RETURN jsonb_build_object(
    'id', new_order_id,
    'order_number', p_order_number,
    'total_price', new_total,
    'price_breakdown', pricing->'price_breakdown'
  );
END;
$$;

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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (public.create_ticket_order_priced(
    p_order_number, p_event_id, p_ticket_id, p_full_name, p_email,
    p_whatsapp, p_quantity, p_notes, NULL
  )->>'id')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.sync_ticket_voucher_redemption()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.ticket_voucher_redemptions
  SET transaction_status = NEW.status,
  expires_at = NEW.expires_at,
      usage_status = CASE
        WHEN NEW.status IN ('Lunas', 'Terverifikasi', 'Selesai') THEN 'redeemed'
        WHEN NEW.status IN ('Draft Pembayaran', 'Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar')
          AND (NEW.expires_at IS NULL OR NEW.expires_at > now()) THEN 'reserved'
        ELSE 'released'
      END,
      redeemed_at = CASE
        WHEN NEW.status IN ('Lunas', 'Terverifikasi', 'Selesai') THEN coalesce(redeemed_at, now())
        ELSE redeemed_at
      END,
      released_at = CASE
        WHEN NEW.status IN ('Draft Pembayaran', 'Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar')
          AND (NEW.expires_at IS NULL OR NEW.expires_at > now()) THEN NULL
        WHEN NEW.status IN ('Lunas', 'Terverifikasi', 'Selesai') THEN NULL
        ELSE coalesce(released_at, now())
      END,
      updated_at = now()
  WHERE ticket_order_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_ticket_voucher_redemption_status ON public.ticket_orders;
CREATE TRIGGER sync_ticket_voucher_redemption_status
  AFTER UPDATE OF status, expires_at ON public.ticket_orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.expires_at IS DISTINCT FROM NEW.expires_at)
  EXECUTE FUNCTION public.sync_ticket_voucher_redemption();

REVOKE ALL ON FUNCTION public.set_ticket_fee_setting(uuid, boolean, text, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ticket_fee_setting(uuid, boolean, text, numeric, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.save_ticket_voucher(uuid, uuid, text, text, text, text, numeric, integer, integer, timestamptz, timestamptz, integer, integer, boolean, uuid[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ticket_voucher(uuid, uuid, text, text, text, text, numeric, integer, integer, timestamptz, timestamptz, integer, integer, boolean, uuid[], text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.set_ticket_voucher_status(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ticket_voucher_status(uuid, boolean, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.ticket_voucher_admin_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ticket_voucher_admin_summary(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.calculate_ticket_order_pricing(uuid, uuid, integer, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.quote_ticket_order(uuid, uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quote_ticket_order(uuid, uuid, integer, text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.create_ticket_order_priced(text, uuid, uuid, text, text, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ticket_order_priced(text, uuid, uuid, text, text, text, integer, text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.create_ticket_order(text, uuid, uuid, text, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ticket_order(text, uuid, uuid, text, text, text, integer, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_ticket_voucher_redemption() FROM PUBLIC, anon, authenticated;
