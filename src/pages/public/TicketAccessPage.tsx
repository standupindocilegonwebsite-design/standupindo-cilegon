import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Download, History, KeyRound, LogOut, Maximize2, MessageCircle, Ticket, X, XCircle } from 'lucide-react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import type { Router } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { TicketPagination } from '@/components/TicketPagination';
import { LOGO_URL } from '@/lib/types';
import { formatDate, formatPrice, getEventStatus } from '@/lib/format';
import { downloadETicketPdf } from '@/lib/ticket-pdf';

const ORDER_PAGE_SIZE = 10;

interface TicketEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  venue: string;
  location?: string | null;
  status: 'upcoming' | 'completed' | 'cancelled';
  poster: string | null;
  event_rules?: string | null;
}

interface GuestOrder {
  id: string;
  order_number: string | null;
  full_name: string;
  ticket_category: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  created_at: string;
}

interface GuestOrderHistory extends GuestOrder {
  event_id: string;
  event: TicketEvent | null;
}

interface GuestTicket {
  id: string;
  ticket_order_id: string;
  sequence_no: number;
  status: 'Belum Digunakan' | 'Sudah Digunakan' | 'Tidak Aktif' | 'Event Dibatalkan' | 'Expired';
  checked_in_at: string | null;
  qr_token: string | null;
}

interface TicketSessionData {
  session_token: string;
  event: TicketEvent;
  event_cancelled?: boolean;
  orders: GuestOrder[];
  tickets: GuestTicket[];
  session_expires_at?: string;
}

async function ticketingAction<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('ticketing-public', { body });
  if (!error) return { data: data as T, error: null as string | null };
  const context = (error as Error & { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try {
      const payload = await context.json() as { error?: string; error_code?: string; session_conflict?: boolean };
      if (payload.session_conflict) return { data: payload as T, error: null };
      return { data: payload as T, error: payload.error ?? error.message };
    } catch {
      return { data: null as T, error: error.message };
    }
  }
  return { data: null as T, error: error.message };
}

function getDeviceTag() {
  const storageKey = 'standupindo-ticket-device';
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const value = crypto.randomUUID();
  sessionStorage.setItem(storageKey, value);
  return value;
}

export function TicketAccessPage({ router }: { router: Router }) {
  const [whatsapp, setWhatsapp] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [session, setSession] = useState<TicketSessionData | null>(null);
  const [ticketTab, setTicketTab] = useState<'tickets' | 'events' | 'history'>('tickets');
  const [history, setHistory] = useState<GuestOrderHistory[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [orderPage, setOrderPage] = useState(1);
  const [activeTicketIndexes, setActiveTicketIndexes] = useState<Record<string, number>>({});
  const [fullscreenTicketOrder, setFullscreenTicketOrder] = useState<string | null>(null);
  const [downloadingOrder, setDownloadingOrder] = useState<string | null>(null);
  const [downloadingTicket, setDownloadingTicket] = useState<string | null>(null);
  const [pdfErrors, setPdfErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastTouchAt = useRef(0);
  const ticketCarouselRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const ticketQrCanvases = useRef<Record<string, HTMLCanvasElement | null>>({});
  const visibleOrders = session?.orders.slice((orderPage - 1) * ORDER_PAGE_SIZE, orderPage * ORDER_PAGE_SIZE) ?? [];
  const purchasedEvents = Array.from((history ?? []).reduce((groups, order) => {
    if (!order.event) return groups;
    const existing = groups.get(order.event.id);
    if (existing) {
      existing.quantity += order.quantity;
      existing.total += order.total_price;
      existing.orderCount += 1;
    } else {
      groups.set(order.event.id, { event: order.event, quantity: order.quantity, total: order.total_price, orderCount: 1 });
    }
    return groups;
  }, new Map<string, { event: TicketEvent; quantity: number; total: number; orderCount: number }>()).values());

  useEffect(() => {
    if (orderPage > Math.max(1, Math.ceil((session?.orders.length ?? 0) / ORDER_PAGE_SIZE))) setOrderPage(1);
  }, [orderPage, session?.orders.length]);

  async function touchSession() {
    const token = session?.session_token ?? sessionStorage.getItem('standupindo-ticket-session');
    const now = Date.now();
    if (!token || now - lastTouchAt.current < 60000) return;
    lastTouchAt.current = now;
    const { data, error: touchError } = await ticketingAction<{ error_code?: string; error?: string }>({ action: 'touch-session', session_token: token });
    if (touchError || data?.error_code === 'session_expired') {
      sessionStorage.removeItem('standupindo-ticket-session');
      setSession(null);
      setError(data?.error ?? touchError ?? 'Sesi tiket sudah berakhir. Silakan login kembali.');
    }
  }

  async function refreshTickets(sessionToken: string) {
    const { data, error: loadError } = await ticketingAction<Omit<TicketSessionData, 'session_token'> & { error_code?: string; error?: string }>({ action: 'get-tickets', session_token: sessionToken });
    if (loadError || !data || data.error_code) {
      if (data?.error_code === 'event_completed') {
        sessionStorage.removeItem('standupindo-ticket-session');
        setSession(null);
        setError(data.error ?? 'Kode Akses sudah tidak berlaku karena Event telah selesai');
        return;
      }
      if (data?.error_code === 'session_expired') {
        sessionStorage.removeItem('standupindo-ticket-session');
        setSession(null);
        setError(data.error ?? 'Sesi tiket sudah berakhir. Silakan login kembali.');
        return;
      }
      setError(loadError ?? data?.error ?? 'Data tiket gagal dimuat.');
      return;
    }
    setSession((current) => current ? { ...current, ...data, session_token: sessionToken } : { ...data, session_token: sessionToken });
  }

  useEffect(() => {
    const storedToken = sessionStorage.getItem('standupindo-ticket-session');
    if (!storedToken) return;
    void refreshTickets(storedToken);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshTickets(storedToken);
    }, 20000);
    return () => window.clearInterval(interval);
  }, []);

  async function login(replaceExisting = false) {
    setLoading(true);
    setError('');
    const { data, error: loginError } = await ticketingAction<TicketSessionData & { session_conflict?: boolean; error_code?: string; error?: string }>({
      action: 'login',
      whatsapp,
      access_code: accessCode,
      device_tag: getDeviceTag(),
      replace_existing: replaceExisting,
    });
    if (data?.session_conflict && !replaceExisting) {
      setLoading(false);
      if (window.confirm('Kode Akses ini sedang digunakan di perangkat lain. Pindahkan sesi ke perangkat ini?')) await login(true);
      return;
    }
    if (loginError || !data?.session_token) {
      setLoading(false);
      const message = data?.error ?? loginError ?? 'Login tiket gagal.';
      setError(message.includes('Terlalu banyak percobaan')
        ? 'Terlalu banyak percobaan dari nomor ini atau jaringan yang sama. Tunggu beberapa menit sebelum mencoba lagi.'
        : message);
      return;
    }
    sessionStorage.setItem('standupindo-ticket-session', data.session_token);
    lastTouchAt.current = Date.now();
    setTicketTab('tickets');
    setHistory(null);
    setOrderPage(1);
    await refreshTickets(data.session_token);
    setLoading(false);
  }

  async function logout() {
    const token = session?.session_token ?? sessionStorage.getItem('standupindo-ticket-session');
    if (token) await ticketingAction({ action: 'logout', session_token: token });
    sessionStorage.removeItem('standupindo-ticket-session');
    setSession(null);
    setExpandedOrder(null);
    setOrderPage(1);
    setError('');
    setTicketTab('tickets');
    setHistory(null);
  }

  async function loadHistory() {
    const token = session?.session_token ?? sessionStorage.getItem('standupindo-ticket-session');
    if (!token) return;
    setHistoryLoading(true);
    setHistoryError('');
    const { data, error: loadError } = await ticketingAction<{ history?: GuestOrderHistory[]; error_code?: string; error?: string }>({
      action: 'get-ticket-history',
      session_token: token,
    });
    if (loadError || !data || data.error_code) {
      const serverMessage = data?.error ?? loadError ?? '';
      const message = serverMessage.includes('Action Ticketing tidak dikenal')
        ? 'Riwayat Event belum tersedia di server. Fungsi ticketing-public perlu diperbarui terlebih dahulu.'
        : serverMessage || 'Riwayat tiket gagal dimuat.';
      if (data?.error_code === 'session_expired') {
        sessionStorage.removeItem('standupindo-ticket-session');
        setSession(null);
        setError(message);
      } else {
        setHistoryError(message);
      }

      setHistoryLoading(false);
      return;
    }
    setHistory(data.history ?? []);
    setHistoryLoading(false);
  }

  async function downloadOrderTickets(order: GuestOrder) {
    if (!session) return;
    const tickets = session.tickets.filter((ticket) => ticket.ticket_order_id === order.id);
    setDownloadingOrder(order.id);
    setPdfErrors((current) => ({ ...current, [order.id]: '' }));
    try {
      const qrCanvases = new Map<string, HTMLCanvasElement>();
      tickets.forEach((ticket) => {
        const canvas = ticketQrCanvases.current[ticket.id];
        if (canvas) qrCanvases.set(ticket.id, canvas);
      });
      await downloadETicketPdf({
        event: session.event,
        order,
        tickets,
        qrCanvases,
      });
    } catch (downloadError) {
      setPdfErrors((current) => ({
        ...current,
        [order.id]: downloadError instanceof Error ? downloadError.message : 'E-Tiket gagal dibuat. Silakan coba lagi.',
      }));
    } finally {
      setDownloadingOrder(null);
    }
  }

  async function downloadSingleTicket(order: GuestOrder, ticket: GuestTicket) {
    if (!session) return;
    setDownloadingTicket(ticket.id);
    setPdfErrors((current) => ({ ...current, [order.id]: '' }));
    try {
      const qrCanvas = ticketQrCanvases.current[ticket.id];
      if (!ticket.qr_token || !qrCanvas) throw new Error(`QR untuk tiket ${ticket.sequence_no} belum siap. Buka detail tiket, lalu coba unduh kembali.`);
      await downloadETicketPdf({
        event: session.event,
        order,
        tickets: [ticket],
        qrCanvases: new Map([[ticket.id, qrCanvas]]),
      }, ticket.sequence_no);
    } catch (downloadError) {
      setPdfErrors((current) => ({
        ...current,
        [order.id]: downloadError instanceof Error ? downloadError.message : 'E-Tiket gagal dibuat. Silakan coba lagi.',
      }));
    } finally {
      setDownloadingTicket(null);
    }
  }

  function scrollToTicket(orderId: string, index: number) {
    const carousel = ticketCarouselRefs.current[orderId];
    const ticketCard = carousel?.children.item(index);
    if (!carousel || !(ticketCard instanceof HTMLElement)) return;
    carousel.scrollTo({ left: ticketCard.offsetLeft - carousel.offsetLeft, behavior: 'smooth' });
    setActiveTicketIndexes((current) => ({ ...current, [orderId]: index }));
  }

  return (
    <div className="animate-fade-in" onPointerDown={() => void touchSession()} onKeyDown={() => void touchSession()} onTouchStart={() => void touchSession()}>
      {session && <header className="sticky top-0 z-30 border-b border-blue-900/40 bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 text-white shadow-[0_4px_18px_rgba(15,23,42,0.18)]">
        <div className="container-app flex min-h-16 items-center justify-between gap-3 py-2.5 sm:min-h-[4.5rem]">
          <img src={LOGO_URL} alt="" className="h-10 w-10 shrink-0 rounded-xl border border-white/40 bg-white p-1 object-contain shadow-sm" />
          <div className="mr-auto min-w-0 pl-3 leading-tight">
            <p className="truncate text-sm font-black tracking-wide sm:text-base">STANDUPINDO</p>
            <p className="text-xs font-extrabold tracking-[0.12em] text-amber-200 sm:text-sm">CILEGON</p>
          </div>
          <button type="button" onClick={() => void logout()} aria-label="Keluar dari Tiket Saya" title="Keluar" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200/70 bg-white text-red-600 shadow-sm transition hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>}
      <div className={`container-app ${session ? 'bg-slate-200 py-5 pb-[calc(6rem+var(--safe-bottom))] sm:py-7 sm:pb-[calc(6rem+var(--safe-bottom))]' : 'min-h-screen w-full max-w-none px-0 py-0'}`}>
        {!session ? <div className="relative isolate flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#06264b] px-4 py-8 sm:px-6 sm:py-12">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,#0c3a6b_0%,#082c53_48%,#041a35_100%)]" />
          <div aria-hidden="true" className="pointer-events-none absolute -left-[12%] -top-[8%] h-[44%] w-[56%] -skew-x-[38deg] bg-gradient-to-br from-blue-400/20 via-blue-500/10 to-transparent" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-[18%] -right-[14%] h-[45%] w-[62%] -skew-x-[38deg] bg-gradient-to-tl from-blue-600/40 via-blue-500/15 to-transparent" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-[23%] -right-[20%] h-[34%] w-[68%] -skew-x-[38deg] border-t border-blue-400/15 bg-blue-500/10" />
          <div className="relative z-10 flex w-full flex-col items-center">
            <span className="ticket-access-logo mb-6 h-[4.5rem] w-[4.5rem] rounded-xl shadow-[0_0_28px_rgba(96,165,250,0.4)] sm:mb-7">
              <img src={LOGO_URL} alt="Standupindo Cilegon" className="relative z-0 h-full w-full rounded-xl bg-white p-1 object-contain shadow-lg" />
            </span>
            <section className="relative w-full max-w-[580px] overflow-hidden rounded-[22px] bg-gradient-to-br from-white via-[#f8fbff] to-[#edf5ff] px-6 py-7 shadow-[0_24px_60px_rgba(0,10,28,0.35)] sm:rounded-[24px] sm:px-11 sm:py-11">
              <div aria-hidden="true" className="pointer-events-none absolute -left-1 top-0 h-[68px] w-[68px] bg-gradient-to-br from-blue-500 to-blue-400 [clip-path:polygon(0_0,100%_0,0_100%)]" />
              <div aria-hidden="true" className="pointer-events-none absolute -bottom-1 -right-1 h-[68px] w-[68px] bg-gradient-to-tl from-blue-600 to-blue-400 [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
              <form onSubmit={(event) => { event.preventDefault(); void login(); }} className="relative space-y-6 sm:space-y-7">
                <div className="text-center">
                  <h1 className="text-4xl font-black tracking-tight text-[#0b1f44] sm:text-[52px]">Akses <span className="text-blue-600">Tiket</span></h1>
                  <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500 sm:text-base">Masukkan nomor WhatsApp dan kode akses tiketmu.</p>
                </div>
                <div>
                  <label htmlFor="ticket-access-whatsapp" className="mb-2 block text-sm font-bold text-slate-600">Nomor WhatsApp</label>
                  <div className="relative">
                    <MessageCircle className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-500" />
                    <input id="ticket-access-whatsapp" type="tel" inputMode="numeric" autoComplete="tel" required value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} className="min-h-16 w-full rounded-2xl border border-blue-200 bg-white/60 py-4 pl-14 pr-4 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:text-base" placeholder="Contoh: 081234567890" />
                  </div>
                </div>
                <div>
                  <label htmlFor="ticket-access-code" className="mb-2 block text-sm font-bold text-slate-600">Kode Akses</label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-500" />
                    <input id="ticket-access-code" required autoCapitalize="characters" autoComplete="one-time-code" value={accessCode} onChange={(event) => setAccessCode(event.target.value.toUpperCase())} className="min-h-16 w-full rounded-2xl border border-blue-200 bg-white/60 py-4 pl-14 pr-4 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:text-base" placeholder="Contoh: ABCD-1234" />
                  </div>
                </div>
                {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm font-semibold leading-5 text-red-700">{error}</p>}
                <button type="submit" disabled={loading} className="group inline-flex min-h-[60px] w-full items-center justify-center gap-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-4 text-base font-extrabold text-white shadow-[0_12px_24px_rgba(37,99,235,0.25)] transition hover:from-blue-700 hover:to-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:text-lg">
                  {loading ? 'Memeriksa tiket...' : <>Lihat Tiket <ArrowRight className="h-6 w-6 transition-transform group-hover:translate-x-1" /></>}
                </button>
              </form>
            </section>
            <button type="button" onClick={() => router.navigate('/event')} className="mt-6 inline-flex items-center gap-3 px-4 py-2 text-sm font-semibold text-blue-200 transition hover:text-white sm:mt-7">
              <ArrowLeft className="h-5 w-5" /> Kembali ke Event
            </button>
          </div>
        </div> : ticketTab === 'tickets' ? <div className="mx-auto max-w-3xl space-y-4">
          <section className={`overflow-hidden rounded-2xl border shadow-sm ${session.event.status === 'cancelled' ? 'border-red-300 bg-red-50' : 'border-blue-200 bg-white'}`}>
            <div className="p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">{session.event.status === 'cancelled' ? 'Event Dibatalkan' : 'Tiket Saya'}</p>
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 sm:gap-4 sm:p-3">
                {session.event.poster?.trim()
                  ? <img src={session.event.poster} alt={`Poster ${session.event.title}`} loading="lazy" className="h-16 w-12 shrink-0 rounded-lg border border-slate-200 bg-white object-cover sm:h-20 sm:w-14" />
                  : <span aria-hidden="true" className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-700 sm:h-20 sm:w-14"><CalendarDays className="h-5 w-5" /></span>}
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg font-black leading-tight text-slate-950 sm:text-xl">{session.event.title}</h1>
                  <p className="mt-1 text-xs text-slate-600 sm:text-sm">{session.event.date} · {session.event.time} · {session.event.venue}</p>
                </div>
              </div>
            </div>
            {session.event.status === 'cancelled' && <p className="mt-3 text-sm font-semibold text-red-800">Event ini dibatalkan. QR tiket tidak dapat digunakan untuk check-in.</p>}
          </section>
          {session.orders.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada order lunas dengan Kode Akses ini.</div> : visibleOrders.map((order) => {
            const orderTickets = session.tickets.filter((ticket) => ticket.ticket_order_id === order.id);
            const isExpanded = expandedOrder === order.id;
            return <section key={order.id} className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.08)]">
              <button type="button" onClick={() => setExpandedOrder(isExpanded ? null : order.id)} className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5"><span className="min-w-0"><span className="block font-mono text-xs font-bold text-blue-700">{order.order_number ?? order.id}</span><span className="mt-1 block truncate font-extrabold text-slate-900">{order.ticket_category} · {order.quantity} tiket</span></span><span className="shrink-0 text-sm font-bold text-slate-500">{isExpanded ? 'Tutup' : 'Lihat tiket'}</span></button>
              {isExpanded && <div className={fullscreenTicketOrder === order.id ? 'fixed inset-x-0 top-16 bottom-[calc(4.625rem+var(--safe-bottom))] z-40 flex flex-col bg-slate-200 sm:top-[4.5rem]' : 'border-t border-slate-100 p-4 sm:p-5'} role="region" aria-label={`Tiket ${order.order_number ?? order.id}`}>
                <div className={`flex shrink-0 flex-wrap items-center gap-2 ${fullscreenTicketOrder === order.id ? 'border-b border-slate-300 bg-white px-4 py-3 shadow-sm sm:px-6' : 'mb-3'}`}>
                  {fullscreenTicketOrder === order.id
                    ? <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold text-slate-950">{order.ticket_category} · {order.quantity} tiket</p>
                      <p className="truncate font-mono text-[11px] text-slate-500">{order.order_number ?? order.id}</p>
                    </div>
                    : <p className="w-full text-center text-xs font-bold uppercase tracking-wider text-slate-500">{orderTickets.length > 1 ? 'Geser untuk melihat tiket lainnya' : 'Detail tiket'}</p>}
                  <div className="ml-auto flex w-full items-center justify-end gap-2 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => void downloadOrderTickets(order)}
                      disabled={downloadingOrder !== null || downloadingTicket !== null || orderTickets.length === 0}
                      className="inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:flex-none sm:px-4 sm:text-sm"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      {downloadingOrder === order.id ? 'Membuat PDF...' : 'Download E-Tiket'}
                    </button>
                    <button type="button" onClick={() => fullscreenTicketOrder === order.id ? setFullscreenTicketOrder(null) : setFullscreenTicketOrder(order.id)} aria-label={fullscreenTicketOrder === order.id ? 'Tutup layar penuh' : 'Lihat layar penuh'} title={fullscreenTicketOrder === order.id ? 'Tutup layar penuh' : 'Lihat layar penuh'} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      {fullscreenTicketOrder === order.id ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {pdfErrors[order.id] && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{pdfErrors[order.id]}</p>}
                {orderTickets.length ? <><div ref={(node) => { ticketCarouselRefs.current[order.id] = node; }} onScroll={(event) => {
                  const carousel = event.currentTarget;
                  const cards = Array.from(carousel.children);
                  if (!cards.length) return;
                  const center = carousel.scrollLeft + carousel.clientWidth / 2;
                  const closest = cards.reduce((best, card, index) => {
                    const element = card as HTMLElement;
                    const distance = Math.abs(element.offsetLeft + element.offsetWidth / 2 - center);
                    return distance < best.distance ? { index, distance } : best;
                  }, { index: 0, distance: Number.POSITIVE_INFINITY });
                  setActiveTicketIndexes((current) => current[order.id] === closest.index ? current : { ...current, [order.id]: closest.index });
                }} className={`flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${fullscreenTicketOrder === order.id ? 'min-h-0 flex-1' : 'gap-3 pb-2'}`}>
                  {orderTickets.map((ticket) => <article key={ticket.id} className={`flex shrink-0 snap-center flex-col items-center justify-center gap-4 overflow-y-auto text-center ${fullscreenTicketOrder === order.id ? 'h-full w-full px-4 py-5 sm:px-8' : 'min-h-64 w-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:w-[320px]'}`}>
                    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${ticket.status === 'Sudah Digunakan' ? 'bg-slate-300 text-slate-800' : ticket.status === 'Belum Digunakan' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{ticket.status}</span>
                    <div className="flex max-h-full max-w-full items-center justify-center rounded-2xl border border-slate-300 bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.1)] sm:p-5">
                      {ticket.qr_token && ticket.status === 'Belum Digunakan' ? <QRCodeSVG value={ticket.qr_token} size={Math.max(180, Math.min(360, window.innerWidth * 0.78, (window.innerHeight - 280) * 0.66))} level="M" includeMargin aria-label={`QR tiket ${ticket.sequence_no}`} /> : ticket.status === 'Sudah Digunakan' ? <CheckCircle2 className="h-20 w-20 text-slate-400" /> : ticket.status === 'Event Dibatalkan' ? <XCircle className="h-20 w-20 text-red-500" /> : <Ticket className="h-20 w-20 text-slate-300" />}
                    </div>
                    {ticket.qr_token && <QRCodeCanvas ref={(node) => { ticketQrCanvases.current[ticket.id] = node; }} value={ticket.qr_token} size={640} level="M" includeMargin className="fixed -left-[10000px] top-0 h-[640px] w-[640px]" aria-hidden="true" />}
                    <p className="text-xl font-black uppercase tracking-wide text-slate-900">TIKET {ticket.sequence_no}</p>
                    <p className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-mono text-base font-extrabold tracking-wide text-slate-900 shadow-sm">{order.order_number ?? order.id} / {ticket.sequence_no}</p>
                    <button
                      type="button"
                      onClick={() => void downloadSingleTicket(order, ticket)}
                      disabled={downloadingOrder !== null || downloadingTicket !== null || !ticket.qr_token}
                      className="inline-flex min-h-11 w-full max-w-xs items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-extrabold text-blue-800 shadow-sm transition hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      {downloadingTicket === ticket.id ? 'Membuat PDF tiket...' : 'Unduh PDF tiket ini'}
                    </button>
                  </article>)}
                </div>
                {orderTickets.length > 1 && <div className={`flex shrink-0 items-center justify-center gap-2 ${fullscreenTicketOrder === order.id ? 'border-t border-slate-300 bg-white px-4 py-3' : 'mt-2'}`} aria-label="Pilih nomor tiket">
                  {orderTickets.map((ticket, index) => <button key={ticket.id} type="button" onClick={() => scrollToTicket(order.id, index)} aria-label={`Tampilkan tiket ${ticket.sequence_no}`} aria-current={(activeTicketIndexes[order.id] ?? 0) === index ? 'true' : undefined} className={`h-2.5 rounded-full transition-all ${(activeTicketIndexes[order.id] ?? 0) === index ? 'w-6 bg-blue-600' : 'w-2.5 bg-slate-300 hover:bg-blue-300'}`} />)}
                </div>}</> : <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Tiket individual belum tersedia.</div>}
              </div>}
            </section>;
          })}
          <TicketPagination page={orderPage} pageSize={ORDER_PAGE_SIZE} total={session.orders.length} onPageChange={(nextPage) => { setOrderPage(nextPage); setExpandedOrder(null); }} />
          {error && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{error}</p>}
        </div> : ticketTab === 'history' ? <div className="mx-auto max-w-3xl space-y-4">
          <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Riwayat pembelian</p>
            <h1 className="mt-1 text-xl font-black text-slate-950">Riwayat Tiket</h1>
            <p className="mt-1 text-sm text-slate-600">Order lunas dari Event yang dibeli dengan nomor WhatsApp ini.</p>
          </section>
          {historyLoading ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-medium text-slate-500">Memuat riwayat tiket...</div>
            : historyError ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{historyError}</div>
              : history?.length ? history.map((order) => <article key={order.id} className="rounded-2xl border border-slate-300 bg-white p-4 shadow-[0_4px_14px_rgba(15,23,42,0.08)] sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-extrabold text-slate-950">{order.event?.title ?? 'Event tidak tersedia'}</p>
                    {order.event && <p className="mt-1 text-xs text-slate-500">{formatDate(order.event.date)}{order.event.venue ? ` · ${order.event.venue}` : ''}</p>}
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-700">Lunas</span>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800">{order.ticket_category} · {order.quantity} tiket</p>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-500">{order.order_number ?? order.id}</p>
                  </div>
                  <p className="shrink-0 text-sm font-extrabold text-slate-900">{formatPrice(order.total_price)}</p>
                </div>
              </article>)
                : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{history ? 'Belum ada riwayat order lunas untuk nomor WhatsApp ini.' : 'Pilih tab Riwayat untuk melihat pembelian tiket sebelumnya.'}</div>}
        </div> : ticketTab === 'events' ? <div className="mx-auto max-w-3xl space-y-4">
          <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Event pembelianmu</p>
            <h1 className="mt-1 text-xl font-black text-slate-950">Event Saya</h1>
            <p className="mt-1 text-sm text-slate-600">Daftar Event tempat kamu sudah membeli tiket.</p>
          </section>
          {historyLoading ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-medium text-slate-500">Memuat Event tiketmu...</div>
            : historyError ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{historyError}</div>
              : purchasedEvents.length ? purchasedEvents.map(({ event, quantity, total, orderCount }) => {
                const poster = event.poster?.trim() || (event.id === session.event.id ? session.event.poster?.trim() : '');
                const eventStatus = getEventStatus(event.status, event.date);
                return <article key={event.id} className="rounded-2xl border border-slate-300 bg-white p-4 shadow-[0_4px_14px_rgba(15,23,42,0.08)] sm:p-5">
                <div className="flex items-start gap-3">
                  {poster ? <img src={poster} alt={`Poster ${event.title}`} loading="lazy" className="h-20 w-16 shrink-0 rounded-xl border border-slate-200 object-cover sm:h-24 sm:w-[4.5rem]" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><CalendarDays className="h-5 w-5" /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-extrabold text-slate-950">{event.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(event.date)} · {event.time}{event.venue ? ` · ${event.venue}` : ''}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${eventStatus === 'upcoming' ? 'bg-blue-50 text-blue-700' : eventStatus === 'cancelled' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                    {eventStatus === 'upcoming' ? 'Akan datang' : eventStatus === 'cancelled' ? 'Dibatalkan' : 'Selesai'}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
                  <p className="font-semibold text-slate-600">{quantity} tiket · {orderCount} order</p>
                  <p className="font-extrabold text-slate-900">{formatPrice(total)}</p>
                </div>
                {event.id === session.event.id && <button type="button" onClick={() => setTicketTab('tickets')} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-100">
                  <Ticket className="h-4 w-4" /> Buka tiket Event ini
                </button>}
              </article>;
              })
                : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{history ? 'Belum ada Event dengan order tiket lunas untuk nomor WhatsApp ini.' : 'Belum ada data Event pembelian.'}</div>}
        </div> : null}
      </div>
      {session && <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-blue-100 bg-white/95 shadow-[0_-8px_24px_rgba(11,60,93,0.12)] backdrop-blur-xl" style={{ paddingBottom: 'var(--safe-bottom)' }} aria-label="Navigasi tiket">
        <div className="mx-auto grid max-w-xl grid-cols-3 px-2 sm:px-4">
          <button type="button" onClick={() => setTicketTab('tickets')} className={`mobile-nav-item flex flex-col items-center gap-0.5 py-2.5 transition-all duration-300 ${ticketTab === 'tickets' ? 'mobile-nav-item-active' : ''}`} aria-current={ticketTab === 'tickets' ? 'page' : undefined}>
            <span className={`mobile-nav-icon flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300 ${ticketTab === 'tickets' ? 'mobile-nav-icon-active bg-blue-600 text-white shadow-[0_8px_18px_rgba(29,94,219,0.3)]' : 'text-slate-400'}`}><Ticket className="h-5 w-5" /></span>
            <span className={`mobile-nav-label text-[10px] font-semibold ${ticketTab === 'tickets' ? 'mobile-nav-label-active text-blue-700' : 'text-slate-400'}`}>TIKET SAYA</span>
          </button>
          <button type="button" onClick={() => { setTicketTab('events'); void loadHistory(); }} className={`mobile-nav-item flex flex-col items-center gap-0.5 py-2.5 transition-all duration-300 ${ticketTab === 'events' ? 'mobile-nav-item-active' : ''}`} aria-current={ticketTab === 'events' ? 'page' : undefined}>
            <span className={`mobile-nav-icon flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300 ${ticketTab === 'events' ? 'mobile-nav-icon-active bg-blue-600 text-white shadow-[0_8px_18px_rgba(29,94,219,0.3)]' : 'text-slate-400'}`}><CalendarDays className="h-5 w-5" /></span>
            <span className={`mobile-nav-label text-[10px] font-semibold ${ticketTab === 'events' ? 'mobile-nav-label-active text-blue-700' : 'text-slate-400'}`}>EVENT</span>
          </button>
          <button type="button" onClick={() => { setTicketTab('history'); void loadHistory(); }} className={`mobile-nav-item flex flex-col items-center gap-0.5 py-2.5 transition-all duration-300 ${ticketTab === 'history' ? 'mobile-nav-item-active' : ''}`} aria-current={ticketTab === 'history' ? 'page' : undefined}>
            <span className={`mobile-nav-icon flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300 ${ticketTab === 'history' ? 'mobile-nav-icon-active bg-blue-600 text-white shadow-[0_8px_18px_rgba(29,94,219,0.3)]' : 'text-slate-400'}`}><History className="h-5 w-5" /></span>
            <span className={`mobile-nav-label text-[10px] font-semibold ${ticketTab === 'history' ? 'mobile-nav-label-active text-blue-700' : 'text-slate-400'}`}>RIWAYAT/HISTORI</span>
          </button>
        </div>
      </nav>}
    </div>
  );
}