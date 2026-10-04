import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, ChevronDown, ChevronUp, Eye, Gift, Mail, MessageCircle, Plus, Search, Ticket } from 'lucide-react';
import { formatDate, getEventStatus, normalizeWhatsappNumber } from '@/lib/format';
import type { EventStatus } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { TicketPagination } from '@/components/TicketPagination';
import { TicketWorkspaceHeader } from '@/pages/admin/TicketWorkspaceHeader';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { SearchableEventSelect } from '@/components/ui/SearchableEventSelect';
import { Modal } from '@/components/ui/Modal';

const PAGE_SIZE = 30;

interface TicketRow {
  id: string;
  event_id: string;
  ticket_order_id: string;
  event_ticket_id: string | null;
  sequence_no: number;
  status: 'active' | 'revoked' | 'expired';
  checked_in_at: string | null;
  issued_at: string;
  order: { order_number: string | null; full_name: string; whatsapp: string; ticket_category: string; order_type: 'paid' | 'free_pass'; free_pass_reason: string | null };
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
}

interface TicketOrderGroup {
  id: string;
  orderNumber: string;
  fullName: string;
  whatsapp: string;
  category: string;
  orderType: 'paid' | 'free_pass';
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
        return { tickets: [] as TicketRow[], events: [] as TicketEvent[], categories: [] as EventTicketCategory[], error: response.error ?? error.message };
      } catch {
        return { tickets: [] as TicketRow[], events: [] as TicketEvent[], categories: [] as EventTicketCategory[], error: error.message };
      }
    }
    return { tickets: [] as TicketRow[], events: [] as TicketEvent[], categories: [] as EventTicketCategory[], error: error.message };
  }
  const [eventsResult, categoriesResult] = await Promise.all([
    supabase.from('events').select('id, title, poster, status, date').order('date', { ascending: false }),
    supabase.from('event_tickets').select('id, event_id, name, quota, status, sort_order')
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
  ]);
  if (eventsResult.error) return { tickets: (data?.tickets as TicketRow[]) ?? [], events: [] as TicketEvent[], categories: [] as EventTicketCategory[], error: `Daftar Event gagal dimuat: ${eventsResult.error.message}` };
  if (categoriesResult.error) return { tickets: (data?.tickets as TicketRow[]) ?? [], events: (eventsResult.data as TicketEvent[]) ?? [], categories: [] as EventTicketCategory[], error: `Kategori tiket gagal dimuat: ${categoriesResult.error.message}` };
  return {
    tickets: (data?.tickets as TicketRow[]) ?? [],
    events: (eventsResult.data as TicketEvent[]) ?? [],
    categories: (categoriesResult.data as EventTicketCategory[]) ?? [],
    error: null as string | null,
  };
}

export function TicketAdminTicketsPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [categories, setCategories] = useState<EventTicketCategory[]>([]);
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

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await loadTickets();
    setLoading(false);
    setTickets(result.tickets);
    setEvents(result.events);
    setCategories(result.categories);
    setError(result.error ?? '');
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const visibleEvents = useMemo(() => events.filter((event) => getEventStatus(event.status, event.date) !== 'completed'
    && categories.some((category) => category.event_id === event.id)), [categories, events]);
  const eligibleFreePassEvents = useMemo(() => visibleEvents.filter((event) => event.status === 'upcoming'
    && categories.some((category) => category.event_id === event.id && category.status === 'active')), [categories, visibleEvents]);
  const freePassCategories = useMemo(() => categories.filter((category) => category.event_id === freePassForm.event_id
    && category.status === 'active'), [categories, freePassForm.event_id]);
  const visibleEventIds = useMemo(() => new Set(visibleEvents.map((event) => event.id)), [visibleEvents]);
  const eventOptions = visibleEvents;
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

  async function issueFreePass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!freePassForm.event_id || !freePassForm.ticket_id || !freePassForm.full_name.trim()
      || !freePassForm.whatsapp.trim() || !freePassForm.reason.trim()) {
      setFreePassError('Lengkapi Event, kategori, nama, WhatsApp, dan alasan Free Pass.');
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
        subtitle="Daftar tiket yang diterbitkan untuk pembelian maupun Free Pass."
        action={<button type="button" onClick={openFreePassForm} disabled={!eligibleFreePassEvents.length || loading} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-blue-800 shadow-sm transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:text-sm" title={eligibleFreePassEvents.length ? 'Terbitkan tiket Free Pass' : 'Belum ada Event aktif dengan kategori tiket'}><Gift className="h-4 w-4" /><span className="hidden sm:inline">Buat Free Pass</span><span className="sm:hidden">Free Pass</span><Plus className="h-3.5 w-3.5" /></button>}
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
              <select required value={freePassForm.event_id} onChange={(event) => {
                const nextEventId = event.target.value;
                const firstCategory = categories.find((category) => category.event_id === nextEventId && category.status === 'active');
                setFreePassForm((current) => ({ ...current, event_id: nextEventId, ticket_id: firstCategory?.id ?? '' }));
              }} className="input-field mt-1">
                <option value="">Pilih Event</option>
                {eligibleFreePassEvents.map((event) => <option key={event.id} value={event.id}>{event.title} · {formatDate(event.date)}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold text-slate-700">Kategori tiket
              <select required value={freePassForm.ticket_id} onChange={(event) => setFreePassForm((current) => ({ ...current, ticket_id: event.target.value }))} className="input-field mt-1" disabled={!freePassForm.event_id}>
                <option value="">Pilih kategori</option>
                {freePassCategories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.quota === null ? ' · kuota tanpa batas' : ` · kuota ${category.quota}`}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold text-slate-700">Nama penerima
              <input required maxLength={160} value={freePassForm.full_name} onChange={(event) => setFreePassForm((current) => ({ ...current, full_name: event.target.value }))} className="input-field mt-1" placeholder="Nama sesuai identitas" />
            </label>
            <label className="block text-xs font-bold text-slate-700">Nomor WhatsApp
              <input required type="tel" inputMode="numeric" autoComplete="tel" value={freePassForm.whatsapp} onChange={(event) => setFreePassForm((current) => ({ ...current, whatsapp: event.target.value.replace(/\D/g, '') }))} className="input-field mt-1" placeholder="Contoh: 081234567890" />
            </label>
            <label className="block text-xs font-bold text-slate-700">Email penerima <span className="font-medium text-slate-400">(opsional)</span>
              <input type="email" autoComplete="email" value={freePassForm.email} onChange={(event) => setFreePassForm((current) => ({ ...current, email: event.target.value }))} className="input-field mt-1" placeholder="nama@email.com" />
              <span className="mt-1 block text-[11px] font-medium leading-4 text-slate-500">Jika diisi, informasi Free Pass dan Kode Akses dikirim otomatis lewat email.</span>
            </label>
            <label className="block text-xs font-bold text-slate-700">Jumlah tiket
              <select required value={freePassForm.quantity} onChange={(event) => setFreePassForm((current) => ({ ...current, quantity: event.target.value }))} className="input-field mt-1">
                {Array.from({ length: 10 }, (_, index) => index + 1).map((quantity) => <option key={quantity} value={quantity}>{quantity} tiket</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold text-slate-700 sm:col-span-2">Sumber / alasan Free Pass
              <textarea required maxLength={300} rows={2} value={freePassForm.reason} onChange={(event) => setFreePassForm((current) => ({ ...current, reason: event.target.value }))} className="input-field mt-1 resize-y" placeholder="Contoh: Media partner — Cilegon Update" />
              <span className="mt-1 block text-right text-[11px] font-medium text-slate-500">{freePassForm.reason.length}/300</span>
            </label>
          </div>
          {freePassError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{freePassError}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
            <button type="button" disabled={freePassSaving} onClick={() => setFreePassOpen(false)} className="btn-secondary min-h-11 w-full sm:w-auto">Batal</button>
            <button type="submit" disabled={freePassSaving || !eligibleFreePassEvents.length} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60 sm:w-auto">
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