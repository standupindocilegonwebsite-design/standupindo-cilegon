import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { ArrowLeft, ArrowRight, Banknote, Building2, Check, CheckCircle2, ChevronDown, ChevronUp, CircleAlert, Copy, Download, Eye, Gift, Mail, MessageCircle, Plus, QrCode, Search, Share2, Store, Ticket } from 'lucide-react';
import { formatDate, getEventStatus } from '@/lib/format';
import type { EventStatus } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { TicketPagination } from '@/components/TicketPagination';
import { TicketWorkspaceHeader } from '@/pages/admin/TicketWorkspaceHeader';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { SearchableEventSelect } from '@/components/ui/SearchableEventSelect';
import { Modal } from '@/components/ui/Modal';

const PAGE_SIZE = 30;

type ContactField = 'full_name' | 'whatsapp';

function getContactFieldError(field: ContactField, value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) return field === 'full_name' ? 'Nama lengkap wajib diisi.' : 'Nomor WhatsApp wajib diisi.';
  if (field === 'full_name') {
    return /[\p{L}]/u.test(trimmedValue) && trimmedValue.length >= 2 ? '' : 'Masukkan nama lengkap yang valid.';
  }
  if (!/^\+?[\d\s()-]+$/.test(trimmedValue) || (trimmedValue.match(/\+/g) ?? []).length > 1 || (trimmedValue.includes('+') && !trimmedValue.startsWith('+'))) {
    return 'Format nomor WhatsApp tidak valid. Gunakan nomor Indonesia.';
  }
  const digits = trimmedValue.replace(/\D/g, '');
  let subscriberNumber = '';
  if (digits.startsWith('08')) subscriberNumber = digits.slice(1);
  else if (digits.startsWith('628')) subscriberNumber = digits.slice(2);
  else if (digits.startsWith('8')) subscriberNumber = digits;
  else return 'Gunakan nomor Indonesia yang diawali 08 atau +62.';
  if (subscriberNumber.length < 9) return `Nomor WhatsApp kurang ${9 - subscriberNumber.length} angka.`;
  if (subscriberNumber.length > 12) return 'Nomor WhatsApp terlalu panjang. Periksa kembali nomornya.';
  return '';
}

function getOptionalEmailError(value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedValue) ? '' : 'Format email belum benar. Contoh: nama@email.com.';
}

function ValidatedContactInput({ id, name, label, value, type = 'text', placeholder, autoComplete, inputMode, required, maxLength, validation, onChange, onBlur }: {
  id: string;
  name?: string;
  label: string;
  value: string;
  type?: 'text' | 'tel' | 'email';
  placeholder: string;
  autoComplete: string;
  inputMode?: 'tel';
  required?: boolean;
  maxLength?: number;
  validation: { error: string; valid: boolean };
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const errorId = `${id}-error`;
  return <div>
    <label htmlFor={id} className="block text-xs font-bold text-slate-700">{label}</label>
    <div className="relative mt-1">
      <input
        id={id}
        name={name ?? id}
        type={type}
        inputMode={inputMode}
        required={required}
        maxLength={maxLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={Boolean(validation.error)}
        aria-describedby={validation.error ? errorId : undefined}
        className={`input-field pr-11 ${validation.error ? '!border-red-500 focus:!border-red-500 focus:!ring-red-500/20' : validation.valid ? '!border-emerald-500 focus:!border-emerald-500 focus:!ring-emerald-500/20' : ''}`}
        placeholder={placeholder}
      />
      {validation.error
        ? <CircleAlert aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-500" />
        : validation.valid && <CheckCircle2 aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-600" />}
    </div>
    {validation.error && <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-red-600">{validation.error}</p>}
  </div>;
}

function TicketQuantityStepper({ value, max, disabled, onChange }: {
  value: string;
  max: number;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const quantity = Number.parseInt(value, 10) || 1;
  const limit = Math.max(1, Math.min(10, max));

  function setQuantity(nextValue: string) {
    const digits = nextValue.replace(/\D/g, '').slice(0, 2);
    const parsed = Number.parseInt(digits, 10);
    onChange(digits && parsed > limit ? String(limit) : digits);
  }

  function adjustQuantity(change: number) {
    onChange(String(Math.max(1, Math.min(limit, quantity + change))));
  }

  return (
    <div className="mt-1 inline-flex h-11 items-center overflow-hidden rounded-xl border border-slate-300 bg-white">
      <button type="button" aria-label="Kurangi jumlah tiket" disabled={disabled || quantity <= 1} onClick={() => adjustQuantity(-1)} className="flex h-full w-11 items-center justify-center text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
        <ArrowLeft className="h-4 w-4" />
      </button>
      <input required type="text" inputMode="numeric" pattern="[1-9]|10" maxLength={2} value={value} onChange={(event) => setQuantity(event.target.value)} disabled={disabled} className="h-full w-10 border-x border-slate-200 bg-transparent p-0 text-center text-base font-semibold text-slate-900 outline-none disabled:opacity-50" aria-label="Jumlah tiket" />
      <button type="button" aria-label="Tambah jumlah tiket" disabled={disabled || quantity >= limit} onClick={() => adjustQuantity(1)} className="flex h-full w-11 items-center justify-center text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

interface TicketRow {
  id: string;
  event_id: string;
  ticket_order_id: string;
  event_ticket_id: string | null;
  sequence_no: number;
  status: 'active' | 'revoked' | 'expired';
  checked_in_at: string | null;
  issued_at: string;
  order: { order_number: string | null; full_name: string; whatsapp: string; ticket_category: string; order_type: 'paid' | 'free_pass'; sale_channel: 'online' | 'ots' | 'free_pass'; free_pass_reason: string | null };
  event: { id: string; title: string; status: string; date: string };
}

interface TicketEvent {
  id: string;
  title: string;
  poster: string | null;
  status: EventStatus;
  date: string;
}

interface EventTicketCategory {
  id: string;
  event_id: string;
  name: string;
  quota: number | null;
  status: string;
  sort_order: number;
  available_ots: boolean;
  ots_price: number | null;
}

interface TicketOrderReservation {
  ticket_id: string | null;
  quantity: number;
  status: string;
  expires_at: string | null;
}

interface OtsPaymentDestination {
  id: string;
  recipient_name: string;
  qris_recipient_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  qris_storage_path: string | null;
  note: string | null;
  is_active: boolean;
}

type OtsPaymentMethod = 'cash' | 'qris' | 'bank_transfer';
type OtsPaymentSource = 'website' | 'other';

interface TicketOrderGroup {
  id: string;
  orderNumber: string;
  fullName: string;
  whatsapp: string;
  category: string;
  orderType: 'paid' | 'free_pass';
  saleChannel: 'online' | 'ots' | 'free_pass';
  freePassReason: string | null;
  event: TicketRow['event'];
  tickets: TicketRow[];
  usedCount: number;
  expiredCount: number;
}

async function loadTickets() {
  const { data, error } = await supabase.functions.invoke('ticketing-admin', { body: { action: 'ticket-list' } });
  if (error) {
    const context = (error as Error & { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        const response = await context.json() as { error?: string };
        return { tickets: [] as TicketRow[], events: [] as TicketEvent[], categories: [] as EventTicketCategory[], orders: [] as TicketOrderReservation[], error: response.error ?? error.message };
      } catch {
        return { tickets: [] as TicketRow[], events: [] as TicketEvent[], categories: [] as EventTicketCategory[], orders: [] as TicketOrderReservation[], error: error.message };
      }
    }
    return { tickets: [] as TicketRow[], events: [] as TicketEvent[], categories: [] as EventTicketCategory[], orders: [] as TicketOrderReservation[], error: error.message };
  }
  const [eventsResult, categoriesResult, ordersResult] = await Promise.all([
    supabase.from('events').select('id, title, poster, status, date').order('date', { ascending: false }),
    supabase.from('event_tickets').select('id, event_id, name, quota, status, sort_order, available_ots, ots_price')
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('ticket_orders').select('ticket_id, quantity, status, expires_at'),
  ]);
  if (eventsResult.error) return { tickets: (data?.tickets as TicketRow[]) ?? [], events: [] as TicketEvent[], categories: [] as EventTicketCategory[], orders: [] as TicketOrderReservation[], error: `Daftar Event gagal dimuat: ${eventsResult.error.message}` };
  if (categoriesResult.error) return { tickets: (data?.tickets as TicketRow[]) ?? [], events: (eventsResult.data as TicketEvent[]) ?? [], categories: [] as EventTicketCategory[], orders: [] as TicketOrderReservation[], error: `Kategori tiket gagal dimuat: ${categoriesResult.error.message}` };
  if (ordersResult.error) return { tickets: (data?.tickets as TicketRow[]) ?? [], events: (eventsResult.data as TicketEvent[]) ?? [], categories: (categoriesResult.data as EventTicketCategory[]) ?? [], orders: [] as TicketOrderReservation[], error: `Ringkasan kuota tiket gagal dimuat: ${ordersResult.error.message}` };
  return {
    tickets: (data?.tickets as TicketRow[]) ?? [],
    events: (eventsResult.data as TicketEvent[]) ?? [],
    categories: (categoriesResult.data as EventTicketCategory[]) ?? [],
    orders: (ordersResult.data as TicketOrderReservation[]) ?? [],
    error: null as string | null,
  };
}

export function TicketAdminTicketsPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [categories, setCategories] = useState<EventTicketCategory[]>([]);
  const [orders, setOrders] = useState<TicketOrderReservation[]>([]);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unused' | 'used' | 'expired'>('all');
  const [page, setPage] = useState(1);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(() => new Set());
  const [posterPreview, setPosterPreview] = useState<{ src: string; alt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [freePassOpen, setFreePassOpen] = useState(false);
  const [freePassSaving, setFreePassSaving] = useState(false);
  const [freePassError, setFreePassError] = useState('');
  const [freePassTouched, setFreePassTouched] = useState<{ full_name: boolean; whatsapp: boolean; email: boolean }>({ full_name: false, whatsapp: false, email: false });
  const [freePassValidationSubmitted, setFreePassValidationSubmitted] = useState(false);
  const [freePassResult, setFreePassResult] = useState<{
    order_number: string;
    access_code: string;
    whatsapp_url: string | null;
    ticket_count: number;
    email_status: 'sent' | 'failed' | 'skipped';
    email_message: string;
  } | null>(null);
  const [freePassForm, setFreePassForm] = useState({
    event_id: '',
    ticket_id: '',
    full_name: '',
    email: '',
    whatsapp: '',
    quantity: '1',
    reason: '',
  });
  const [otsOpen, setOtsOpen] = useState(false);
  const [issuanceMenuOpen, setIssuanceMenuOpen] = useState(false);
  const issuanceMenuRef = useRef<HTMLDivElement>(null);
  const [otsSaving, setOtsSaving] = useState(false);
  const [otsError, setOtsError] = useState('');
  const [otsTouched, setOtsTouched] = useState<Record<ContactField, boolean>>({ full_name: false, whatsapp: false });
  const [otsValidationSubmitted, setOtsValidationSubmitted] = useState(false);
  const [copiedOtsAccount, setCopiedOtsAccount] = useState('');
  const [otsCopyError, setOtsCopyError] = useState('');
  const [otsPdfBusy, setOtsPdfBusy] = useState(false);
  const [otsPdfMessage, setOtsPdfMessage] = useState('');
  const [otsPdfFallbackReady, setOtsPdfFallbackReady] = useState(false);
  const [otsPaymentDestinations, setOtsPaymentDestinations] = useState<OtsPaymentDestination[]>([]);
  const [otsPaymentDestinationsLoading, setOtsPaymentDestinationsLoading] = useState(false);
  const [otsResult, setOtsResult] = useState<{
    order_number: string;
    access_code: string;
    whatsapp_url: string | null;
    whatsapp_message: string;
    ticket_count: number;
    unit_price: number;
    total_price: number;
    tickets: Array<{ id: string; sequence_no: number; qr_token: string }>;
    full_name: string;
    payment_status: 'pending';
    category: string;
    event: { title: string; date: string; time: string; venue: string; location: string | null; poster: string | null; event_rules: string | null };
  } | null>(null);
  const [otsForm, setOtsForm] = useState({
    event_id: '',
    ticket_id: '',
    full_name: '',
    whatsapp: '',
    quantity: '1',
    payment_method: 'cash' as OtsPaymentMethod,
    payment_source: 'website' as OtsPaymentSource,
    payment_destination_id: '',
    custom_recipient_name: '',
    custom_bank_name: '',
    custom_account_number: '',
    custom_qris_recipient_name: '',
    custom_qris_identifier: '',
    custom_note: '',
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await loadTickets();
    setLoading(false);
    setTickets(result.tickets);
    setEvents(result.events);
    setCategories(result.categories);
    setOrders(result.orders ?? []);
    setError(result.error ?? '');
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!otsOpen || !otsForm.event_id) {
      setOtsPaymentDestinations([]);
      setOtsPaymentDestinationsLoading(false);
      return;
    }
    let active = true;
    setOtsPaymentDestinationsLoading(true);
    void supabase.functions.invoke('ticketing-admin', {
      body: { action: 'ots-payment-options', event_id: otsForm.event_id },
    }).then(async ({ data, error: invokeError }) => {
      if (!active) return;
      if (invokeError) {
        const context = (invokeError as Error & { context?: Response }).context;
        if (context && typeof context.json === 'function') {
          try {
            const response = await context.json() as { error?: string };
            throw new Error(response.error ?? invokeError.message);
          } catch (parseError) {
            if (parseError instanceof Error && parseError.message !== invokeError.message) throw parseError;
            throw new Error(invokeError.message);
          }
        }
        throw new Error(invokeError.message);
      }
      const destinations = data?.destinations;
      if (!Array.isArray(destinations) || !destinations.every((destination: unknown) => (
        Boolean(destination) && typeof destination === 'object'
        && typeof (destination as Record<string, unknown>).id === 'string'
        && typeof (destination as Record<string, unknown>).recipient_name === 'string'
        && typeof (destination as Record<string, unknown>).is_active === 'boolean'
      ))) {
        throw new Error('Daftar tujuan pembayaran OTS tidak valid.');
      }
      setOtsPaymentDestinations(destinations as OtsPaymentDestination[]);
    }).catch((loadError: unknown) => {
      if (active) {
        setOtsPaymentDestinations([]);
        setOtsError(loadError instanceof Error ? loadError.message : 'Tujuan pembayaran OTS gagal dimuat.');
      }
    }).finally(() => {
      if (active) setOtsPaymentDestinationsLoading(false);
    });
    return () => { active = false; };
  }, [otsForm.event_id, otsOpen]);

  const visibleEvents = useMemo(() => events.filter((event) => getEventStatus(event.status, event.date) !== 'completed'
    && categories.some((category) => category.event_id === event.id)), [categories, events]);
  const eligibleFreePassEvents = useMemo(() => visibleEvents.filter((event) => event.status === 'upcoming'
    && categories.some((category) => category.event_id === event.id && category.status === 'active')), [categories, visibleEvents]);
  const freePassCategories = useMemo(() => categories.filter((category) => category.event_id === freePassForm.event_id
    && category.status === 'active'), [categories, freePassForm.event_id]);
  const quotaOrders = useMemo(() => {
    const now = Date.now();
    return orders.filter((order) => ['Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar', 'Lunas', 'Terverifikasi', 'Selesai'].includes(order.status)
      && (!['Menunggu Pembayaran', 'Menunggu Verifikasi', 'Sudah Bayar'].includes(order.status)
        || !order.expires_at || Date.parse(order.expires_at) > now));
  }, [orders]);
  const eligibleOtsEvents = useMemo(() => visibleEvents.filter((event) => event.status === 'upcoming'
    && categories.some((category) => category.event_id === event.id && category.status === 'active'
      && category.available_ots && category.ots_price != null
      && (category.quota == null || category.quota - quotaOrders
        .filter((order) => order.ticket_id === category.id)
        .reduce((total, order) => total + order.quantity, 0) > 0))), [categories, quotaOrders, visibleEvents]);
  const otsCategories = useMemo(() => categories.filter((category) => {
    if (category.event_id !== otsForm.event_id || category.status !== 'active' || !category.available_ots || category.ots_price == null) return false;
    return category.quota == null || category.quota - quotaOrders
      .filter((order) => order.ticket_id === category.id)
      .reduce((total, order) => total + order.quantity, 0) > 0;
  }), [categories, otsForm.event_id, quotaOrders]);
  const selectedOtsCategory = otsCategories.find((category) => category.id === otsForm.ticket_id) ?? null;
  const isOtsDestinationSuitable = (destination: OtsPaymentDestination) => otsForm.payment_method === 'qris'
    ? Boolean(destination.qris_storage_path)
    : Boolean(destination.account_number);
  const websiteOtsDestination = otsPaymentDestinations.find((destination) => destination.is_active && isOtsDestinationSuitable(destination)) ?? null;
  const otherOtsDestinations = otsPaymentDestinations.filter((destination) => !destination.is_active && isOtsDestinationSuitable(destination));
  const selectedOtherOtsDestination = otherOtsDestinations.find((destination) => destination.id === otsForm.payment_destination_id) ?? null;
  const otsQrisUrl = (path: string) => supabase.storage.from('standupindo-media').getPublicUrl(path).data.publicUrl;
  async function copyOtsAccountNumber(accountNumber: string) {
    try {
      await navigator.clipboard.writeText(accountNumber);
      setCopiedOtsAccount(accountNumber);
      setOtsCopyError('');
    } catch (copyError) {
      console.error('Nomor rekening OTS gagal disalin.', copyError);
      setCopiedOtsAccount('');
      setOtsCopyError('Nomor rekening gagal disalin. Silakan salin secara manual.');
    }
  }
  function showOtsQris(path: string | null, recipient: string) {
    if (!path) return;
    setPosterPreview({ src: otsQrisUrl(path), alt: `QRIS ${recipient}` });
  }
  const otsRemaining = selectedOtsCategory?.quota == null ? null : Math.max(0, selectedOtsCategory.quota - quotaOrders
    .filter((order) => order.ticket_id === selectedOtsCategory.id)
    .reduce((total, order) => total + order.quantity, 0));
  const selectedFreePassCategory = freePassCategories.find((category) => category.id === freePassForm.ticket_id) ?? null;
  const freePassRemaining = selectedFreePassCategory?.quota == null ? null : Math.max(0, selectedFreePassCategory.quota - quotaOrders
    .filter((order) => order.ticket_id === selectedFreePassCategory.id)
    .reduce((total, order) => total + order.quantity, 0));
  const otsQuantityLimit = Math.min(10, otsRemaining ?? 10);
  const freePassQuantityLimit = Math.min(10, freePassRemaining ?? 10);
  const otsFieldStates = {
    full_name: {
      error: otsTouched.full_name || otsValidationSubmitted ? getContactFieldError('full_name', otsForm.full_name) : '',
      valid: (otsTouched.full_name || otsValidationSubmitted) && Boolean(otsForm.full_name.trim()) && !getContactFieldError('full_name', otsForm.full_name),
    },
    whatsapp: {
      error: otsTouched.whatsapp || otsValidationSubmitted ? getContactFieldError('whatsapp', otsForm.whatsapp) : '',
      valid: (otsTouched.whatsapp || otsValidationSubmitted) && Boolean(otsForm.whatsapp.trim()) && !getContactFieldError('whatsapp', otsForm.whatsapp),
    },
  };
  const freePassFieldStates = {
    full_name: {
      error: freePassTouched.full_name || freePassValidationSubmitted ? getContactFieldError('full_name', freePassForm.full_name) : '',
      valid: (freePassTouched.full_name || freePassValidationSubmitted) && Boolean(freePassForm.full_name.trim()) && !getContactFieldError('full_name', freePassForm.full_name),
    },
    whatsapp: {
      error: freePassTouched.whatsapp || freePassValidationSubmitted ? getContactFieldError('whatsapp', freePassForm.whatsapp) : '',
      valid: (freePassTouched.whatsapp || freePassValidationSubmitted) && Boolean(freePassForm.whatsapp.trim()) && !getContactFieldError('whatsapp', freePassForm.whatsapp),
    },
    email: {
      error: freePassTouched.email || freePassValidationSubmitted ? getOptionalEmailError(freePassForm.email) : '',
      valid: (freePassTouched.email || freePassValidationSubmitted) && Boolean(freePassForm.email.trim()) && !getOptionalEmailError(freePassForm.email),
    },
  };
  const canCreateOts = eligibleOtsEvents.some((event) => eventFilter === 'all' || event.id === eventFilter);
  const canCreateFreePass = eligibleFreePassEvents.some((event) => eventFilter === 'all' || event.id === eventFilter);
  const visibleEventIds = useMemo(() => new Set(visibleEvents.map((event) => event.id)), [visibleEvents]);
  const eventOptions = visibleEvents;
  const otsEventOptions = eligibleOtsEvents.map((event) => ({ id: event.id, title: event.title, subtitle: formatDate(event.date), poster: event.poster }));
  const freePassEventOptions = eligibleFreePassEvents.map((event) => ({ id: event.id, title: event.title, subtitle: formatDate(event.date), poster: event.poster }));
  const eventSummaries = useMemo(() => visibleEvents
    .filter((event) => eventFilter === 'all' || event.id === eventFilter)
    .map((event) => {
      const eventCategories = categories.filter((category) => category.event_id === event.id);
      const eventTickets = tickets.filter((ticket) => ticket.event_id === event.id
        && (ticket.status === 'active' || ticket.status === 'expired' || Boolean(ticket.checked_in_at)));
      const totalQuota = eventCategories.reduce((total, category) => total + (category.quota ?? 0), 0);
      const unlimited = eventCategories.some((category) => category.quota === null);
      return {
        ...event,
        categories: eventCategories.map((category) => {
          const sold = eventTickets.filter((ticket) => ticket.event_ticket_id === category.id).length;
          return { ...category, sold, remaining: category.quota === null ? null : Math.max(0, category.quota - sold) };
        }),
        sold: eventTickets.length,
        quota: unlimited ? null : totalQuota,
        remaining: unlimited ? null : Math.max(0, totalQuota - eventTickets.length),
      };
    }), [categories, eventFilter, tickets, visibleEvents]);
  const filteredTickets = useMemo(() => tickets.filter((ticket) => {
    const query = search.trim().toLowerCase();
    const matchesQuery = !query || [ticket.order.full_name, ticket.order.whatsapp, ticket.order.order_number ?? '', ticket.event.title, ticket.order.ticket_category].join(' ').toLowerCase().includes(query);
    const matchesEvent = visibleEventIds.has(ticket.event_id) && (eventFilter === 'all' || ticket.event_id === eventFilter);
    const used = Boolean(ticket.checked_in_at);
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'used' ? used : statusFilter === 'expired' ? ticket.status === 'expired' : ticket.status === 'active' && !used);
    return matchesQuery && matchesEvent && matchesStatus;
  }), [eventFilter, search, statusFilter, tickets, visibleEventIds]);
  const orderGroups = useMemo(() => {
    const groups = new Map<string, TicketOrderGroup>();
    filteredTickets.forEach((ticket) => {
      let group = groups.get(ticket.ticket_order_id);
      if (!group) {
        group = {
          id: ticket.ticket_order_id,
          orderNumber: ticket.order.order_number ?? ticket.ticket_order_id,
          fullName: ticket.order.full_name,
          whatsapp: ticket.order.whatsapp,
          category: ticket.order.ticket_category,
          orderType: ticket.order.order_type,
          saleChannel: ticket.order.sale_channel,
          freePassReason: ticket.order.free_pass_reason,
          event: ticket.event,
          tickets: [],
          usedCount: 0,
          expiredCount: 0,
        };
        groups.set(group.id, group);
      }
      group.tickets.push(ticket);
      if (ticket.checked_in_at) group.usedCount += 1;
      if (ticket.status === 'expired') group.expiredCount += 1;
    });
    return [...groups.values()];
  }, [filteredTickets]);
  const pageOrders = orderGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [eventFilter, search, statusFilter]);
  useEffect(() => {
    if (!issuanceMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !issuanceMenuRef.current?.contains(event.target)) setIssuanceMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIssuanceMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [issuanceMenuOpen]);
  useEffect(() => {
    if (eventFilter !== 'all' && !visibleEventIds.has(eventFilter)) setEventFilter('all');
  }, [eventFilter, visibleEventIds]);
  useEffect(() => {
    if (page > Math.max(1, Math.ceil(orderGroups.length / PAGE_SIZE))) setPage(1);
  }, [orderGroups.length, page]);

  function openFreePassForm() {
    const defaultEvent = eligibleFreePassEvents.find((event) => event.id === eventFilter) ?? eligibleFreePassEvents[0];
    const defaultCategory = categories.find((category) => category.event_id === defaultEvent?.id && category.status === 'active');
    setFreePassResult(null);
    setFreePassError('');
    setFreePassTouched({ full_name: false, whatsapp: false, email: false });
    setFreePassValidationSubmitted(false);
    setFreePassForm({
      event_id: defaultEvent?.id ?? '',
      ticket_id: defaultCategory?.id ?? '',
      full_name: '',
      email: '',
      whatsapp: '',
      quantity: '1',
      reason: '',
    });
    setFreePassOpen(true);
  }

  function availableOtsCategoriesFor(eventId: string) {
    return categories.filter((category) => {
      if (category.event_id !== eventId || category.status !== 'active' || !category.available_ots || category.ots_price == null) return false;
      return category.quota == null || category.quota - quotaOrders
        .filter((order) => order.ticket_id === category.id)
        .reduce((total, order) => total + order.quantity, 0) > 0;
    });
  }

  function openOtsForm() {
    const defaultEvent = eligibleOtsEvents.find((event) => event.id === eventFilter) ?? eligibleOtsEvents[0];
    const defaultCategory = availableOtsCategoriesFor(defaultEvent?.id ?? '')[0];
    setOtsResult(null);
    setOtsError('');
    setOtsTouched({ full_name: false, whatsapp: false });
    setOtsValidationSubmitted(false);
    setOtsForm({
      event_id: defaultEvent?.id ?? '',
      ticket_id: defaultCategory?.id ?? '',
      full_name: '',
      whatsapp: '',
      quantity: '1',
      payment_method: 'cash',
      payment_source: 'website',
      payment_destination_id: '',
      custom_recipient_name: '',
      custom_bank_name: '',
      custom_account_number: '',
      custom_qris_recipient_name: '',
      custom_qris_identifier: '',
      custom_note: '',
    });
    setOtsOpen(true);
  }

  async function issueOtsSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOtsValidationSubmitted(true);
    setOtsTouched({ full_name: true, whatsapp: true });
    const nameError = getContactFieldError('full_name', otsForm.full_name);
    const whatsappError = getContactFieldError('whatsapp', otsForm.whatsapp);
    if (nameError || whatsappError) {
      window.setTimeout(() => document.getElementById(nameError ? 'ots-name' : 'ots-whatsapp')?.focus(), 0);
      return;
    }
    if (!otsForm.event_id || !otsForm.ticket_id) {
      setOtsError('Pilih Event dan kategori tiket.');
      return;
    }
    if (!Number.isInteger(Number(otsForm.quantity)) || Number(otsForm.quantity) < 1 || Number(otsForm.quantity) > otsQuantityLimit) {
      setOtsError(otsQuantityLimit > 0
        ? `Jumlah tiket harus antara 1 dan ${otsQuantityLimit}.`
        : 'Kuota kategori tiket sudah habis.');
      return;
    }
    if (otsForm.payment_method !== 'cash') {
      if (otsForm.payment_source === 'website' && !websiteOtsDestination) {
        setOtsError('Tidak ada tujuan website yang sesuai. Pilih tujuan lain atau lengkapi Informasi Pembayaran Event.');
        return;
      }
      if (otsForm.payment_source === 'other' && otsForm.payment_destination_id !== 'manual' && !selectedOtherOtsDestination) {
        setOtsError('Pilih tujuan pembayaran lain yang tersedia.');
        return;
      }
      if (otsForm.payment_source === 'other' && otsForm.payment_destination_id === 'manual') {
        if (!otsForm.custom_recipient_name.trim()) {
          setOtsError('Nama penerima tujuan pembayaran wajib diisi.');
          return;
        }
        if (otsForm.payment_method === 'bank_transfer' && !otsForm.custom_account_number.trim()) {
          setOtsError('Nomor rekening tujuan transfer wajib diisi.');
          return;
        }
        if (otsForm.payment_method === 'qris' && !otsForm.custom_qris_identifier.trim()) {
          setOtsError('Identitas QRIS tujuan wajib diisi.');
          return;
        }
      }
    }
    setOtsSaving(true);
    setOtsError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ticketing-admin', {
        body: {
          action: 'issue-ots-sale',
          event_id: otsForm.event_id,
          ticket_id: otsForm.ticket_id,
          full_name: otsForm.full_name.trim(),
          whatsapp: otsForm.whatsapp,
          quantity: Number(otsForm.quantity),
          ots_payment_method: otsForm.payment_method,
          ots_payment_source: otsForm.payment_method === 'cash' ? null : otsForm.payment_source,
          ots_payment_method_id: otsForm.payment_method === 'cash' ? null
            : otsForm.payment_source === 'website' ? websiteOtsDestination?.id
              : otsForm.payment_destination_id === 'manual' ? null : otsForm.payment_destination_id,
          ots_custom_destination: otsForm.payment_source === 'other' && otsForm.payment_destination_id === 'manual' ? {
            recipient_name: otsForm.custom_recipient_name,
            bank_name: otsForm.custom_bank_name,
            account_number: otsForm.custom_account_number,
            qris_recipient_name: otsForm.custom_qris_recipient_name,
            qris_identifier: otsForm.custom_qris_identifier,
            note: otsForm.custom_note,
          } : undefined,
        },
      });
      let actionError = invokeError?.message ?? '';
      if (invokeError) {
        const context = (invokeError as Error & { context?: Response }).context;
        if (context && typeof context.json === 'function') {
          try {
            const response = await context.json() as { error?: string };
            actionError = response.error ?? actionError;
          } catch {
            actionError = invokeError.message;
          }
        }
      }
      if (actionError || !data || typeof data.order_number !== 'string' || typeof data.access_code !== 'string'
        || typeof data.unit_price !== 'number' || typeof data.total_price !== 'number'
        || !Array.isArray(data.tickets) || !data.tickets.every((ticket: unknown) => {
          if (!ticket || typeof ticket !== 'object') return false;
          const ticketRow = ticket as Record<string, unknown>;
          return typeof ticketRow.id === 'string'
            && typeof ticketRow.sequence_no === 'number'
            && typeof ticketRow.qr_token === 'string';
        })
        || typeof data.full_name !== 'string' || typeof data.category !== 'string'
        || !data.event || typeof data.event.title !== 'string' || typeof data.event.date !== 'string'
        || typeof data.whatsapp_message !== 'string' || data.payment_status !== 'pending') {
        setOtsError(actionError || 'Penjualan OTS gagal diterbitkan.');
        return;
      }
      setOtsResult({
        order_number: data.order_number,
        access_code: data.access_code,
        whatsapp_url: typeof data.whatsapp_url === 'string' ? data.whatsapp_url : null,
        whatsapp_message: data.whatsapp_message,
        ticket_count: typeof data.ticket_count === 'number' ? data.ticket_count : Number(otsForm.quantity),
        unit_price: data.unit_price,
        total_price: data.total_price,
        tickets: data.tickets,
        full_name: data.full_name,
        payment_status: data.payment_status,
        category: data.category,
        event: {
          title: data.event.title,
          date: data.event.date,
          time: typeof data.event.time === 'string' ? data.event.time : '',
          venue: typeof data.event.venue === 'string' ? data.event.venue : '',
          location: typeof data.event.location === 'string' ? data.event.location : null,
          poster: typeof data.event.poster === 'string' ? data.event.poster : null,
          event_rules: typeof data.event.event_rules === 'string' ? data.event.event_rules : null,
        },
      });
      setOtsPdfMessage('');
      setOtsPdfFallbackReady(false);
      await refresh();
    } catch (actionError) {
      setOtsError(actionError instanceof Error ? `Penjualan OTS gagal: ${actionError.message}` : 'Penjualan OTS gagal.');
    } finally {
      setOtsSaving(false);
    }
  }

  async function createOtsTicketPdf() {
    if (!otsResult || otsResult.tickets.length !== otsResult.ticket_count) {
      throw new Error('Data QR tiket tidak lengkap. Muat ulang daftar tiket lalu coba lagi.');
    }
    const { createETicketPdfDocument } = await import('@/lib/ticket-pdf');
    const qrCanvases = new Map<string, HTMLCanvasElement>();
    otsResult.tickets.forEach((ticket) => {
      const canvas = document.getElementById(`ots-ticket-qr-${ticket.id}`);
      if (canvas instanceof HTMLCanvasElement) qrCanvases.set(ticket.id, canvas);
    });
    const pdf = await createETicketPdfDocument({
      event: otsResult.event,
      order: {
        id: otsResult.order_number,
        order_number: otsResult.order_number,
        full_name: otsResult.full_name,
        ticket_category: otsResult.category,
        quantity: otsResult.ticket_count,
        unit_price: otsResult.unit_price,
      },
      tickets: otsResult.tickets,
      qrCanvases,
    });
    return { blob: pdf.output('blob'), filename: `E-Tiket-OTS-${otsResult.order_number}.pdf` };
  }

  function saveOtsPdf(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadOtsPdf() {
    setOtsPdfBusy(true);
    setOtsPdfMessage('');
    setOtsPdfFallbackReady(false);
    void createOtsTicketPdf().then(({ blob, filename }) => {
      saveOtsPdf(blob, filename);
      setOtsPdfMessage('PDF tiket berhasil diunduh.');
    }).catch((error: unknown) => {
      setOtsPdfMessage(error instanceof Error ? `PDF tiket gagal dibuat: ${error.message}` : 'PDF tiket gagal dibuat.');
    }).finally(() => setOtsPdfBusy(false));
  }

  async function shareOtsPdf() {
    if (!otsResult) return;
    if (!otsResult.whatsapp_url || otsResult.whatsapp_url === '#') {
      setOtsPdfMessage('Nomor WhatsApp penerima tidak tersedia. Periksa kembali data penjualan OTS.');
      return;
    }
    setOtsPdfBusy(true);
    setOtsPdfMessage('');
    setOtsPdfFallbackReady(false);
    const whatsappWindow = window.open('about:blank', '_blank');
    if (whatsappWindow) whatsappWindow.opener = null;
    try {
      const { blob, filename } = await createOtsTicketPdf();
      saveOtsPdf(blob, filename);
      if (whatsappWindow) whatsappWindow.location.href = otsResult.whatsapp_url;
      else setOtsPdfFallbackReady(true);
      setOtsPdfMessage(whatsappWindow
        ? 'PDF berhasil diunduh dan chat WhatsApp penerima langsung dibuka. Lampirkan PDF yang baru diunduh sebelum mengirim.'
        : 'PDF berhasil diunduh, tetapi browser memblokir pembukaan WhatsApp otomatis. Buka WhatsApp melalui tombol di bawah, lalu lampirkan PDF sebelum mengirim.');
    } catch (error) {
      whatsappWindow?.close();
      setOtsPdfMessage(error instanceof Error ? `PDF tiket gagal dibuat: ${error.message}` : 'PDF tiket gagal dibuat.');
    } finally {
      setOtsPdfBusy(false);
    }
  }

  async function issueFreePass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFreePassValidationSubmitted(true);
    setFreePassTouched({ full_name: true, whatsapp: true, email: true });
    const nameError = getContactFieldError('full_name', freePassForm.full_name);
    const whatsappError = getContactFieldError('whatsapp', freePassForm.whatsapp);
    const emailError = getOptionalEmailError(freePassForm.email);
    if (nameError || whatsappError || emailError) {
      window.setTimeout(() => {
        document.getElementById(nameError ? 'free-pass-name' : whatsappError ? 'free-pass-whatsapp' : 'free-pass-email')?.focus();
      }, 0);
      return;
    }
    if (!freePassForm.event_id || !freePassForm.ticket_id || !freePassForm.reason.trim()) {
      setFreePassError('Lengkapi Event, kategori, dan alasan Free Pass.');
      return;
    }
    if (!Number.isInteger(Number(freePassForm.quantity)) || Number(freePassForm.quantity) < 1 || Number(freePassForm.quantity) > freePassQuantityLimit) {
      setFreePassError(freePassQuantityLimit > 0
        ? `Jumlah tiket harus antara 1 dan ${freePassQuantityLimit}.`
        : 'Kuota kategori tiket sudah habis.');
      return;
    }
    setFreePassSaving(true);
    setFreePassError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ticketing-admin', {
        body: {
          action: 'issue-free-pass',
          event_id: freePassForm.event_id,
          ticket_id: freePassForm.ticket_id,
          full_name: freePassForm.full_name.trim(),
          email: freePassForm.email.trim() || null,
          whatsapp: freePassForm.whatsapp,
          quantity: Number(freePassForm.quantity),
          free_pass_reason: freePassForm.reason.trim(),
        },
      });
      let actionError = invokeError?.message ?? '';
      if (invokeError) {
        const context = (invokeError as Error & { context?: Response }).context;
        if (context && typeof context.json === 'function') {
          try {
            const response = await context.json() as { error?: string };
            actionError = response.error ?? actionError;
          } catch {
            actionError = invokeError.message;
          }
        }
      }
      if (actionError || !data || typeof data.order_number !== 'string' || typeof data.access_code !== 'string') {
        setFreePassError(actionError || 'Free Pass gagal diterbitkan.');
        return;
      }
      setFreePassResult({
        order_number: data.order_number,
        access_code: data.access_code,
        whatsapp_url: typeof data.whatsapp_url === 'string' ? data.whatsapp_url : null,
        ticket_count: typeof data.ticket_count === 'number' ? data.ticket_count : Number(freePassForm.quantity),
        email_status: data.email_status === 'sent' || data.email_status === 'failed' ? data.email_status : 'skipped',
        email_message: typeof data.email_message === 'string' ? data.email_message : 'Status email tidak tersedia.',
      });
      await refresh();
    } catch (actionError) {
      setFreePassError(actionError instanceof Error ? `Permintaan Free Pass gagal: ${actionError.message}` : 'Permintaan Free Pass gagal.');
    } finally {
      setFreePassSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <TicketWorkspaceHeader
        title="Tiket"
        subtitle="Daftar tiket yang diterbitkan melalui penjualan OTS maupun Free Pass."
        action={<div ref={issuanceMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setIssuanceMenuOpen((open) => !open)}
            disabled={loading || (!canCreateOts && !canCreateFreePass)}
            aria-haspopup="menu"
            aria-expanded={issuanceMenuOpen}
            aria-label="Pilih jenis penerbitan tiket"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-800 shadow-sm transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-60"
            title="Pilih jenis penerbitan tiket"
          >
            <Plus className={`h-5 w-5 transition-transform ${issuanceMenuOpen ? 'rotate-45' : ''}`} />
          </button>
          {issuanceMenuOpen && <div role="menu" aria-label="Pilih jenis penerbitan tiket" className="absolute right-0 top-full z-40 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
            {canCreateOts && <button type="button" role="menuitem" onClick={() => { setIssuanceMenuOpen(false); openOtsForm(); }} className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-bold text-slate-800 transition hover:bg-blue-50 hover:text-blue-800">
              <Store className="h-4 w-4 text-blue-700" />Penjualan OTS
            </button>}
            {canCreateFreePass && <button type="button" role="menuitem" onClick={() => { setIssuanceMenuOpen(false); openFreePassForm(); }} className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-bold text-slate-800 transition hover:bg-amber-50 hover:text-amber-900">
              <Gift className="h-4 w-4 text-amber-700" />Free Pass
            </button>}
          </div>}
        </div>}
      />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_190px]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input-field pl-10" placeholder="Cari nama, WhatsApp, order..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><SearchableEventSelect options={eventOptions} value={eventFilter} onChange={setEventFilter} allLabel="Semua Event" ariaLabel="Filter Event Tiket" /><select className="admin-ticket-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">Semua Status</option><option value="unused">Belum Digunakan</option><option value="used">Sudah Digunakan</option><option value="expired">Expired</option></select></div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {!loading && eventSummaries.length > 0 && <section className="space-y-3">
        <div className="flex items-end justify-between gap-2"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Ringkasan Kuota</p><h2 className="text-lg font-black text-slate-950">{eventFilter === 'all' ? 'Per Event' : eventSummaries[0].title}</h2></div><span className="text-xs font-semibold text-slate-500">{eventSummaries.length} EVENT</span></div>
        <div className="space-y-3">{eventSummaries.map((event) => (
          <article key={event.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-3 sm:px-4">
              {event.poster ? (
                <button type="button" onClick={() => { if (event.poster) setPosterPreview({ src: event.poster, alt: `Poster ${event.title}` }); }} aria-label={`Lihat poster ${event.title}`} title="Lihat poster" className="group relative h-14 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                  <img src={event.poster} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-110" />
                  <span className="absolute inset-0 flex items-center justify-center bg-slate-950/0 text-white transition group-hover:bg-slate-950/35"><Eye className="h-4 w-4 opacity-0 drop-shadow group-hover:opacity-100" /></span>
                </button>
              ) : <span aria-hidden="true" className="flex h-14 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-blue-50 text-[9px] font-extrabold uppercase tracking-wide text-blue-700">Event</span>}
              <div className="min-w-0">
                <h3 className="line-clamp-2 text-sm font-extrabold leading-5 text-slate-950">{event.title}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{formatDate(event.date)}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 p-3">
              <div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Dijual</p><p className="mt-1 text-base font-black text-slate-900">{event.quota === null ? '∞' : event.quota}<span className="ml-1 text-[10px] font-bold text-slate-500">{event.quota === null ? 'tanpa batas' : 'tiket'}</span></p></div>
              <div className="rounded-xl bg-blue-50 p-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Diterbitkan</p><p className="mt-1 text-base font-black text-blue-800">{event.sold}<span className="ml-1 text-[10px] font-bold">tiket</span></p></div>
              <div className="rounded-xl bg-emerald-50 p-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Sisa</p><p className="mt-1 text-base font-black text-emerald-800">{event.remaining === null ? '∞' : event.remaining}<span className="ml-1 text-[10px] font-bold">{event.remaining === null ? 'tanpa batas' : 'tiket'}</span></p></div>
            </div>
            <div className="space-y-2 px-3 pb-3">
              <p className="px-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Kategori Tiket</p>
              {event.categories.length ? event.categories.map((category) => (
                <div key={category.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
                  <div className="min-w-0"><p className="truncate text-xs font-extrabold uppercase text-slate-900">{category.name}</p><p className="mt-0.5 text-[10px] font-semibold text-slate-500">{category.quota === null ? 'Kuota tanpa batas' : `Kuota ${category.quota}`} · {category.sold} diterbitkan</p></div>
                  <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-extrabold ${category.remaining === 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>{category.remaining === null ? '∞ SISA' : `${category.remaining} SISA`}</span>
                </div>
              )) : <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">Belum ada kategori tiket.</p>}
            </div>
          </article>
        ))}</div>
      </section>}
      <ImageLightbox src={posterPreview?.src ?? ''} alt={posterPreview?.alt ?? ''} open={Boolean(posterPreview)} onClose={() => setPosterPreview(null)} />
      <Modal
        open={otsOpen}
        onClose={() => {
          if (otsSaving || otsPdfBusy) return;
          setOtsOpen(false);
          setOtsResult(null);
          setOtsError('');
        }}
        title={otsResult ? 'Penjualan OTS berhasil' : 'Penjualan OTS'}
        size="lg"
      >
        {otsResult ? <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-amber-900"><Check className="h-5 w-5" /><p className="font-extrabold">Tiket OTS diterbitkan; pembayaran menunggu konfirmasi.</p></div>
            <p className="mt-2 text-sm leading-6 text-amber-900">{otsResult.ticket_count} tiket dengan QR unik. Total transaksi Rp{otsResult.total_price.toLocaleString('id-ID')} dicatat sebagai belum diterima sampai Admin Tiketing mengonfirmasikannya.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Nomor Order</p><p className="mt-1 break-all font-mono text-sm font-extrabold text-blue-800">{otsResult.order_number}</p></div>
            <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Harga Satuan OTS</p><p className="mt-1 text-sm font-extrabold text-slate-900">Rp{otsResult.unit_price.toLocaleString('id-ID')}</p></div>
            <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Kode Akses</p><p className="mt-1 font-mono text-lg font-black tracking-wider text-emerald-800">{otsResult.access_code}</p></div>
          </div>
          <div className="fixed left-[-10000px] top-0" aria-hidden="true">
                  {otsResult.tickets.map((ticket) => <QRCodeCanvas key={ticket.id} id={`ots-ticket-qr-${ticket.id}`} value={ticket.qr_token} size={256} level="H" />)}
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
            Setiap tiket dibuat sebagai satu halaman PDF dengan QR unik. Tombol kirim akan mengunduh PDF dan langsung membuka chat WhatsApp ke nomor penerima; lampirkan PDF di chat sebelum mengirim.
          </div>
          {otsPdfMessage && <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">{otsPdfMessage}</p>}
          {otsPdfFallbackReady && otsResult.whatsapp_url && <a href={otsResult.whatsapp_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-800"><MessageCircle className="h-4 w-4" />Buka WhatsApp untuk mengirim</a>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={otsPdfBusy} onClick={() => { setOtsOpen(false); setOtsResult(null); }} className="btn-secondary min-h-11 w-full sm:w-auto">Selesai</button>
            <button type="button" onClick={downloadOtsPdf} disabled={otsPdfBusy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-extrabold text-blue-800 shadow-sm transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60 sm:w-auto"><Download className="h-4 w-4" />Unduh PDF Tiket</button>
            <button type="button" onClick={() => void shareOtsPdf()} disabled={otsPdfBusy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60 sm:w-auto"><Share2 className="h-4 w-4" />{otsPdfBusy ? 'Menyiapkan PDF...' : 'Kirim PDF via WhatsApp'}</button>
          </div>
        </div> : <form noValidate onSubmit={(event) => void issueOtsSale(event)} className="space-y-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
            Pilih kategori yang aktif dan tersedia untuk OTS. Harga diambil otomatis dari harga OTS kategori dan kuota bersama online/OTS akan diperiksa saat transaksi.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-700">Event
              <div className="mt-1">
                <SearchableEventSelect
                  options={otsEventOptions}
                  value={otsForm.event_id}
                  onChange={(nextEventId) => {
                const firstCategory = availableOtsCategoriesFor(nextEventId)[0];
                setOtsForm((current) => ({ ...current, event_id: nextEventId, ticket_id: firstCategory?.id ?? '', quantity: '1', payment_destination_id: '' }));
                  }}
                  allLabel="Pilih Event"
                  ariaLabel="Event Penjualan OTS"
                />
              </div>
            </label>
            <label className="block text-xs font-bold text-slate-700">Kategori Tiket
              <select required value={otsForm.ticket_id} onChange={(event) => setOtsForm((current) => ({ ...current, ticket_id: event.target.value, quantity: '1' }))} className="input-field mt-1" disabled={!otsForm.event_id}>
                <option value="">Pilih kategori</option>
                {otsCategories.map((category) => {
                  const committed = quotaOrders.filter((order) => order.ticket_id === category.id).reduce((total, order) => total + order.quantity, 0);
                  const remaining = category.quota == null ? null : Math.max(0, category.quota - committed);
                  return <option key={category.id} value={category.id}>{category.name} · Rp{category.ots_price?.toLocaleString('id-ID')}{remaining == null ? ' · kuota tanpa batas' : ` · sisa ${remaining}`}</option>;
                })}
              </select>
            </label>
            <ValidatedContactInput
              id="ots-name"
              name="name"
              label="Nama Pembeli"
              value={otsForm.full_name}
              placeholder="Nama sesuai identitas"
              autoComplete="name"
              required
              maxLength={160}
              validation={otsFieldStates.full_name}
              onChange={(full_name) => setOtsForm((current) => ({ ...current, full_name }))}
              onBlur={() => setOtsTouched((current) => ({ ...current, full_name: true }))}
            />
            <ValidatedContactInput
              id="ots-whatsapp"
              name="tel"
              label="Nomor WhatsApp"
              type="tel"
              inputMode="tel"
              value={otsForm.whatsapp}
              placeholder="08xxxxxxxxxx"
              autoComplete="tel"
              required
              validation={otsFieldStates.whatsapp}
              onChange={(whatsapp) => setOtsForm((current) => ({ ...current, whatsapp }))}
              onBlur={() => setOtsTouched((current) => ({ ...current, whatsapp: true }))}
            />
            <label className="block text-xs font-bold text-slate-700">
              <span className="block">Jumlah Tiket</span>
              <TicketQuantityStepper value={otsForm.quantity} max={otsQuantityLimit} disabled={!selectedOtsCategory || otsQuantityLimit < 1} onChange={(quantity) => setOtsForm((current) => ({ ...current, quantity }))} />
              <span className="mt-1 block text-[11px] font-medium text-slate-500">{selectedOtsCategory ? `Maksimal ${otsQuantityLimit} tiket per penjualan.` : 'Pilih kategori tiket terlebih dahulu.'}</span>
            </label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total OTS</p>
              <p className="mt-1 text-lg font-black text-blue-800">Rp{((selectedOtsCategory?.ots_price ?? 0) * Number(otsForm.quantity)).toLocaleString('id-ID')}</p>
            </div>
          </div>
          <fieldset className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
            <legend className="px-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">Metode Pembayaran</legend>
            <div className="grid grid-cols-3 gap-2">
              {([
                ['cash', 'Cash / Tunai', Banknote],
                ['qris', 'QRIS Statis', QrCode],
                ['bank_transfer', 'Transfer Bank', Building2],
              ] as const).map(([method, label, Icon]) => <label key={method} className={`relative flex min-h-[76px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-2 text-center text-[11px] font-bold leading-tight transition-colors sm:min-h-14 sm:flex-row sm:gap-2 sm:px-3 sm:text-xs ${otsForm.payment_method === method ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-sm ring-1 ring-blue-200' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50/50'}`}>
                <input
                  type="radio"
                  name="ots-payment-method"
                  className="sr-only"
                  checked={otsForm.payment_method === method}
                  onChange={() => setOtsForm((current) => ({ ...current, payment_method: method, payment_source: websiteOtsDestination ? 'website' : 'other', payment_destination_id: '' }))}
                />
                <Icon className={`h-4 w-4 shrink-0 ${otsForm.payment_method === method ? 'text-blue-700' : 'text-slate-400'}`} aria-hidden="true" />
                {label}
                {otsForm.payment_method === method && <CheckCircle2 className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-blue-700" aria-hidden="true" />}
              </label>)}
            </div>
          </fieldset>
          {otsForm.payment_method !== 'cash' && <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
            <fieldset className="space-y-2">
              <legend className="text-xs font-extrabold text-slate-800">Sumber Pembayaran</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-colors ${otsForm.payment_source === 'website' ? 'border-blue-400 bg-blue-50 text-blue-800 ring-1 ring-blue-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'} ${!websiteOtsDestination || otsPaymentDestinationsLoading ? 'cursor-not-allowed opacity-50' : ''}`}>
                  <input type="radio" name="ots-payment-source" checked={otsForm.payment_source === 'website'} disabled={!websiteOtsDestination || otsPaymentDestinationsLoading} onChange={() => setOtsForm((current) => ({ ...current, payment_source: 'website', payment_destination_id: '' }))} className="accent-blue-700" />
                  <span className="min-w-0"><span className="block">Website</span><span className="mt-0.5 block text-[10px] font-medium opacity-70">Tujuan aktif</span></span>
                </label>
                <label className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-colors ${otsForm.payment_source === 'other' ? 'border-blue-400 bg-blue-50 text-blue-800 ring-1 ring-blue-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                  <input type="radio" name="ots-payment-source" checked={otsForm.payment_source === 'other'} onChange={() => setOtsForm((current) => ({ ...current, payment_source: 'other', payment_destination_id: '' }))} className="accent-blue-700" />
                  <span className="min-w-0"><span className="block">Tujuan Lain</span><span className="mt-0.5 block text-[10px] font-medium opacity-70">Pilih atau input</span></span>
                </label>
              </div>
            </fieldset>
            {otsPaymentDestinationsLoading && <p role="status" className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">Memuat tujuan pembayaran...</p>}
            {otsForm.payment_source === 'website' && websiteOtsDestination && <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-950">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-blue-700">Tujuan Website</p>
              <p className="mt-1.5 break-words font-extrabold">{otsForm.payment_method === 'qris' ? websiteOtsDestination.qris_recipient_name || websiteOtsDestination.recipient_name : websiteOtsDestination.recipient_name}</p>
              {otsForm.payment_method === 'qris'
                ? <div className="mt-2 flex items-center gap-3">
                  {websiteOtsDestination.qris_storage_path && <button type="button" onClick={() => showOtsQris(websiteOtsDestination.qris_storage_path, websiteOtsDestination.qris_recipient_name || websiteOtsDestination.recipient_name)} className="group flex min-h-14 items-center gap-2 rounded-lg border border-blue-200 bg-white p-1.5 pr-3 text-left transition hover:border-blue-400 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                    <img src={otsQrisUrl(websiteOtsDestination.qris_storage_path)} alt="" className="h-11 w-11 rounded-md object-contain" />
                    <span><span className="block font-bold text-blue-800">Lihat QRIS</span><span className="mt-0.5 block text-[10px] font-medium text-slate-500">Ketuk untuk memperbesar</span></span>
                  </button>}
                  {!websiteOtsDestination.qris_storage_path && <p className="text-blue-800">QRIS Statis</p>}
                </div>
                : <div className="mt-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">{websiteOtsDestination.bank_name || 'Nomor Rekening'}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-blue-100 bg-white py-1.5 pl-2.5 pr-1.5">
                    <span className="min-w-0 break-all font-mono text-sm font-bold tracking-wide text-slate-800">{websiteOtsDestination.account_number}</span>
                    <button type="button" onClick={() => void copyOtsAccountNumber(websiteOtsDestination.account_number ?? '')} aria-label={copiedOtsAccount === websiteOtsDestination.account_number ? 'Nomor rekening tersalin' : 'Salin nomor rekening'} title={copiedOtsAccount === websiteOtsDestination.account_number ? 'Nomor rekening tersalin' : 'Salin nomor rekening'} className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${copiedOtsAccount === websiteOtsDestination.account_number ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                      {copiedOtsAccount === websiteOtsDestination.account_number ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>}
            </div>}
            {otsForm.payment_source === 'other' && <>
              <label className="block text-xs font-bold text-slate-700">
                Pilih Tujuan
                <select value={otsForm.payment_destination_id} onChange={(event) => setOtsForm((current) => ({ ...current, payment_destination_id: event.target.value }))} className="input-field mt-1">
                  <option value="">Pilih tujuan tersimpan</option>
                  {otherOtsDestinations.map((destination) => <option key={destination.id} value={destination.id}>
                    {otsForm.payment_method === 'qris' ? destination.qris_recipient_name || destination.recipient_name : `${destination.recipient_name} · ${destination.bank_name || 'Bank'} ${destination.account_number}`}
                  </option>)}
                  <option value="manual">+ Input tujuan baru</option>
                </select>
              </label>
              {selectedOtherOtsDestination && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Detail Tujuan</p>
                <p className="mt-1.5 break-words font-extrabold text-slate-900">{otsForm.payment_method === 'qris' ? selectedOtherOtsDestination.qris_recipient_name || selectedOtherOtsDestination.recipient_name : selectedOtherOtsDestination.recipient_name}</p>
                {otsForm.payment_method === 'qris'
                  ? <div className="mt-2">
                    {selectedOtherOtsDestination.qris_storage_path
                      ? <button type="button" onClick={() => showOtsQris(selectedOtherOtsDestination.qris_storage_path, selectedOtherOtsDestination.qris_recipient_name || selectedOtherOtsDestination.recipient_name)} className="group flex min-h-14 items-center gap-2 rounded-lg border border-slate-200 bg-white p-1.5 pr-3 text-left transition hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                        <img src={otsQrisUrl(selectedOtherOtsDestination.qris_storage_path)} alt="" className="h-11 w-11 rounded-md object-contain" />
                        <span><span className="block text-xs font-bold text-blue-800">Lihat QRIS</span><span className="mt-0.5 block text-[10px] font-medium text-slate-500">Ketuk untuk memperbesar</span></span>
                      </button>
                      : <p className="text-slate-600">QRIS Statis</p>}
                  </div>
                  : <div className="mt-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{selectedOtherOtsDestination.bank_name || 'Nomor Rekening'}</p>
                    <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-1.5">
                      <span className="min-w-0 break-all font-mono text-sm font-bold tracking-wide text-slate-800">{selectedOtherOtsDestination.account_number}</span>
                      <button type="button" onClick={() => void copyOtsAccountNumber(selectedOtherOtsDestination.account_number ?? '')} aria-label={copiedOtsAccount === selectedOtherOtsDestination.account_number ? 'Nomor rekening tersalin' : 'Salin nomor rekening'} title={copiedOtsAccount === selectedOtherOtsDestination.account_number ? 'Nomor rekening tersalin' : 'Salin nomor rekening'} className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${copiedOtsAccount === selectedOtherOtsDestination.account_number ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                        {copiedOtsAccount === selectedOtherOtsDestination.account_number ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>}
              </div>}
              {otsForm.payment_destination_id === 'manual' && <div className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3 sm:grid-cols-2">
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-blue-800 sm:col-span-2">Informasi Tujuan Baru</p>
                <label className="text-xs font-semibold text-slate-700">Nama Penerima
                  <input required maxLength={160} value={otsForm.custom_recipient_name} onChange={(event) => setOtsForm((current) => ({ ...current, custom_recipient_name: event.target.value }))} className="input-field mt-1" placeholder="Nama pemilik tujuan" />
                </label>
                {otsForm.payment_method === 'bank_transfer' ? <>
                  <label className="text-xs font-semibold text-slate-700">Nama Bank
                    <input maxLength={120} value={otsForm.custom_bank_name} onChange={(event) => setOtsForm((current) => ({ ...current, custom_bank_name: event.target.value }))} className="input-field mt-1" placeholder="Contoh: BCA" />
                  </label>
                  <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Nomor Rekening
                    <input required maxLength={80} value={otsForm.custom_account_number} onChange={(event) => setOtsForm((current) => ({ ...current, custom_account_number: event.target.value }))} className="input-field mt-1" placeholder="Nomor rekening tujuan" />
                  </label>
                </> : <>
                  <label className="text-xs font-semibold text-slate-700">Nama Merchant QRIS
                    <input maxLength={160} value={otsForm.custom_qris_recipient_name} onChange={(event) => setOtsForm((current) => ({ ...current, custom_qris_recipient_name: event.target.value }))} className="input-field mt-1" placeholder="Nama yang tampil di QRIS" />
                  </label>
                  <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Identitas QRIS
                    <input required maxLength={160} value={otsForm.custom_qris_identifier} onChange={(event) => setOtsForm((current) => ({ ...current, custom_qris_identifier: event.target.value }))} className="input-field mt-1" placeholder="Contoh: nama penyedia atau ID merchant" />
                  </label>
                </>}
                <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Catatan (Opsional)
                  <input maxLength={300} value={otsForm.custom_note} onChange={(event) => setOtsForm((current) => ({ ...current, custom_note: event.target.value }))} className="input-field mt-1" placeholder="Catatan tujuan pembayaran" />
                </label>
              </div>}
            </>}
          </div>}
          {otsCopyError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700">{otsCopyError}</p>}
          {otsError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{otsError}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
            <button type="button" disabled={otsSaving} onClick={() => setOtsOpen(false)} className="btn-secondary min-h-11 w-full sm:w-auto">Batal</button>
            <button type="submit" disabled={otsSaving || otsPaymentDestinationsLoading || !eligibleOtsEvents.length || !selectedOtsCategory || otsQuantityLimit < 1 || (otsForm.payment_method !== 'cash' && otsForm.payment_source === 'website' && !websiteOtsDestination) || (otsForm.payment_method !== 'cash' && otsForm.payment_source === 'other' && !otsForm.payment_destination_id)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60 sm:w-auto">
              <Store className="h-4 w-4" />{otsSaving ? 'Menerbitkan tiket...' : 'Simpan Penjualan OTS'}
            </button>
          </div>
        </form>}
      </Modal>
      <Modal
        open={freePassOpen}
        onClose={() => {
          if (freePassSaving) return;
          setFreePassOpen(false);
          setFreePassResult(null);
          setFreePassError('');
        }}
        title={freePassResult ? 'Free Pass berhasil diterbitkan' : 'Terbitkan Free Pass'}
        size="lg"
      >
        {freePassResult ? <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-emerald-800"><Check className="h-5 w-5" /><p className="font-extrabold">Tiket masuk ke catatan Event sebagai Free Pass.</p></div>
            <p className="mt-2 text-sm leading-6 text-emerald-900">{freePassResult.ticket_count} tiket sudah diterbitkan dengan QR unik. Order ini tidak menambah pendapatan penjualan.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Nomor Order</p><p className="mt-1 break-all font-mono text-sm font-extrabold text-blue-800">{freePassResult.order_number}</p></div>
            <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Kode Akses Penerima</p><p className="mt-1 font-mono text-lg font-black tracking-wider text-emerald-800">{freePassResult.access_code}</p></div>
          </div>
          <div className={`rounded-xl border p-3 text-sm font-semibold ${freePassResult.email_status === 'sent' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : freePassResult.email_status === 'failed' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
            <p className="flex items-center gap-2">{freePassResult.email_status === 'sent' ? <Mail className="h-4 w-4" /> : <Mail className="h-4 w-4" />}{freePassResult.email_message}</p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => { setFreePassOpen(false); setFreePassResult(null); }} className="btn-secondary min-h-11 w-full sm:w-auto">Selesai</button>
            {freePassResult.whatsapp_url && <a href={freePassResult.whatsapp_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-800 sm:w-auto"><MessageCircle className="h-4 w-4" />Kirim akses via WhatsApp</a>}
          </div>
        </div> : <form noValidate onSubmit={(event) => void issueFreePass(event)} className="space-y-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
            Free Pass akan tercatat pada order dan daftar tiket dengan label khusus. Kuota tiket tetap terpakai, tetapi nominalnya tidak masuk laporan pendapatan.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-700">Event
              <div className="mt-1">
                <SearchableEventSelect
                  options={freePassEventOptions}
                  value={freePassForm.event_id}
                  onChange={(nextEventId) => {
                const firstCategory = categories.find((category) => category.event_id === nextEventId && category.status === 'active');
                setFreePassForm((current) => ({ ...current, event_id: nextEventId, ticket_id: firstCategory?.id ?? '', quantity: '1' }));
                  }}
                  allLabel="Pilih Event"
                  ariaLabel="Event Free Pass"
                />
              </div>
            </label>
            <label className="block text-xs font-bold text-slate-700">Kategori Tiket
              <select required value={freePassForm.ticket_id} onChange={(event) => setFreePassForm((current) => ({ ...current, ticket_id: event.target.value, quantity: '1' }))} className="input-field mt-1" disabled={!freePassForm.event_id}>
                <option value="">Pilih kategori</option>
                {freePassCategories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.quota === null ? ' · kuota tanpa batas' : ` · kuota ${category.quota}`}</option>)}
              </select>
            </label>
            <ValidatedContactInput
              id="free-pass-name"
              name="name"
              label="Nama Penerima"
              value={freePassForm.full_name}
              placeholder="Nama sesuai identitas"
              autoComplete="name"
              required
              maxLength={160}
              validation={freePassFieldStates.full_name}
              onChange={(full_name) => setFreePassForm((current) => ({ ...current, full_name }))}
              onBlur={() => setFreePassTouched((current) => ({ ...current, full_name: true }))}
            />
            <ValidatedContactInput
              id="free-pass-whatsapp"
              name="tel"
              label="Nomor WhatsApp"
              type="tel"
              inputMode="tel"
              value={freePassForm.whatsapp}
              placeholder="08xxxxxxxxxx"
              autoComplete="tel"
              required
              validation={freePassFieldStates.whatsapp}
              onChange={(whatsapp) => setFreePassForm((current) => ({ ...current, whatsapp }))}
              onBlur={() => setFreePassTouched((current) => ({ ...current, whatsapp: true }))}
            />
            <div>
              <ValidatedContactInput
                id="free-pass-email"
                name="email"
                label="Email Penerima (Opsional)"
                type="email"
                value={freePassForm.email}
                placeholder="nama@email.com"
                autoComplete="email"
                validation={freePassFieldStates.email}
                onChange={(email) => setFreePassForm((current) => ({ ...current, email }))}
                onBlur={() => setFreePassTouched((current) => ({ ...current, email: true }))}
              />
              <span className="mt-1 block text-[11px] font-medium leading-4 text-slate-500">Jika diisi, informasi Free Pass dan Kode Akses dikirim otomatis lewat email.</span>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              <span className="block">Jumlah Tiket</span>
              <TicketQuantityStepper value={freePassForm.quantity} max={freePassQuantityLimit} disabled={!selectedFreePassCategory || freePassQuantityLimit < 1} onChange={(quantity) => setFreePassForm((current) => ({ ...current, quantity }))} />
              <span className="mt-1 block text-[11px] font-medium text-slate-500">{freePassQuantityLimit > 0 ? `Maksimal ${freePassQuantityLimit} tiket per penerbitan.` : 'Kuota kategori tiket sudah habis.'}</span>
            </label>
            <label className="block text-xs font-bold text-slate-700 sm:col-span-2">Sumber / Alasan Free Pass
              <textarea required maxLength={300} rows={2} value={freePassForm.reason} onChange={(event) => setFreePassForm((current) => ({ ...current, reason: event.target.value }))} className="input-field mt-1 resize-y" placeholder="Contoh: Media partner — Cilegon Update" />
              <span className="mt-1 block text-right text-[11px] font-medium text-slate-500">{freePassForm.reason.length}/300</span>
            </label>
          </div>
          {freePassError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{freePassError}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
            <button type="button" disabled={freePassSaving} onClick={() => setFreePassOpen(false)} className="btn-secondary min-h-11 w-full sm:w-auto">Batal</button>
            <button type="submit" disabled={freePassSaving || !eligibleFreePassEvents.length || !selectedFreePassCategory || freePassQuantityLimit < 1} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60 sm:w-auto">
              <Gift className="h-4 w-4" />{freePassSaving ? 'Menerbitkan tiket...' : 'Terbitkan Free Pass'}
            </button>
          </div>
        </form>}
      </Modal>
      {loading ? <div className="h-24 skeleton rounded-2xl" /> : !filteredTickets.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada tiket individual terbit untuk filter ini.</div> : <div className="space-y-2">{pageOrders.map((group) => {
        const expanded = expandedOrders.has(group.id);
        const unusedCount = group.tickets.filter((ticket) => ticket.status === 'active' && !ticket.checked_in_at).length;
        return <article key={group.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start gap-3 p-3 sm:p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white"><Ticket className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">No. Order</span>
                <span className="break-all font-mono text-xs font-extrabold text-blue-800">{group.orderNumber}</span>
              </div>
              <h2 className="mt-1 truncate text-sm font-extrabold text-slate-950">{group.fullName}</h2>
              <p className="mt-0.5 truncate text-xs text-slate-600">{group.event.title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-slate-300 px-2 py-1 text-[10px] font-bold uppercase text-slate-800">{group.category}</span>
                <span className="rounded-md bg-blue-700 px-2 py-1 text-[10px] font-extrabold tracking-wide text-white">{group.tickets.length} TIKET</span>
                {group.saleChannel === 'ots' && <span className="rounded-md bg-violet-100 px-2 py-1 text-[10px] font-extrabold tracking-wide text-violet-800">OTS</span>}
                {group.orderType === 'free_pass' && <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-[10px] font-extrabold tracking-wide text-amber-900"><Gift className="h-3 w-3" /> FREE PASS</span>}
                {group.usedCount > 0 && <span className="text-[10px] font-bold text-slate-600">{group.usedCount} SUDAH CHECK-IN</span>}
                {group.expiredCount > 0 && <span className="text-[10px] font-bold text-red-700">{group.expiredCount} EXPIRED</span>}
                {unusedCount > 0 && <span className="text-[10px] font-bold text-emerald-800">{unusedCount} BELUM CHECK-IN</span>}
              </div>
            </div>
            <button type="button" onClick={() => setExpandedOrders((current) => {
              const next = new Set(current);
              if (next.has(group.id)) next.delete(group.id);
              else next.add(group.id);
              return next;
            })} aria-expanded={expanded} aria-label={`${expanded ? 'Tutup' : 'Lihat'} tiket order ${group.orderNumber}`} title={expanded ? 'Tutup rincian tiket' : 'Lihat rincian tiket'} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition hover:bg-slate-700">
              {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
          </div>
          {expanded && <div className="space-y-2 border-t border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap justify-between gap-1 text-[11px] text-slate-600"><span>WhatsApp: <strong className="text-slate-900">{group.whatsapp}</strong></span><span>{formatDate(group.event.date)}</span></div>
            {group.orderType === 'free_pass' && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><span className="font-bold">Free Pass</span>{group.freePassReason ? ` · ${group.freePassReason}` : ''}</p>}
            {group.tickets.map((ticket) => <div key={ticket.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div><p className="text-xs font-bold text-slate-900">{group.category.toUpperCase()} · TIKET {ticket.sequence_no}</p>{ticket.checked_in_at && <p className="mt-0.5 text-[10px] text-slate-500">Check-in {new Date(ticket.checked_in_at).toLocaleString('id-ID')}</p>}</div>
              <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold ${ticket.checked_in_at ? 'bg-slate-800 text-white' : ticket.status === 'expired' ? 'bg-red-100 text-red-700' : ticket.status === 'revoked' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-700 text-white'}`}>{ticket.checked_in_at ? 'SUDAH DIGUNAKAN' : ticket.status === 'expired' ? 'EXPIRED' : ticket.status === 'revoked' ? 'NONAKTIF' : 'BELUM DIGUNAKAN'}</span>
            </div>)}
          </div>}
        </article>;
      })}</div>}
      <TicketPagination page={page} pageSize={PAGE_SIZE} total={orderGroups.length} onPageChange={setPage} />
    </div>
  );
}