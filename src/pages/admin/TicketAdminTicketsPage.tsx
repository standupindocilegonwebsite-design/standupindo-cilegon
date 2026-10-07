import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Download, Eye, Gift, Mail, MessageCircle, Plus, Search, Share2, Store, Ticket } from 'lucide-react';
import { formatDate, getEventStatus, normalizeWhatsappNumber } from '@/lib/format';
import type { EventStatus } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { TicketPagination } from '@/components/TicketPagination';
import { TicketWorkspaceHeader } from '@/pages/admin/TicketWorkspaceHeader';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { SearchableEventSelect } from '@/components/ui/SearchableEventSelect';
import { Modal } from '@/components/ui/Modal';

const PAGE_SIZE = 30;

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
  const [otsPdfBusy, setOtsPdfBusy] = useState(false);
  const [otsPdfMessage, setOtsPdfMessage] = useState('');
  const [otsPdfFallbackReady, setOtsPdfFallbackReady] = useState(false);
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
    category: string;
    event: { title: string; date: string; time: string; venue: string; location: string | null; poster: string | null; event_rules: string | null };
  } | null>(null);
  const [otsForm, setOtsForm] = useState({ event_id: '', ticket_id: '', full_name: '', whatsapp: '', quantity: '1' });

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
  const otsRemaining = selectedOtsCategory?.quota == null ? null : Math.max(0, selectedOtsCategory.quota - quotaOrders
    .filter((order) => order.ticket_id === selectedOtsCategory.id)
    .reduce((total, order) => total + order.quantity, 0));
  const selectedFreePassCategory = freePassCategories.find((category) => category.id === freePassForm.ticket_id) ?? null;
  const freePassRemaining = selectedFreePassCategory?.quota == null ? null : Math.max(0, selectedFreePassCategory.quota - quotaOrders
    .filter((order) => order.ticket_id === selectedFreePassCategory.id)
    .reduce((total, order) => total + order.quantity, 0));
  const otsQuantityLimit = Math.min(10, otsRemaining ?? 10);
  const freePassQuantityLimit = Math.min(10, freePassRemaining ?? 10);
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
    setOtsForm({
      event_id: defaultEvent?.id ?? '',
      ticket_id: defaultCategory?.id ?? '',
      full_name: '',
      whatsapp: '',
      quantity: '1',
    });
    setOtsOpen(true);
  }

  async function issueOtsSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!otsForm.event_id || !otsForm.ticket_id || !otsForm.full_name.trim() || !otsForm.whatsapp.trim()) {
      setOtsError('Lengkapi Event, kategori, nama, dan nomor WhatsApp.');
      return;
    }
    if (!Number.isInteger(Number(otsForm.quantity)) || Number(otsForm.quantity) < 1 || Number(otsForm.quantity) > otsQuantityLimit) {
      setOtsError(otsQuantityLimit > 0
        ? `Jumlah tiket harus antara 1 dan ${otsQuantityLimit}.`
        : 'Kuota kategori tiket sudah habis.');
      return;
    }
    if (normalizeWhatsappNumber(otsForm.whatsapp).length < 10) {
      setOtsError('Nomor WhatsApp penerima tidak valid.');
      return;
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
        || !Array.isArray(data.tickets) || !data.tickets.every((ticket: unknown) => Boolean(ticket)
          && typeof ticket.id === 'string' && typeof ticket.sequence_no === 'number' && typeof ticket.qr_token === 'string')
        || typeof data.full_name !== 'string' || typeof data.category !== 'string'
        || !data.event || typeof data.event.title !== 'string' || typeof data.event.date !== 'string'
        || typeof data.whatsapp_message !== 'string') {
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
    if (!freePassForm.event_id || !freePassForm.ticket_id || !freePassForm.full_name.trim()
      || !freePassForm.whatsapp.trim() || !freePassForm.reason.trim()) {
      setFreePassError('Lengkapi Event, kategori, nama, WhatsApp, dan alasan Free Pass.');
      return;
    }
    if (!Number.isInteger(Number(freePassForm.quantity)) || Number(freePassForm.quantity) < 1 || Number(freePassForm.quantity) > freePassQuantityLimit) {
      setFreePassError(freePassQuantityLimit > 0
        ? `Jumlah tiket harus antara 1 dan ${freePassQuantityLimit}.`
        : 'Kuota kategori tiket sudah habis.');
      return;
    }
    if (normalizeWhatsappNumber(freePassForm.whatsapp).length < 10) {
      setFreePassError('Nomor WhatsApp penerima tidak valid.');
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
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-emerald-800"><Check className="h-5 w-5" /><p className="font-extrabold">Order lunas dan tiket OTS sudah diterbitkan.</p></div>
            <p className="mt-2 text-sm leading-6 text-emerald-900">{otsResult.ticket_count} tiket dengan QR unik. Total transaksi Rp{otsResult.total_price.toLocaleString('id-ID')} tercatat sebagai OTS.</p>
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
        </div> : <form onSubmit={(event) => void issueOtsSale(event)} className="space-y-4">
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
                setOtsForm((current) => ({ ...current, event_id: nextEventId, ticket_id: firstCategory?.id ?? '', quantity: '1' }));
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
            <label className="block text-xs font-bold text-slate-700">Nama Pembeli
              <input required maxLength={160} value={otsForm.full_name} onChange={(event) => setOtsForm((current) => ({ ...current, full_name: event.target.value }))} className="input-field mt-1" placeholder="Nama sesuai identitas" />
            </label>
            <label className="block text-xs font-bold text-slate-700">Nomor WhatsApp
              <input required type="tel" inputMode="numeric" autoComplete="tel" value={otsForm.whatsapp} onChange={(event) => setOtsForm((current) => ({ ...current, whatsapp: event.target.value.replace(/\D/g, '') }))} className="input-field mt-1" placeholder="Contoh: 081234567890" />
            </label>
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
          {otsError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{otsError}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
            <button type="button" disabled={otsSaving} onClick={() => setOtsOpen(false)} className="btn-secondary min-h-11 w-full sm:w-auto">Batal</button>
            <button type="submit" disabled={otsSaving || !eligibleOtsEvents.length || !selectedOtsCategory || otsQuantityLimit < 1} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60 sm:w-auto">
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
        </div> : <form onSubmit={(event) => void issueFreePass(event)} className="space-y-4">
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
            <label className="block text-xs font-bold text-slate-700">Nama Penerima
              <input required maxLength={160} value={freePassForm.full_name} onChange={(event) => setFreePassForm((current) => ({ ...current, full_name: event.target.value }))} className="input-field mt-1" placeholder="Nama sesuai identitas" />
            </label>
            <label className="block text-xs font-bold text-slate-700">Nomor WhatsApp
              <input required type="tel" inputMode="numeric" autoComplete="tel" value={freePassForm.whatsapp} onChange={(event) => setFreePassForm((current) => ({ ...current, whatsapp: event.target.value.replace(/\D/g, '') }))} className="input-field mt-1" placeholder="Contoh: 081234567890" />
            </label>
            <label className="block text-xs font-bold text-slate-700">Email Penerima <span className="font-medium text-slate-400">(Opsional)</span>
              <input type="email" autoComplete="email" value={freePassForm.email} onChange={(event) => setFreePassForm((current) => ({ ...current, email: event.target.value }))} className="input-field mt-1" placeholder="nama@email.com" />
              <span className="mt-1 block text-[11px] font-medium leading-4 text-slate-500">Jika diisi, informasi Free Pass dan Kode Akses dikirim otomatis lewat email.</span>
            </label>
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