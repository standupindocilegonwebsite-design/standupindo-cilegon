import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgePercent, CalendarClock, Check, ChevronDown, Clock3, Pencil, Plus, RefreshCw, Save, Ticket, Trash2, X } from 'lucide-react';
import type { EventItem, EventTicket } from '@/lib/types';
import { formatPrice, getEventStatus } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { SearchableEventSelect } from '@/components/ui/SearchableEventSelect';
import { TicketWorkspaceHeader } from '@/pages/admin/TicketWorkspaceHeader';
import { Modal } from '@/components/ui/Modal';

type Tab = 'fees' | 'vouchers';
type FeeSetting = {
  id: string;
  event_id: string;
  is_enabled: boolean;
  calculation_type: 'percentage' | 'fixed';
  calculation_value: number;
  label: string;
  calculation_basis: 'before_discount' | 'after_discount';
  charge_unit: 'per_ticket' | 'per_order';
};
type FeeForm = {
  is_enabled: boolean;
  calculation_type: 'percentage' | 'fixed';
  calculation_value: string;
  label: string;
  calculation_basis: 'before_discount' | 'after_discount';
  charge_unit: 'per_ticket' | 'per_order';
};
type Voucher = {
  id: string;
  event_id: string;
  code: string;
  internal_name: string | null;
  audience: 'public' | 'special';
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  maximum_discount: number | null;
  minimum_purchase: number | null;
  starts_at: string;
  ends_at: string;
  total_quota: number | null;
  per_buyer_limit: number | null;
  all_categories: boolean;
  is_active: boolean;
  deleted_at: string | null;
};
type Redemption = {
  id: string;
  voucher_id: string;
  order_number: string;
  voucher_code_snapshot: string;
  discount_amount: number;
  transaction_status: string;
  usage_status: 'reserved' | 'redeemed' | 'released';
  expires_at: string | null;
  created_at: string;
};
type VoucherSummary = {
  voucher_id: string;
  usage_count: number;
  reserved_count: number;
  redeemed_count: number;
  remaining_quota: number | null;
};
type VoucherForm = {
  id: string | null;
  code: string;
  internalName: string;
  audience: 'public' | 'special';
  discountType: 'percentage' | 'fixed';
  discountValue: string;
  maximumDiscount: string;
  minimumPurchase: string;
  startsAt: string;
  endsAt: string;
  totalQuota: string;
  perBuyerLimit: string;
  allCategories: boolean;
  ticketIds: string[];
  allowedWhatsapp: string[];
};
type DeleteConfirmation =
  | { kind: 'archive-voucher'; voucher: Voucher }
  | { kind: 'permanent-voucher'; voucher: Voucher }
  | { kind: 'fee'; fee: FeeSetting };

const emptyFee: FeeForm = {
  is_enabled: false,
  calculation_type: 'percentage' as const,
  calculation_value: '0',
  label: 'Biaya Layanan',
  calculation_basis: 'after_discount' as const,
  charge_unit: 'per_order' as const,
};

function toLocalDateTime(value: string | null) {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function newVoucherForm(): VoucherForm {
  const starts = new Date();
  const ends = new Date(starts);
  ends.setMonth(ends.getMonth() + 1);
  return {
    id: null,
    code: '',
    internalName: '',
    audience: 'public',
    discountType: 'percentage',
    discountValue: '',
    maximumDiscount: '',
    minimumPurchase: '',
    startsAt: toLocalDateTime(starts.toISOString()),
    endsAt: toLocalDateTime(ends.toISOString()),
    totalQuota: '',
    perBuyerLimit: '',
    allCategories: true,
    ticketIds: [],
    allowedWhatsapp: [],
  };
}

export function TicketPricingPage({ events, initialTab, onBack }: {
  events: EventItem[];
  initialTab: Tab;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const [tickets, setTickets] = useState<EventTicket[]>([]);
  const [feeSettings, setFeeSettings] = useState<FeeSetting[]>([]);
  const [feeForm, setFeeForm] = useState<FeeForm>(emptyFee);
  const [feeEditingId, setFeeEditingId] = useState<string | null>(null);
  const [feeModalOpen, setFeeModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [voucherSummaries, setVoucherSummaries] = useState<VoucherSummary[]>([]);
  const [voucherForm, setVoucherForm] = useState<VoucherForm>(newVoucherForm);
  const [whatsappInput, setWhatsappInput] = useState('');
  const [whatsappError, setWhatsappError] = useState('');
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const [expandedVoucherId, setExpandedVoucherId] = useState('');
  const [historyVoucherId, setHistoryVoucherId] = useState('');
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const selectedEvent = events.find((event) => event.id === eventId);
  const eventOptions = useMemo(() => events.map((event) => ({
    id: event.id,
    title: event.title,
    subtitle: `${event.date} · ${event.venue}`,
    poster: event.poster,
    statusLabel: getEventStatus(event.status, event.date) === 'completed' ? 'SELESAI' : undefined,
  })), [events]);

  useEffect(() => {
    if (events.length > 0 && !events.some((event) => event.id === eventId)) {
      setEventId(events[0].id);
    }
  }, [events, eventId]);

  const load = useCallback(async () => {
    if (!eventId) {
      setTickets([]);
      setVouchers([]);
      setRedemptions([]);
      setVoucherSummaries([]);
      setFeeSettings([]);
      return;
    }
    setLoading(true);
    setError('');
    const [feeResult, ticketResult, voucherResult, summaryResult] = await Promise.all([
      supabase.from('ticket_fee_settings').select('*').eq('event_id', eventId).order('created_at').order('id'),
      supabase.from('event_tickets').select('*').eq('event_id', eventId).eq('status', 'active').order('sort_order'),
      supabase.from('ticket_vouchers').select('*').eq('event_id', eventId).order('created_at', { ascending: false }),
      supabase.rpc('ticket_voucher_admin_summary', { p_event_id: eventId }),
    ]);
    const failed = feeResult.error ?? ticketResult.error ?? voucherResult.error ?? summaryResult.error;
    if (failed) {
      console.error('Data pengaturan harga tiket gagal dimuat.', failed);
      setError(`Data pengaturan gagal dimuat: ${failed.message}`);
    } else {
      setFeeSettings((feeResult.data as FeeSetting[]) ?? []);
      setTickets((ticketResult.data as EventTicket[]) ?? []);
      setVouchers((voucherResult.data as Voucher[]) ?? []);
      setVoucherSummaries((summaryResult.data as VoucherSummary[]) ?? []);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  useEffect(() => {
    if (tab !== 'vouchers') setVoucherModalOpen(false);
    if (tab !== 'fees') setFeeModalOpen(false);
  }, [tab]);
  useEffect(() => {
    if (!voucherModalOpen && !feeModalOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        setVoucherModalOpen(false);
        setFeeModalOpen(false);
        setDeleteConfirmation(null);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [voucherModalOpen, feeModalOpen, saving]);

  const loadRedemptionPage = useCallback(async (voucherId: string, page: number) => {
    setLoading(true);
    setError('');
    const start = page * 50;
    const { data, error: historyError, count } = await supabase.from('ticket_voucher_redemptions')
      .select('*', { count: 'exact' })
      .eq('voucher_id', voucherId)
      .order('created_at', { ascending: false })
      .range(start, start + 49);
    setLoading(false);
    if (historyError) {
      console.error('Riwayat penggunaan voucher gagal dimuat.', historyError);
      setError(`Riwayat voucher gagal dimuat: ${historyError.message}`);
      return;
    }
    setRedemptions((data as Redemption[]) ?? []);
    setHistoryPage(page);
    setHistoryTotal(count ?? 0);
  }, []);

  async function toggleHistory(voucherId: string) {
    if (historyVoucherId === voucherId) {
      setHistoryVoucherId('');
      setRedemptions([]);
      setHistoryTotal(0);
      return;
    }
    setExpandedVoucherId(voucherId);
    setHistoryVoucherId(voucherId);
    await loadRedemptionPage(voucherId, 0);
  }

  async function saveFee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eventId) return;
    setSaving(true);
    setError('');
    setNotice('');
    const { error: saveError } = await supabase.rpc('save_ticket_fee_setting', {
      p_setting_id: feeEditingId,
      p_event_id: eventId,
      p_is_enabled: feeForm.is_enabled,
      p_calculation_type: feeForm.calculation_type,
      p_calculation_value: Number(feeForm.calculation_value),
      p_label: feeForm.label,
      p_calculation_basis: feeForm.calculation_basis,
      p_charge_unit: feeForm.charge_unit,
    });
    setSaving(false);
    if (saveError) {
      console.error('Pengaturan biaya tiket gagal disimpan.', saveError);
      setError(`Pengaturan biaya gagal disimpan: ${saveError.message}`);
      return;
    }
    setNotice(feeEditingId ? 'Pengaturan biaya berhasil diperbarui.' : 'Biaya tambahan berhasil ditambahkan.');
    setFeeModalOpen(false);
    setFeeEditingId(null);
    setFeeForm(emptyFee);
    await load();
  }

  function editVoucher(voucher: Voucher) {
    setError('');
    setSaving(true);
    void (async () => {
      const [{ data: categoryRows, error: categoryError }, { data: allowedRows, error: allowedError }] = await Promise.all([
        supabase.from('ticket_voucher_categories').select('ticket_id').eq('voucher_id', voucher.id),
        supabase.from('ticket_voucher_allowed_buyers').select('whatsapp_normalized').eq('voucher_id', voucher.id),
      ]);
      if (categoryError || allowedError) {
        const failed = categoryError ?? allowedError;
        console.error('Konfigurasi voucher gagal dimuat untuk diedit.', failed ?? new Error('Data voucher tidak ditemukan.'));
        setError(`Konfigurasi voucher gagal dimuat: ${failed?.message ?? 'Data voucher tidak ditemukan.'}`);
        setSaving(false);
        return;
      }
      setVoucherForm({
        id: voucher.id,
        code: voucher.code,
        internalName: voucher.internal_name ?? '',
        audience: voucher.audience,
        discountType: voucher.discount_type,
        discountValue: String(voucher.discount_value),
        maximumDiscount: voucher.maximum_discount === null ? '' : String(voucher.maximum_discount),
        minimumPurchase: voucher.minimum_purchase === null ? '' : String(voucher.minimum_purchase),
        startsAt: toLocalDateTime(voucher.starts_at),
        endsAt: toLocalDateTime(voucher.ends_at),
        totalQuota: voucher.total_quota === null ? '' : String(voucher.total_quota),
        perBuyerLimit: voucher.per_buyer_limit === null ? '' : String(voucher.per_buyer_limit),
        allCategories: voucher.all_categories,
        ticketIds: (categoryRows ?? []).map((row) => row.ticket_id),
        allowedWhatsapp: (allowedRows ?? []).map((row) => row.whatsapp_normalized),
      });
      setWhatsappInput('');
      setTab('vouchers');
      setExpandedVoucherId(voucher.id);
      setVoucherModalOpen(true);
      setSaving(false);
    })();
  }

  async function saveVoucher(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eventId) return;
    const value = Number(voucherForm.discountValue);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Nilai diskon harus lebih besar dari nol.');
      return;
    }
    if (!voucherForm.allCategories && voucherForm.ticketIds.length === 0) {
      setError('Pilih setidaknya satu kategori tiket yang memenuhi syarat.');
      return;
    }
    const allowedWhatsapp = voucherForm.allowedWhatsapp.map((phone) => phone.trim()).filter(Boolean);
    if (voucherForm.audience === 'special' && allowedWhatsapp.length === 0) {
      setError('Voucher khusus memerlukan setidaknya satu nomor WhatsApp yang diizinkan.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const { error: saveError } = await supabase.rpc('save_ticket_voucher', {
      p_voucher_id: voucherForm.id,
      p_event_id: eventId,
      p_code: voucherForm.code,
      p_internal_name: voucherForm.internalName || null,
      p_audience: voucherForm.audience,
      p_discount_type: voucherForm.discountType,
      p_discount_value: value,
      p_maximum_discount: voucherForm.discountType === 'percentage' && voucherForm.maximumDiscount !== '' ? Number(voucherForm.maximumDiscount) : null,
      p_minimum_purchase: voucherForm.minimumPurchase !== '' ? Number(voucherForm.minimumPurchase) : null,
      p_starts_at: new Date(voucherForm.startsAt).toISOString(),
      p_ends_at: new Date(voucherForm.endsAt).toISOString(),
      p_total_quota: voucherForm.totalQuota !== '' ? Number(voucherForm.totalQuota) : null,
      p_per_buyer_limit: voucherForm.perBuyerLimit !== '' ? Number(voucherForm.perBuyerLimit) : null,
      p_all_categories: voucherForm.allCategories,
      p_ticket_ids: voucherForm.allCategories ? [] : voucherForm.ticketIds,
      p_allowed_whatsapp: voucherForm.audience === 'special'
        ? allowedWhatsapp
        : [],
    });
    setSaving(false);
    if (saveError) {
      console.error('Voucher gagal disimpan.', saveError);
      setError(`Voucher gagal disimpan: ${saveError.message}`);
      return;
    }
    setNotice('Voucher berhasil disimpan.');
    setVoucherForm(newVoucherForm());
    setVoucherModalOpen(false);
    await load();
  }

  async function setVoucherActive(voucher: Voucher, active: boolean, remove = false) {
    setSaving(true);
    setError('');
    const { error: statusError } = await supabase.rpc('set_ticket_voucher_status', {
      p_voucher_id: voucher.id,
      p_is_active: active,
      p_delete: remove,
    });
    setSaving(false);
    if (statusError) {
      console.error('Status voucher gagal diperbarui.', statusError);
      setError(`Status voucher gagal diperbarui: ${statusError.message}`);
      return;
    }
    setNotice(remove ? 'Voucher diarsipkan; riwayat penggunaan tetap tersimpan.' : 'Status voucher berhasil diperbarui.');
    await load();
  }

  async function permanentlyDeleteVoucher(voucher: Voucher) {
    if (!voucher.deleted_at) return;
    setSaving(true);
    setError('');
    setNotice('');
    const { error: deleteError } = await supabase.rpc('delete_archived_ticket_voucher', {
      p_voucher_id: voucher.id,
    });
    setSaving(false);
    if (deleteError) {
      console.error('Voucher gagal dihapus permanen.', deleteError);
      setError(`Voucher gagal dihapus permanen: ${deleteError.message}`);
      return;
    }
    setNotice(`Voucher ${voucher.code} dihapus permanen. Riwayat transaksi tetap tersimpan.`);
    if (historyVoucherId === voucher.id) {
      setHistoryVoucherId('');
      setRedemptions([]);
      setHistoryTotal(0);
    }
    await load();
  }

  async function deleteFeeSetting(feeSetting: FeeSetting) {
    setSaving(true);
    setError('');
    setNotice('');
    const { error: deleteError } = await supabase.rpc('delete_ticket_fee_setting_by_id', {
      p_fee_id: feeSetting.id,
    });
    setSaving(false);
    if (deleteError) {
      console.error('Biaya tambahan gagal dihapus.', deleteError);
      setError(`Biaya tambahan gagal dihapus: ${deleteError.message}`);
      return;
    }
    setNotice(`Biaya “${feeSetting.label}” berhasil dihapus.`);
    await load();
  }

  async function confirmDeleteAction() {
    const confirmation = deleteConfirmation;
    if (!confirmation) return;
    setDeleteConfirmation(null);
    if (confirmation.kind === 'archive-voucher') {
      await setVoucherActive(confirmation.voucher, false, true);
    } else if (confirmation.kind === 'permanent-voucher') {
      await permanentlyDeleteVoucher(confirmation.voucher);
    } else {
      await deleteFeeSetting(confirmation.fee);
    }
  }

  const redemptionCounts = useMemo(() => {
    return new Map(voucherSummaries.map((summary) => [summary.voucher_id, {
      usage: summary.usage_count,
      reserved: summary.reserved_count,
      redeemed: summary.redeemed_count,
      remaining: summary.remaining_quota,
    }]));
  }, [voucherSummaries]);

  function createVoucher() {
    setVoucherForm(newVoucherForm());
    setWhatsappInput('');
    setWhatsappError('');
    setError('');
    setNotice('');
    setVoucherModalOpen(true);
  }

  function addAllowedWhatsapp() {
    const phone = whatsappInput.trim();
    if (!phone) return;
    if (voucherForm.allowedWhatsapp.some((savedPhone) => savedPhone.trim() === phone)) {
      setWhatsappError('Nomor ini sudah ada di daftar.');
      return;
    }
    setVoucherForm({ ...voucherForm, allowedWhatsapp: [...voucherForm.allowedWhatsapp, phone] });
    setWhatsappInput('');
    setWhatsappError('');
  }

  function openFeeModal(feeSetting?: FeeSetting) {
    setError('');
    setNotice('');
    setFeeEditingId(feeSetting?.id ?? null);
    setFeeForm(feeSetting ? {
      is_enabled: feeSetting.is_enabled,
      calculation_type: feeSetting.calculation_type,
      calculation_value: String(feeSetting.calculation_value),
      label: feeSetting.label,
      calculation_basis: feeSetting.calculation_basis,
      charge_unit: feeSetting.charge_unit,
    } : emptyFee);
    setFeeModalOpen(true);
  }

  return (
    <div className="space-y-5">
      <TicketWorkspaceHeader
        title={tab === 'fees' ? 'Pajak / Biaya Tambahan' : 'Kelola Voucher'}
        subtitle={tab === 'fees'
          ? 'Atur biaya tambahan per Event. Gunakan label “pajak” hanya jika sesuai ketentuan yang berlaku.'
          : 'Buat voucher publik atau khusus, atur kategori dan kuotanya, serta lihat riwayat penggunaan.'}
        onBack={onBack}
        action={<button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white transition hover:bg-white/25 disabled:cursor-wait disabled:opacity-60" aria-label="Muat ulang pengaturan" title="Muat ulang pengaturan"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>}
      />

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5 sm:inline-grid sm:min-w-[24rem]">
        <button type="button" onClick={() => setTab('fees')} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition ${tab === 'fees' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:bg-white/70'}`}><Ticket className="h-4 w-4" /> Biaya</button>
        <button type="button" onClick={() => setTab('vouchers')} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition ${tab === 'vouchers' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:bg-white/70'}`}><BadgePercent className="h-4 w-4" /> Voucher</button>
      </div>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Event Yang Diatur</span>
          <SearchableEventSelect
            options={eventOptions}
            value={eventId}
            onChange={(next) => {
              setEventId(next);
              setVoucherForm(newVoucherForm());
              setWhatsappInput('');
              setWhatsappError('');
              setVoucherModalOpen(false);
              setFeeModalOpen(false);
              setHistoryVoucherId('');
              setRedemptions([]);
              setHistoryTotal(0);
              setNotice('');
            }}
            allLabel="Pilih Event"
            ariaLabel="Pilih Event untuk pengaturan ticketing"
          />
        </label>
        {!selectedEvent && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Tidak ada Event dalam scope Admin Tiket akun ini.</p>}
        {loading && <p className="text-sm text-slate-500">Memuat pengaturan...</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
        {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{notice}</p>}
      </section>

      {tab === 'fees' && selectedEvent && <>
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-extrabold text-slate-900">Pajak / Biaya Tambahan</h2>
              <p className="mt-1 text-xs text-slate-500">{feeSettings.length} biaya · setiap biaya aktif dihitung terpisah lalu dijumlahkan</p>
            </div>
            <button type="button" onClick={() => openFeeModal()} disabled={loading || saving} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60" aria-label="Tambah pajak atau biaya">
              <Plus className="h-5 w-5" /><span className="hidden sm:inline">Tambah Biaya</span>
            </button>
          </div>
          {!feeSettings.length && !loading && <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
            <Ticket className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-700">Belum Ada Biaya Tambahan</p>
            <p className="mt-1 text-xs text-slate-500">Tambahkan pajak, biaya layanan, atau biaya lain untuk Event ini.</p>
          </div>}
          <div className="space-y-3">
            {feeSettings.map((feeSetting) => <article key={feeSetting.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${feeSetting.is_enabled ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}><Ticket className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-extrabold text-slate-900">{feeSetting.label}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${feeSetting.is_enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{feeSetting.is_enabled ? 'Aktif' : 'Nonaktif'}</span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-600">
                  {feeSetting.calculation_type === 'percentage' ? `${feeSetting.calculation_value}%` : formatPrice(Number(feeSetting.calculation_value))}
                  {' · '}{feeSetting.charge_unit === 'per_order' ? 'Per Pesanan' : 'Per Tiket'}
                  {' · '}{feeSetting.calculation_basis === 'before_discount' ? 'Sebelum diskon' : 'Setelah diskon'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setDeleteConfirmation({ kind: 'fee', fee: feeSetting })} disabled={saving} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 text-red-700 transition hover:bg-red-50 disabled:opacity-60" aria-label={`Hapus ${feeSetting.label}`} title="Hapus"><Trash2 className="h-4 w-4" /></button>
                <button type="button" onClick={() => openFeeModal(feeSetting)} disabled={saving} className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-60" aria-label={`Edit ${feeSetting.label}`} title="Edit"><Pencil className="h-4 w-4" /></button>
              </div>
            </article>)}
          </div>
        </section>

        {feeModalOpen && <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fee-form-title"
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setFeeModalOpen(false);
          }}
        >
          <form onSubmit={(event) => void saveFee(event)} className="max-h-[92dvh] w-full space-y-5 overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-4 shadow-2xl sm:max-w-xl sm:rounded-2xl sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Ticket className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <h2 id="fee-form-title" className="text-base font-extrabold text-slate-900">{feeEditingId ? 'Edit Biaya Tambahan' : 'Tambah Biaya Tambahan'}</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedEvent.title}</p>
              </div>
              <button type="button" onClick={() => setFeeModalOpen(false)} disabled={saving} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50" aria-label="Tutup pengaturan biaya"><X className="h-5 w-5" /></button>
            </div>
            {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
            <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl bg-slate-50 px-4">
              <span className="text-sm font-bold text-slate-700">Kenakan biaya saat checkout</span>
              <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-600">
                <input type="checkbox" checked={feeForm.is_enabled} onChange={(event) => setFeeForm({ ...feeForm, is_enabled: event.target.checked })} className="h-4 w-4 accent-blue-700" />
                {feeForm.is_enabled ? 'Aktif' : 'Nonaktif'}
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className="label-field">Jenis Biaya</span><select value={feeForm.calculation_type} onChange={(event) => setFeeForm({ ...feeForm, calculation_type: event.target.value as FeeSetting['calculation_type'] })} className="input-field"><option value="percentage">Persentase (%)</option><option value="fixed">Nominal Tetap (Rp)</option></select></label>
              <label><span className="label-field">Besar Biaya</span><div className="relative"><input required min="0" max={feeForm.calculation_type === 'percentage' ? 100 : undefined} step={feeForm.calculation_type === 'percentage' ? '0.01' : '1'} type="number" value={feeForm.calculation_value} onChange={(event) => setFeeForm({ ...feeForm, calculation_value: event.target.value })} className="input-field pr-14" /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">{feeForm.calculation_type === 'percentage' ? '%' : 'Rp'}</span></div></label>
              <label className="sm:col-span-2"><span className="label-field">Nama Biaya Di Checkout</span><input required maxLength={60} value={feeForm.label} onChange={(event) => setFeeForm({ ...feeForm, label: event.target.value })} className="input-field" placeholder="Contoh: Pajak atau Biaya Layanan" /></label>
            </div>
            <details className="group rounded-xl border border-slate-200 bg-slate-50">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-bold text-slate-700 [&::-webkit-details-marker]:hidden">
                <span>Pengaturan Lanjutan</span><ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
              </summary>
              <div className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-2">
                <label><span className="label-field">Dasar Perhitungan</span><select value={feeForm.calculation_basis} onChange={(event) => setFeeForm({ ...feeForm, calculation_basis: event.target.value as FeeSetting['calculation_basis'] })} className="input-field"><option value="before_discount">Subtotal Sebelum Diskon</option><option value="after_discount">Subtotal Setelah Diskon</option></select></label>
                <label><span className="label-field">Dikenakan</span><select value={feeForm.charge_unit} onChange={(event) => setFeeForm({ ...feeForm, charge_unit: event.target.value as FeeSetting['charge_unit'] })} className="input-field"><option value="per_order">Satu Kali Per Pesanan</option><option value="per_ticket">Untuk Setiap Tiket</option></select></label>
              </div>
            </details>
            <div className="flex items-start gap-2.5 rounded-xl bg-blue-50 p-3.5 text-sm leading-5 text-blue-800"><Check className="mt-0.5 h-4 w-4 shrink-0" /><p>Biaya berlaku untuk tiket online berbayar. OTS dan Free Pass tidak terpengaruh.</p></div>
            <div className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 border-t border-slate-100 bg-white/95 p-4 backdrop-blur sm:-mx-6 sm:-mb-6 sm:p-6">
              <button type="button" onClick={() => setFeeModalOpen(false)} disabled={saving} className="btn-secondary min-h-12 flex-1 sm:flex-none">Batal</button>
              <button type="submit" disabled={saving || loading} className="btn-primary min-h-12 flex-1 sm:flex-none"><Save className="h-4 w-4" /> {saving ? 'Menyimpan...' : feeEditingId ? 'Simpan Perubahan' : 'Tambah Biaya'}</button>
            </div>
          </form>
        </div>}
      </>}

      {tab === 'vouchers' && selectedEvent && <>
        {voucherModalOpen && <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="voucher-form-title"
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setVoucherModalOpen(false);
          }}
        >
        <form onSubmit={(event) => void saveVoucher(event)} className="max-h-[92dvh] w-full space-y-5 overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-4 shadow-2xl sm:max-w-2xl sm:rounded-2xl sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><BadgePercent className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h2 id="voucher-form-title" className="text-base font-extrabold text-slate-900">{voucherForm.id ? 'Edit Voucher' : 'Buat Voucher Baru'}</h2>
              <p className="mt-1 text-sm text-slate-500">{selectedEvent.title}</p>
            </div>
            <button type="button" onClick={() => setVoucherModalOpen(false)} disabled={saving} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50" aria-label="Tutup form voucher"><X className="h-5 w-5" /></button>
          </div>
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="label-field">Kode Voucher</span><input required maxLength={40} value={voucherForm.code} onChange={(event) => setVoucherForm({ ...voucherForm, code: event.target.value.toUpperCase().replace(/\s/g, '') })} className="input-field font-mono font-bold uppercase tracking-wider" placeholder="Contoh: HEMAT10" /><span className="mt-1 block text-xs text-slate-500">Kode ini dibagikan kepada pembeli.</span></label>
            <label><span className="label-field">Jenis Diskon</span><select value={voucherForm.discountType} onChange={(event) => setVoucherForm({ ...voucherForm, discountType: event.target.value as VoucherForm['discountType'], maximumDiscount: event.target.value === 'fixed' ? '' : voucherForm.maximumDiscount })} className="input-field"><option value="percentage">Persentase (%)</option><option value="fixed">Nominal Tetap (Rp)</option></select></label>
            <label><span className="label-field">Besar Diskon</span><div className="relative"><input required min="0.01" max={voucherForm.discountType === 'percentage' ? 100 : undefined} step={voucherForm.discountType === 'percentage' ? '0.01' : '1'} type="number" value={voucherForm.discountValue} onChange={(event) => setVoucherForm({ ...voucherForm, discountValue: event.target.value })} className="input-field pr-14" placeholder={voucherForm.discountType === 'percentage' ? 'Contoh: 10' : 'Contoh: 20000'} /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">{voucherForm.discountType === 'percentage' ? '%' : 'Rp'}</span></div></label>
            <fieldset className="sm:col-span-2">
              <legend className="label-field">Siapa Yang Bisa Menggunakan?</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className={`flex min-h-14 cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-sm font-semibold transition ${voucherForm.audience === 'public' ? 'border-blue-400 bg-blue-50 text-blue-800 ring-1 ring-blue-200' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                  <input type="radio" name="voucher-audience" checked={voucherForm.audience === 'public'} onChange={() => setVoucherForm({ ...voucherForm, audience: 'public' })} className="accent-blue-700" />
                  <span>Semua Pembeli</span>
                </label>
                <label className={`flex min-h-14 cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-sm font-semibold transition ${voucherForm.audience === 'special' ? 'border-blue-400 bg-blue-50 text-blue-800 ring-1 ring-blue-200' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                  <input type="radio" name="voucher-audience" checked={voucherForm.audience === 'special'} onChange={() => setVoucherForm({ ...voucherForm, audience: 'special' })} className="accent-blue-700" />
                  <span>Pembeli Tertentu</span>
                </label>
              </div>
            </fieldset>
          </div>
          {voucherForm.audience === 'special' && <section className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4" aria-labelledby="allowed-whatsapp-title">
            <div>
              <h3 id="allowed-whatsapp-title" className="text-sm font-bold text-slate-800">Nomor WhatsApp Yang Diizinkan</h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">Hanya pembeli dengan nomor di daftar ini yang bisa memakai voucher.</p>
            </div>
            {voucherForm.allowedWhatsapp.length > 0
              ? <ul className="space-y-2">
                {voucherForm.allowedWhatsapp.map((phone, index) => <li key={`${index}-${phone}`} className="flex items-center gap-2">
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(event) => setVoucherForm({
                      ...voucherForm,
                      allowedWhatsapp: voucherForm.allowedWhatsapp.map((savedPhone, savedIndex) => savedIndex === index ? event.target.value : savedPhone),
                    })}
                    className="input-field min-w-0 bg-white"
                    aria-label={`Nomor WhatsApp yang diizinkan ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setVoucherForm({ ...voucherForm, allowedWhatsapp: voucherForm.allowedWhatsapp.filter((_, savedIndex) => savedIndex !== index) });
                      setWhatsappError('');
                    }}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 transition hover:bg-red-50"
                    aria-label={`Hapus nomor WhatsApp ${phone || index + 1}`}
                  ><Trash2 className="h-4 w-4" /></button>
                </li>)}
              </ul>
              : <p className="rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-600">Belum ada nomor. Tambahkan nomor WhatsApp pembeli di bawah.</p>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="tel"
                inputMode="tel"
                value={whatsappInput}
                onChange={(event) => {
                  setWhatsappInput(event.target.value);
                  setWhatsappError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addAllowedWhatsapp();
                  }
                }}
                className="input-field min-w-0 flex-1 bg-white"
                placeholder="Contoh: 081234567890"
                aria-label="Nomor WhatsApp baru"
              />
              <button type="button" onClick={addAllowedWhatsapp} disabled={!whatsappInput.trim()} className="btn-secondary min-h-11 shrink-0 px-4 text-sm disabled:opacity-50"><Plus className="h-4 w-4" /> Tambah Nomor</button>
            </div>
            {whatsappError && <p role="alert" className="text-xs font-medium text-red-700">{whatsappError}</p>}
          </section>}
          <details className="group rounded-xl border border-slate-200">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-bold text-slate-700 [&::-webkit-details-marker]:hidden">
              <span>Atur Masa Berlaku, Kuota, Dan Kategori</span><ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
            </summary>
            <div className="space-y-5 border-t border-slate-200 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2"><span className="label-field">Nama Internal (Opsional)</span><input value={voucherForm.internalName} onChange={(event) => setVoucherForm({ ...voucherForm, internalName: event.target.value })} className="input-field" placeholder="Contoh: Promo Early Bird" /></label>
                {voucherForm.discountType === 'percentage' && <label><span className="label-field">Maksimal Potongan (Opsional)</span><input min="1" step="1" type="number" value={voucherForm.maximumDiscount} onChange={(event) => setVoucherForm({ ...voucherForm, maximumDiscount: event.target.value })} className="input-field" placeholder="Tanpa batas" /></label>}
                <label><span className="label-field">Minimum Pembelian (Opsional)</span><input min="0" step="1" type="number" value={voucherForm.minimumPurchase} onChange={(event) => setVoucherForm({ ...voucherForm, minimumPurchase: event.target.value })} className="input-field" placeholder="Tanpa minimum" /></label>
                <label><span className="label-field">Mulai Berlaku</span><input required type="datetime-local" value={voucherForm.startsAt} onChange={(event) => setVoucherForm({ ...voucherForm, startsAt: event.target.value })} className="input-field" /></label>
                <label><span className="label-field">Berakhir</span><input required type="datetime-local" value={voucherForm.endsAt} onChange={(event) => setVoucherForm({ ...voucherForm, endsAt: event.target.value })} className="input-field" /></label>
                <label><span className="label-field">Kuota Voucher (Opsional)</span><input min="1" step="1" type="number" value={voucherForm.totalQuota} onChange={(event) => setVoucherForm({ ...voucherForm, totalQuota: event.target.value })} className="input-field" placeholder="Tanpa batas" /></label>
                <label><span className="label-field">Maksimal Per Pembeli</span><input min="1" step="1" type="number" value={voucherForm.perBuyerLimit} onChange={(event) => setVoucherForm({ ...voucherForm, perBuyerLimit: event.target.value })} className="input-field" placeholder="Tanpa batas" /></label>
              </div>
              <fieldset className="space-y-3">
                <legend className="label-field">Berlaku Untuk Kategori</legend>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-semibold ${voucherForm.allCategories ? 'border-blue-400 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-700'}`}><input type="radio" name="voucher-categories" checked={voucherForm.allCategories} onChange={() => setVoucherForm({ ...voucherForm, allCategories: true, ticketIds: [] })} className="accent-blue-700" /> Semua Tiket</label>
                  <label className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-semibold ${!voucherForm.allCategories ? 'border-blue-400 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-700'}`}><input type="radio" name="voucher-categories" checked={!voucherForm.allCategories} onChange={() => setVoucherForm({ ...voucherForm, allCategories: false })} className="accent-blue-700" /> Pilih Tiket</label>
                </div>
                {!voucherForm.allCategories && <div className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
                  {tickets.map((ticket) => <label key={ticket.id} className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg bg-white px-3 text-sm text-slate-700 ring-1 ring-slate-200"><span>{ticket.name} · {formatPrice(ticket.price)}</span><input type="checkbox" checked={voucherForm.ticketIds.includes(ticket.id)} onChange={(event) => setVoucherForm({
                    ...voucherForm,
                    ticketIds: event.target.checked ? [...voucherForm.ticketIds, ticket.id] : voucherForm.ticketIds.filter((id) => id !== ticket.id),
                  })} className="h-4 w-4 accent-blue-700" /></label>)}
                  {tickets.length === 0 && <p className="text-xs text-slate-500">Tidak ada kategori aktif di Event ini.</p>}
                </div>}
              </fieldset>
            </div>
          </details>
          <div className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 border-t border-slate-100 bg-white/95 p-4 backdrop-blur sm:-mx-6 sm:-mb-6 sm:p-6">
            <button type="button" onClick={() => setVoucherModalOpen(false)} disabled={saving} className="btn-secondary min-h-12 flex-1 sm:flex-none">Batal</button>
            <button type="submit" disabled={saving || loading} className="btn-primary min-h-12 flex-1 sm:flex-none"><Save className="h-4 w-4" /> {saving ? 'Menyimpan...' : voucherForm.id ? 'Simpan Perubahan' : 'Buat Voucher'}</button>
          </div>
        </form>
        </div>}

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-extrabold text-slate-900">Voucher Event</h2><p className="mt-1 text-xs text-slate-500">{vouchers.length} voucher</p></div>
            <button type="button" onClick={createVoucher} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2" aria-label="Buat voucher baru">
              <Plus className="h-5 w-5" /><span className="hidden sm:inline">Buat Voucher</span>
            </button>
          </div>
          {!vouchers.length && !loading && <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center"><BadgePercent className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-semibold text-slate-700">Belum Ada Voucher</p><p className="mt-1 text-xs text-slate-500">Voucher yang dibuat untuk Event ini akan muncul di sini.</p></div>}
          <div className="space-y-3">
            {vouchers.map((voucher) => {
              const counts = redemptionCounts.get(voucher.id) ?? { usage: 0, reserved: 0, redeemed: 0, remaining: voucher.total_quota };
              const remaining = counts.remaining === null ? 'Tidak terbatas' : counts.remaining.toLocaleString('id-ID');
              const rows = historyVoucherId === voucher.id ? redemptions : [];
              const expanded = expandedVoucherId === voucher.id;
              return <article key={voucher.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedVoucherId(expanded ? '' : voucher.id)}
                  className="flex min-h-[4.5rem] w-full items-center gap-3 p-3 text-left transition hover:bg-slate-50 sm:p-4"
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${voucher.is_active && !voucher.deleted_at ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><BadgePercent className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <code className="font-mono font-black tracking-wide text-blue-800">{voucher.code}</code>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${voucher.deleted_at ? 'bg-slate-100 text-slate-600' : voucher.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{voucher.deleted_at ? 'Diarsipkan' : voucher.is_active ? 'Aktif' : 'Nonaktif'}</span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-600">{voucher.discount_type === 'percentage' ? `Diskon ${voucher.discount_value}%` : `Diskon ${formatPrice(voucher.discount_value)}`} · Terpakai {counts.redeemed}</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${expanded ? 'rotate-180' : ''}`} />
                </button>
                {expanded && <div className="space-y-4 border-t border-slate-100 p-4 sm:p-5">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{voucher.discount_type === 'percentage' ? `Diskon ${voucher.discount_value}%` : `Diskon ${formatPrice(voucher.discount_value)}`}{voucher.maximum_discount ? ` · Maks. ${formatPrice(voucher.maximum_discount)}` : ''}</p>
                  <p className="mt-1 text-xs text-slate-500">{voucher.internal_name || (voucher.audience === 'public' ? 'Untuk Semua Pembeli' : 'Untuk Pembeli Tertentu')}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Terpakai</p><p className="mt-1 text-sm font-extrabold text-slate-900">{counts.redeemed}</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Ditahan</p><p className="mt-1 text-sm font-extrabold text-slate-900">{counts.reserved}</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Sisa Kuota</p><p className="mt-1 truncate text-sm font-extrabold text-slate-900">{remaining}</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Kategori</p><p className="mt-1 text-sm font-extrabold text-slate-900">{voucher.all_categories ? 'Semua Tiket' : 'Terpilih'}</p></div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500"><CalendarClock className="h-4 w-4 shrink-0" /><span>{new Date(voucher.starts_at).toLocaleString('id-ID')} – {new Date(voucher.ends_at).toLocaleString('id-ID')}</span></div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <button type="button" onClick={() => void editVoucher(voucher)} disabled={saving || Boolean(voucher.deleted_at)} className="btn-secondary min-h-10 px-3 text-xs"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                    <button type="button" onClick={() => void toggleHistory(voucher.id)} className="btn-secondary min-h-10 px-3 text-xs"><Clock3 className="h-3.5 w-3.5" /> Riwayat ({counts.usage})</button>
                    {!voucher.deleted_at && <button type="button" onClick={() => void setVoucherActive(voucher, !voucher.is_active)} disabled={saving} className="btn-secondary min-h-10 px-3 text-xs">{voucher.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>}
                    {!voucher.deleted_at
                      ? <button type="button" onClick={() => setDeleteConfirmation({ kind: 'archive-voucher', voucher })} disabled={saving} aria-label={`Arsipkan voucher ${voucher.code}`} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-red-200 px-3 text-xs font-bold text-red-700 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Arsipkan</button>
                      : <button type="button" onClick={() => setDeleteConfirmation({ kind: 'permanent-voucher', voucher })} disabled={saving} aria-label={`Hapus permanen voucher ${voucher.code}`} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-red-300 bg-red-50 px-3 text-xs font-bold text-red-800 hover:bg-red-100"><Trash2 className="h-3.5 w-3.5" /> Hapus permanen</button>}
                  </div>
                {historyVoucherId === voucher.id && <div className="mt-3 overflow-x-auto border-t border-slate-100 pt-3">
                  {!rows.length && historyTotal === 0 ? <p className="text-xs text-slate-500">Belum ada reservasi atau penggunaan voucher.</p> : <table className="w-full min-w-[520px] text-left text-xs">
                    <thead><tr className="text-slate-500"><th className="px-2 py-2">Order</th><th className="px-2 py-2">Waktu</th><th className="px-2 py-2">Diskon</th><th className="px-2 py-2">Status transaksi</th><th className="px-2 py-2">Kuota</th></tr></thead>
                    <tbody>{rows.map((redemption) => <tr key={redemption.id} className="border-t border-slate-100 text-slate-700"><td className="px-2 py-2 font-mono">{redemption.order_number}</td><td className="px-2 py-2">{new Date(redemption.created_at).toLocaleString('id-ID')}</td><td className="px-2 py-2">{formatPrice(redemption.discount_amount)}</td><td className="px-2 py-2">{redemption.transaction_status}</td><td className="px-2 py-2">{redemption.usage_status === 'reserved' ? 'Ditahan' : redemption.usage_status === 'redeemed' ? 'Terpakai' : 'Dilepas'}</td></tr>)}</tbody>
                  </table>}
                  {historyTotal > 50 && <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                    <span>Halaman {historyPage + 1} dari {Math.ceil(historyTotal / 50)}</span>
                    <div className="flex gap-2"><button type="button" disabled={historyPage === 0 || loading} onClick={() => void loadRedemptionPage(voucher.id, historyPage - 1)} className="btn-secondary min-h-8 px-2 text-xs">Sebelumnya</button><button type="button" disabled={(historyPage + 1) * 50 >= historyTotal || loading} onClick={() => void loadRedemptionPage(voucher.id, historyPage + 1)} className="btn-secondary min-h-8 px-2 text-xs">Berikutnya</button></div>
                  </div>}
                </div>}
                </div>}
              </article>;
            })}
          </div>
        </section>
      </>}

      {deleteConfirmation && <Modal
        open
        onClose={() => !saving && setDeleteConfirmation(null)}
        title={deleteConfirmation.kind === 'archive-voucher'
          ? 'Arsipkan Voucher?'
          : deleteConfirmation.kind === 'permanent-voucher'
            ? 'Hapus Voucher Permanen?'
            : 'Hapus Biaya Tambahan?'}
        size="sm"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600"><AlertTriangle className="h-5 w-5" /></span>
            <p className="text-sm leading-6 text-slate-700">
              {deleteConfirmation.kind === 'archive-voucher'
                ? <>Voucher <strong>{deleteConfirmation.voucher.code}</strong> akan dinonaktifkan dan dipindahkan ke arsip. Riwayat penggunaannya tetap tersimpan.</>
                : deleteConfirmation.kind === 'permanent-voucher'
                  ? <>Voucher <strong>{deleteConfirmation.voucher.code}</strong> dan konfigurasi terkait akan dihapus permanen. Riwayat pemakaian dan catatan diskon pada order tetap tersimpan. Tindakan ini tidak dapat dibatalkan.</>
                  : <>Biaya <strong>{deleteConfirmation.fee.label}</strong> untuk <strong>{selectedEvent?.title}</strong> akan dihapus. Order yang sudah dibuat tetap menggunakan rincian biaya yang tersimpan pada transaksi.</>}
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setDeleteConfirmation(null)} disabled={saving} className="btn-secondary justify-center">Batal</button>
            <button type="button" onClick={() => void confirmDeleteAction()} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"><Trash2 className="h-4 w-4" />{saving ? 'Menghapus...' : deleteConfirmation.kind === 'archive-voucher' ? 'Ya, Arsipkan' : 'Ya, Hapus'}</button>
          </div>
        </div>
      </Modal>}

    </div>
  );
}
