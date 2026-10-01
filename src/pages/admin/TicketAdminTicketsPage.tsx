import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, Search, Ticket } from 'lucide-react';
import { formatDate, getEventStatus } from '@/lib/format';
import type { EventStatus } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { TicketPagination } from '@/components/TicketPagination';
import { TicketWorkspaceHeader } from '@/pages/admin/TicketWorkspaceHeader';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { SearchableEventSelect } from '@/components/ui/SearchableEventSelect';

const PAGE_SIZE = 30;

interface TicketRow {
  id: string;
  event_id: string;
  ticket_order_id: string;
  event_ticket_id: string | null;
  sequence_no: number;
  status: 'active' | 'revoked';
  checked_in_at: string | null;
  issued_at: string;
  order: { order_number: string | null; full_name: string; whatsapp: string; ticket_category: string };
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
  event: TicketRow['event'];
  tickets: TicketRow[];
  usedCount: number;
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'unused' | 'used'>('all');
  const [page, setPage] = useState(1);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(() => new Set());
  const [posterPreview, setPosterPreview] = useState<{ src: string; alt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
  const visibleEventIds = useMemo(() => new Set(visibleEvents.map((event) => event.id)), [visibleEvents]);
  const eventOptions = visibleEvents;
  const eventSummaries = useMemo(() => visibleEvents
    .filter((event) => eventFilter === 'all' || event.id === eventFilter)
    .map((event) => {
      const eventCategories = categories.filter((category) => category.event_id === event.id);
      const eventTickets = tickets.filter((ticket) => ticket.event_id === event.id
        && (ticket.status === 'active' || Boolean(ticket.checked_in_at)));
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
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'used' ? used : !used);
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
          event: ticket.event,
          tickets: [],
          usedCount: 0,
        };
        groups.set(group.id, group);
      }
      group.tickets.push(ticket);
      if (ticket.checked_in_at) group.usedCount += 1;
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

  return (
    <div className="space-y-5">
      <TicketWorkspaceHeader title="Tiket" subtitle="Tiket individual yang telah diterbitkan untuk order lunas." />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_190px]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input-field pl-10" placeholder="Cari nama, WhatsApp, order..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><SearchableEventSelect options={eventOptions} value={eventFilter} onChange={setEventFilter} allLabel="Semua Event" ariaLabel="Filter Event Tiket" /><select className="admin-ticket-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">Semua Status</option><option value="unused">Belum Digunakan</option><option value="used">Sudah Digunakan</option></select></div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {!loading && eventSummaries.length > 0 && <section className="space-y-3">
        <div className="flex items-end justify-between gap-2"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Ringkasan Penjualan</p><h2 className="text-lg font-black text-slate-950">{eventFilter === 'all' ? 'Per Event' : eventSummaries[0].title}</h2></div><span className="text-xs font-semibold text-slate-500">{eventSummaries.length} EVENT</span></div>
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
              <div className="rounded-xl bg-blue-50 p-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Terjual</p><p className="mt-1 text-base font-black text-blue-800">{event.sold}<span className="ml-1 text-[10px] font-bold">tiket</span></p></div>
              <div className="rounded-xl bg-emerald-50 p-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Sisa</p><p className="mt-1 text-base font-black text-emerald-800">{event.remaining === null ? '∞' : event.remaining}<span className="ml-1 text-[10px] font-bold">{event.remaining === null ? 'tanpa batas' : 'tiket'}</span></p></div>
            </div>
            <div className="space-y-2 px-3 pb-3">
              <p className="px-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Kategori Tiket</p>
              {event.categories.length ? event.categories.map((category) => (
                <div key={category.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
                  <div className="min-w-0"><p className="truncate text-xs font-extrabold uppercase text-slate-900">{category.name}</p><p className="mt-0.5 text-[10px] font-semibold text-slate-500">{category.quota === null ? 'Kuota tanpa batas' : `Kuota ${category.quota}`} · {category.sold} terjual</p></div>
                  <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-extrabold ${category.remaining === 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>{category.remaining === null ? '∞ SISA' : `${category.remaining} SISA`}</span>
                </div>
              )) : <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">Belum ada kategori tiket.</p>}
            </div>
          </article>
        ))}</div>
      </section>}
      <ImageLightbox src={posterPreview?.src ?? ''} alt={posterPreview?.alt ?? ''} open={Boolean(posterPreview)} onClose={() => setPosterPreview(null)} />
      {loading ? <div className="h-24 skeleton rounded-2xl" /> : !filteredTickets.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada tiket individual terbit untuk filter ini.</div> : <div className="space-y-2">{pageOrders.map((group) => {
        const expanded = expandedOrders.has(group.id);
        const unusedCount = group.tickets.length - group.usedCount;
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
                {group.usedCount > 0 && <span className="text-[10px] font-bold text-slate-600">{group.usedCount} SUDAH CHECK-IN</span>}
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
            {group.tickets.map((ticket) => <div key={ticket.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div><p className="text-xs font-bold text-slate-900">{group.category.toUpperCase()} · TIKET {ticket.sequence_no}</p>{ticket.checked_in_at && <p className="mt-0.5 text-[10px] text-slate-500">Check-in {new Date(ticket.checked_in_at).toLocaleString('id-ID')}</p>}</div>
              <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold ${ticket.checked_in_at ? 'bg-slate-800 text-white' : 'bg-emerald-700 text-white'}`}>{ticket.checked_in_at ? 'SUDAH DIGUNAKAN' : 'BELUM DIGUNAKAN'}</span>
            </div>)}
          </div>}
        </article>;
      })}</div>}
      <TicketPagination page={page} pageSize={PAGE_SIZE} total={orderGroups.length} onPageChange={setPage} />
    </div>
  );
}