import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, Eye, ExternalLink, KeyRound, MessageCircle, Printer, Search, ShieldCheck, Ticket as TicketIcon, Trash2, X } from 'lucide-react';
import type { EventItem, TicketOrder } from '@/lib/types';
import { formatPrice, getEventStatus } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/ui/Modal';
import { TicketPagination } from '@/components/TicketPagination';
import { TicketWorkspaceHeader } from '@/pages/admin/TicketWorkspaceHeader';
import { SearchableEventSelect } from '@/components/ui/SearchableEventSelect';

const PAGE_SIZE = 25;

type TicketActionResult = {
  error?: string;
  status?: string;
  access_code_id?: string;
  access_code?: string;
  whatsapp_url?: string;
  signed_url?: string;
  last_sent_at?: string;
  send_count?: number;
  deleted?: boolean;
  warning?: string;
};

async function invokeTicketAdmin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('ticketing-admin', { body });
  if (!error) return { data: data as TicketActionResult, error: null as string | null };
  const context = (error as Error & { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try {
      const response = await context.json() as TicketActionResult;
      return { data: response, error: response.error ?? error.message };
    } catch {
      return { data: null as TicketActionResult | null, error: error.message };
    }
  }
  return { data: null as TicketActionResult | null, error: error.message };
}

function statusTone(status: string) {
  if (status === 'Lunas' || status === 'Terverifikasi') return 'bg-emerald-700 text-white';
  if (status === 'Menunggu Verifikasi' || status === 'Sudah Bayar') return 'bg-amber-500 text-slate-950';
  if (status === 'Ditolak' || status === 'Dibatalkan') return 'bg-red-700 text-white';
  if (status === 'Expired') return 'bg-slate-700 text-white';
  return 'bg-blue-700 text-white';
}

function paymentSnapshotDetails(snapshot: Record<string, unknown> | null | undefined) {
  if (!snapshot) return ['Snapshot informasi pembayaran tidak tersedia.'];
  const recipient = typeof snapshot.recipient_name === 'string' ? snapshot.recipient_name.trim() : '';
  const bank = typeof snapshot.bank_name === 'string' ? snapshot.bank_name.trim() : '';
  const account = typeof snapshot.account_number === 'string' ? snapshot.account_number.trim() : '';
  const note = typeof snapshot.note === 'string' ? snapshot.note.trim() : '';
  const qrisPath = typeof snapshot.qris_storage_path === 'string' ? snapshot.qris_storage_path.trim() : '';
  const method = bank || account ? 'Transfer' : qrisPath ? 'QRIS' : 'Informasi pembayaran';
  const details = [
    `Metode: ${method}`,
    recipient ? `Penerima: ${recipient}` : '',
    bank ? `Bank: ${bank}` : '',
    account ? `Nomor rekening: ${account}` : '',
    qrisPath ? 'QRIS tersedia pada snapshot order' : '',
    note ? `Catatan pembayaran: ${note}` : '',
  ].filter(Boolean);
  return details.length ? details : ['Snapshot informasi pembayaran tidak tersedia.'];
}

function csvCell(value: string | number) {
  const text = String(value);
  const safeText = typeof value === 'string' && /^[\s\u0000-\u001F]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export function TicketAdminOrdersPage({ orders, events, loading, onReload }: { orders: TicketOrder[]; events: EventItem[]; loading: boolean; onReload: () => void }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Menunggu Verifikasi');
  const [eventFilter, setEventFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [detailsOrderId, setDetailsOrderId] = useState<string | null>(null);
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [accessByOrder, setAccessByOrder] = useState<Record<string, { id: string; code: string; whatsappUrl: string; sentAt?: string; sendCount?: number }>>({});

  const eventById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const selectableEvents = useMemo(() => events.filter((event) => getEventStatus(event.status, event.date) !== 'completed'), [events]);
  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesQuery = !query || [order.order_number ?? '', order.full_name, order.whatsapp, order.ticket_category, eventById.get(order.event_id)?.title ?? ''].join(' ').toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'Menunggu Verifikasi'
        ? order.status === 'Menunggu Verifikasi' || order.status === 'Sudah Bayar'
        : statusFilter === 'Lunas'
          ? order.status === 'Lunas'
          : order.status === 'Ditolak' || order.status === 'Expired';
      return matchesQuery && matchesStatus && (eventFilter === 'all' || order.event_id === eventFilter);
    });
  }, [eventById, eventFilter, orders, search, statusFilter]);
  const pageOrders = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const detailsOrder = orders.find((order) => order.id === detailsOrderId) ?? null;
  const detailsEvent = detailsOrder ? eventById.get(detailsOrder.event_id) : null;
  const detailsAccess = detailsOrder ? accessByOrder[detailsOrder.id] : null;
  const detailsCanReview = detailsOrder ? detailsOrder.status === 'Menunggu Verifikasi' || detailsOrder.status === 'Sudah Bayar' : false;
  const deleteOrder = orders.find((order) => order.id === deleteOrderId) ?? null;

  useEffect(() => { setPage(1); }, [eventFilter, search, statusFilter]);
  useEffect(() => {
    if (eventFilter !== 'all' && !selectableEvents.some((event) => event.id === eventFilter)) setEventFilter('all');
  }, [eventFilter, selectableEvents]);
  useEffect(() => {
    if (page > Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE))) setPage(1);
  }, [filteredOrders.length, page]);

  async function reviewOrder(order: TicketOrder, resolution: 'Lunas' | 'Ditolak') {
    setBusyOrder(order.id);
    setError('');
    const { data, error: actionError } = await invokeTicketAdmin({ action: 'resolve-order', order_id: order.id, resolution });
    setBusyOrder(null);
    if (actionError || !data) {
      setError(actionError ?? 'Order gagal diperbarui.');
      return;
    }
    if (resolution === 'Lunas' && data.access_code_id && data.access_code && data.whatsapp_url) {
      setAccessByOrder((current) => ({ ...current, [order.id]: { id: data.access_code_id!, code: data.access_code!, whatsappUrl: data.whatsapp_url!, sentAt: data.last_sent_at, sendCount: data.send_count } }));
    }
    await onReload();
  }

  async function resendAccessCode(order: TicketOrder) {
    setBusyOrder(order.id);
    setError('');
    const { data, error: actionError } = await invokeTicketAdmin({ action: 'resend-access-code', order_id: order.id });
    setBusyOrder(null);
    if (actionError || !data?.access_code_id || !data.access_code || !data.whatsapp_url) {
      setError(actionError ?? 'Access Code belum tersedia.');
      return;
    }
    setAccessByOrder((current) => ({ ...current, [order.id]: { id: data.access_code_id!, code: data.access_code!, whatsappUrl: data.whatsapp_url!, sentAt: data.last_sent_at, sendCount: data.send_count } }));
    await onReload();
  }

  async function openProof(order: TicketOrder) {
    const proofWindow = window.open('about:blank', '_blank');
    if (!proofWindow) {
      setError('Izinkan pop-up browser untuk membuka bukti pembayaran.');
      return;
    }
    proofWindow.opener = null;
    setBusyOrder(order.id);
    setError('');
    const { data, error: actionError } = await invokeTicketAdmin({ action: 'proof-url', order_id: order.id });
    setBusyOrder(null);
    if (actionError || !data?.signed_url) {
      proofWindow.close();
      setError(actionError ?? 'Bukti pembayaran gagal dibuka.');
      return;
    }
    proofWindow.location.href = data.signed_url;
  }

  async function markSent(orderId: string) {
    const access = accessByOrder[orderId];
    if (!access) return;
    setBusyOrder(orderId);
    const { data, error: actionError } = await invokeTicketAdmin({ action: 'mark-access-code-sent', access_code_id: access.id });
    setBusyOrder(null);
    if (actionError || !data) {
      setError(actionError ?? 'Status pengiriman gagal dicatat.');
      return;
    }
    setAccessByOrder((current) => ({ ...current, [orderId]: { ...access, sentAt: data.last_sent_at, sendCount: data.send_count } }));
    await onReload();
  }

  async function deleteExpiredOrder(order: TicketOrder) {
    if (order.status !== 'Expired') return;
    setBusyOrder(order.id);
    setError('');
    const { data, error: actionError } = await invokeTicketAdmin({ action: 'delete-expired-order', order_id: order.id });
    setBusyOrder(null);
    if (actionError || !data?.deleted) {
      setError(actionError ?? 'Order Expired gagal dihapus.');
      return;
    }
    setDeleteOrderId(null);
    setDetailsOrderId(null);
    if (data.warning) setError(data.warning);
    await onReload();
  }

  function printOrders() {
    document.body.dataset.printMode = 'ticket-orders';
    window.setTimeout(() => { window.print(); delete document.body.dataset.printMode; }, 0);
  }

  function exportCsv() {
    const rows: Array<Array<string | number>> = [
      ['Order', 'Event', 'Nama', 'WhatsApp', 'Tiket', 'Jumlah', 'Total', 'Status', 'Waktu'],
      ...filteredOrders.map((order) => [order.order_number ?? order.id, eventById.get(order.event_id)?.title ?? '', order.full_name, order.whatsapp, order.ticket_category, order.quantity, order.total_price, order.status, order.created_at]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `order-tiket-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const waitingReview = filteredOrders.filter((order) => order.status === 'Menunggu Verifikasi' || order.status === 'Sudah Bayar');
  const statusTabs = [
    { value: 'Menunggu Verifikasi', label: 'MENUNGGU VERIFIKASI' },
    { value: 'Lunas', label: 'Lunas' },
    { value: 'Ditolak', label: 'Ditolak' },
  ];

  return (
    <div className="space-y-5">
      <TicketWorkspaceHeader title="Order" subtitle={`${filteredOrders.length} order sesuai filter · ${waitingReview.length} menunggu verifikasi.`} action={<div className="flex shrink-0 gap-2"><button type="button" onClick={exportCsv} disabled={!filteredOrders.length} className="inline-flex min-h-10 items-center rounded-xl bg-white px-3 py-2 text-xs font-bold text-blue-800 shadow-sm transition hover:bg-blue-50 disabled:opacity-50">Export CSV</button><button type="button" onClick={printOrders} disabled={!filteredOrders.length} className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-800 shadow-sm transition hover:bg-blue-50 disabled:opacity-50" aria-label="Cetak order" title="Cetak order"><Printer className="h-4 w-4" /></button></div>} />
      <div role="tablist" aria-label="Filter status order" className="flex gap-2 overflow-x-auto pb-1">
        {statusTabs.map((tab) => <button key={tab.value} type="button" role="tab" aria-selected={statusFilter === tab.value} onClick={() => setStatusFilter(tab.value)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold uppercase transition ${statusFilter === tab.value ? 'bg-blue-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{tab.label}</button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input-field pl-10" placeholder="Cari order, nama, WhatsApp..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <SearchableEventSelect options={selectableEvents} value={eventFilter} onChange={setEventFilter} allLabel="Semua Event dalam scope" ariaLabel="Filter Event Order" />
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {loading ? <div className="h-28 skeleton rounded-2xl" /> : !filteredOrders.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada order untuk filter ini.</div> : <div className="space-y-2">{pageOrders.map((order) => {
        const event = eventById.get(order.event_id);
        return <article key={order.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-extrabold text-slate-950">{order.full_name}</h2>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${statusTone(order.status)}`}>{order.status}</span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-600">{event?.title ?? 'Event'}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800">
                <TicketIcon className="h-3.5 w-3.5 shrink-0 text-blue-700" />
                <span className="truncate">{order.ticket_category.toUpperCase()}</span>
              </span>
              <span className="shrink-0 rounded-md bg-blue-700 px-2 py-1 text-[10px] font-extrabold tracking-wide text-white">{order.quantity} TIKET</span>
            </div>
            <p className="mt-2 text-sm font-extrabold text-slate-900">{formatPrice(order.total_price)}</p>
          </div>
          <button type="button" onClick={() => setDetailsOrderId(order.id)} aria-label={`Lihat detail order ${order.order_number ?? order.id}`} title="Lihat detail dan aksi" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white transition hover:bg-blue-800">
            <Eye className="h-5 w-5" />
          </button>
        </article>;
      })}</div>}
      <Modal open={Boolean(detailsOrder)} onClose={() => setDetailsOrderId(null)} title="Detail Order" size="lg">
        {detailsOrder && <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-300 border-l-4 border-l-blue-700 bg-white p-4">
            <div className="min-w-0">
              <p className="font-mono text-xs font-bold text-blue-700">{detailsOrder.order_number ?? detailsOrder.id}</p>
              <h2 className="mt-1 text-lg font-extrabold text-slate-950">{detailsOrder.full_name}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-700">{detailsEvent?.title ?? 'Event'}</p>
              <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
                <TicketIcon className="h-4 w-4 shrink-0 text-blue-700" />
                <span className="truncate uppercase">{detailsOrder.ticket_category}</span>
                <span className="shrink-0 rounded-md bg-blue-700 px-2 py-1 text-[10px] font-extrabold tracking-wide text-white">{detailsOrder.quantity} TIKET</span>
              </div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone(detailsOrder.status)}`}>{detailsOrder.status}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p className="rounded-lg border border-slate-200 p-3"><span className="text-[11px] font-medium text-slate-500">WhatsApp</span><br /><span className="font-semibold text-slate-900">{detailsOrder.whatsapp}</span></p>
            {detailsOrder.email && <p className="min-w-0 rounded-lg border border-slate-200 p-3"><span className="text-[11px] font-medium text-slate-500">Email</span><br /><span className="break-all font-semibold text-slate-900">{detailsOrder.email}</span></p>}
            <p className="rounded-lg border border-slate-200 p-3"><span className="text-[11px] font-medium text-slate-500">Total</span><br /><span className="font-extrabold text-slate-900">{formatPrice(detailsOrder.total_price)}</span></p>
            <p className="rounded-lg border border-slate-200 p-3"><span className="text-[11px] font-medium text-slate-500">Nominal dibayar</span><br /><span className="font-semibold text-slate-900">{detailsOrder.payment_amount == null ? '—' : formatPrice(detailsOrder.payment_amount)}</span></p>
            <p className="rounded-lg border border-slate-200 p-3"><span className="text-[11px] font-medium text-slate-500">Order dibuat</span><br /><span className="font-semibold text-slate-900">{new Date(detailsOrder.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</span></p>
            {detailsOrder.payment_submitted_at && <p className="rounded-lg border border-slate-200 p-3"><span className="text-[11px] font-medium text-slate-500">Pembayaran dikirim</span><br /><span className="font-semibold text-slate-900">{new Date(detailsOrder.payment_submitted_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</span></p>}
          </div>
          {(paymentSnapshotDetails(detailsOrder.payment_method_snapshot).length > 0 || detailsOrder.notes) && <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700"><p className="font-bold text-slate-900">Detail pembayaran</p>{paymentSnapshotDetails(detailsOrder.payment_method_snapshot).map((detail) => <p key={detail} className="mt-1">{detail}</p>)}{detailsOrder.notes && <p className="mt-2 border-t border-slate-200 pt-2"><span className="font-semibold">Catatan pembeli:</span> {detailsOrder.notes}</p>}</div>}
          <div className="flex items-center gap-2 border-t border-slate-200 pt-3">
            {detailsOrder.payment_proof_path && <button type="button" onClick={() => void openProof(detailsOrder)} disabled={busyOrder === detailsOrder.id} aria-label="Lihat bukti pembayaran" title="Lihat bukti pembayaran" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-800 transition hover:border-blue-700 hover:text-blue-700 disabled:opacity-50"><Eye className="h-5 w-5" /></button>}
            {detailsCanReview && <><button type="button" onClick={() => void reviewOrder(detailsOrder, 'Lunas')} disabled={busyOrder === detailsOrder.id} aria-label="Tandai order lunas" title="Tandai lunas" className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-700 text-white transition hover:bg-emerald-800 disabled:opacity-50"><Check className="h-5 w-5" /></button><button type="button" onClick={() => void reviewOrder(detailsOrder, 'Ditolak')} disabled={busyOrder === detailsOrder.id} aria-label="Tolak order" title="Tolak order" className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-red-700 text-white transition hover:bg-red-800 disabled:opacity-50"><X className="h-5 w-5" /></button></>}
            {detailsOrder.status === 'Lunas' && <button type="button" onClick={() => void resendAccessCode(detailsOrder)} disabled={busyOrder === detailsOrder.id} aria-label="Cek atau kirim ulang Kode Akses" title="Cek / Kirim Ulang Kode Akses" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-3.5 text-xs font-extrabold text-white transition hover:bg-blue-800 disabled:opacity-50"><KeyRound className="h-4 w-4" />{busyOrder === detailsOrder.id ? 'Memuat...' : 'Cek / Kirim Kode Akses'}</button>}
            {detailsOrder.status === 'Expired' && <button type="button" onClick={() => setDeleteOrderId(detailsOrder.id)} aria-label="Hapus order Expired" title="Hapus order Expired" className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-red-700 text-white transition hover:bg-red-800"><Trash2 className="h-5 w-5" /></button>}
          </div>
          {detailsAccess && <div className="space-y-2 rounded-xl border border-blue-200 bg-white p-3"><p className="text-xs font-bold text-slate-900">Access Code untuk WhatsApp + Event</p><p className="font-mono text-lg font-black tracking-widest text-blue-800">{detailsAccess.code}</p><div className="flex gap-2"><a href={detailsAccess.whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Buka WhatsApp" title="Buka WhatsApp" className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-700 text-white transition hover:bg-blue-800"><MessageCircle className="h-5 w-5" /></a><button type="button" onClick={() => void markSent(detailsOrder.id)} disabled={busyOrder === detailsOrder.id} aria-label="Tandai access code sudah dikirim" title="Tandai sudah dikirim" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-800 transition hover:border-blue-700 hover:text-blue-700 disabled:opacity-50"><CheckCheck className="h-5 w-5" /></button></div><p className="text-[11px] text-slate-600">{detailsAccess.sentAt ? `Ditandai dikirim ${new Date(detailsAccess.sentAt).toLocaleString('id-ID')} · ${detailsAccess.sendCount ?? 1} kali` : 'Belum ditandai terkirim. Membuka WhatsApp tidak mengubah status ini.'}</p></div>}
          {busyOrder === detailsOrder.id && <p className="text-xs font-semibold text-blue-700">Memproses aksi...</p>}
        </div>}
      </Modal>
      <Modal open={Boolean(deleteOrder)} onClose={() => busyOrder !== deleteOrder?.id && setDeleteOrderId(null)} title="Hapus Order Expired" size="sm">
        {deleteOrder && <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-700">Hapus order <span className="font-mono font-bold text-slate-900">{deleteOrder.order_number ?? deleteOrder.id}</span> milik <span className="font-bold text-slate-900">{deleteOrder.full_name}</span>? Tindakan ini tidak dapat dibatalkan.</p>
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setDeleteOrderId(null)} disabled={busyOrder === deleteOrder.id} className="btn-secondary flex-1">Batal</button>
            <button type="button" onClick={() => void deleteExpiredOrder(deleteOrder)} disabled={busyOrder === deleteOrder.id} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-700 px-3 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> {busyOrder === deleteOrder.id ? 'Menghapus...' : 'Hapus'}
            </button>
          </div>
        </div>}
      </Modal>
      <TicketPagination page={page} pageSize={PAGE_SIZE} total={filteredOrders.length} onPageChange={setPage} />
      <div className="hidden print:block">{filteredOrders.map((order) => <p key={order.id}>{order.order_number} · {order.full_name} · {order.whatsapp} · {order.ticket_category} × {order.quantity} · {formatPrice(order.total_price)} · {order.status}</p>)}</div>
      <p className="inline-flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4" /> Pembayaran hanya berubah setelah verifikasi Admin Tiket.</p>
    </div>
  );
}