ALTER TABLE public.ticket_voucher_redemptions
  ALTER COLUMN voucher_id DROP NOT NULL;

ALTER TABLE public.ticket_voucher_redemptions
  DROP CONSTRAINT ticket_voucher_redemptions_voucher_id_fkey,
  ADD CONSTRAINT ticket_voucher_redemptions_voucher_id_fkey
    FOREIGN KEY (voucher_id) REFERENCES public.ticket_vouchers(id) ON DELETE SET NULL;

ALTER TABLE public.ticket_orders
  DROP CONSTRAINT ticket_orders_voucher_id_fkey,
  ADD CONSTRAINT ticket_orders_voucher_id_fkey
    FOREIGN KEY (voucher_id) REFERENCES public.ticket_vouchers(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.delete_archived_ticket_voucher(p_voucher_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  selected_event_id uuid;
BEGIN
  IF NOT public.jwt_has_role('admin_ticket') THEN
    RAISE EXCEPTION 'Hanya Admin Tiket yang dapat menghapus voucher';
  END IF;

  SELECT event_id INTO selected_event_id
  FROM public.ticket_vouchers
  WHERE id = p_voucher_id
    AND deleted_at IS NOT NULL
    AND is_active = false
  FOR UPDATE;

  IF NOT FOUND OR NOT public.user_has_scoped_ticket_admin_access(selected_event_id) THEN
    RAISE EXCEPTION 'Voucher tidak ditemukan, belum diarsipkan, atau berada di luar scope Admin Tiket';
  END IF;

  DELETE FROM public.ticket_voucher_categories
  WHERE voucher_id = p_voucher_id;

  DELETE FROM public.ticket_voucher_allowed_buyers
  WHERE voucher_id = p_voucher_id;

  DELETE FROM public.ticket_vouchers
  WHERE id = p_voucher_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_archived_ticket_voucher(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_archived_ticket_voucher(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_ticket_fee_setting(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.user_has_scoped_ticket_admin_access(p_event_id) THEN
    RAISE EXCEPTION 'Hanya Admin Tiket dengan scope Event yang dapat menghapus pengaturan biaya';
  END IF;

  DELETE FROM public.ticket_fee_settings
  WHERE event_id = p_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_ticket_fee_setting(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_ticket_fee_setting(uuid) TO authenticated;
