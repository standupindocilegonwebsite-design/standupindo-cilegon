import { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import type { EventItem, EventTicket, TicketOrder } from '@/lib/types';
import { formatDate, formatPrice } from '@/lib/format';
import { LOGO_URL } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { TicketWorkspaceHeader } from '@/pages/admin/TicketWorkspaceHeader';
import { SearchableEventSelect } from '@/components/ui/SearchableEventSelect';

interface PaymentGroup {
  key: string;
  bank: string;
  account: string;
  recipient: string;
  method: string;
  quantity: number;
  revenue: number;
  orders: number;
}

interface CategoryReport {
  category: { id: string; name: string; price: number | null; quota: number | null };
  sold: number;
  unsold: number | null;
  revenue: number;
}

interface EventReport {
  event: EventItem;
  categories: CategoryReport[];
  payments: PaymentGroup[];
  sold: number;
  revenue: number;
}

async function loadCategories(events: EventItem[]) {
  const categories: EventTicket[] = [];
  const eventIds = events.map((event) => event.id);
  for (let offset = 0; offset < eventIds.length; offset += 100) {
    const ids = eventIds.slice(offset, offset + 100);
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase.from('event_tickets')
        .select('id, event_id, name, price, quota, description, ticket_url, status, sort_order, created_at, updated_at')
        .in('event_id', ids).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
        .range(from, from + 499);
      if (error) return { categories: [] as EventTicket[], error: error.message };
      const rows = (data as EventTicket[] | null) ?? [];
      categories.push(...rows);
      if (rows.length < 500) break;
    }
  }
  return { categories, error: null as string | null };
}

function paymentDetails(order: TicketOrder) {
  const snapshot = order.payment_method_snapshot;
  const bank = typeof snapshot?.bank_name === 'string' && snapshot.bank_name.trim() ? snapshot.bank_name.trim() : '';
  const account = typeof snapshot?.account_number === 'string' && snapshot.account_number.trim() ? snapshot.account_number.trim() : '';
  const recipient = typeof snapshot?.recipient_name === 'string' && snapshot.recipient_name.trim() ? snapshot.recipient_name.trim() : '';
  const method = bank || account ? 'Transfer bank' : typeof snapshot?.qris_storage_path === 'string' && snapshot.qris_storage_path ? 'QRIS' : 'Tidak tercatat';
  const key = [method, bank, account, recipient].join('|').toLocaleLowerCase('id-ID');
  return { key, bank: bank || (method === 'QRIS' ? 'QRIS' : '—'), account: account || '—', recipient: recipient || '—', method };
}

export function TicketSalesReportPage({ events, orders, onBack }: { events: EventItem[]; orders: TicketOrder[]; onBack: () => void }) {
  const [categories, setCategories] = useState<EventTicket[]>([]);
  const [eventFilter, setEventFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void loadCategories(events).then((result) => {
      if (!active) return;
      setCategories(result.categories);
      setError(result.error ?? '');
      setLoading(false);
    });
    return () => { active = false; };
  }, [events]);

  useEffect(() => {
    if (eventFilter !== 'all' && !events.some((event) => event.id === eventFilter)) setEventFilter('all');
  }, [eventFilter, events]);

  const reports = useMemo<EventReport[]>(() => events
    .filter((event) => eventFilter === 'all' || event.id === eventFilter)
    .map((event) => {
      const eventCategories = categories.filter((category) => category.event_id === event.id);
      const paidOrders = orders.filter((order) => order.event_id === event.id && order.status === 'Lunas');
      const assignedOrders = new Map<string, TicketOrder[]>();
      const unmatchedOrders: TicketOrder[] = [];
      paidOrders.forEach((order) => {
        const category = eventCategories.find((item) => item.id === order.ticket_id)
          ?? (!order.ticket_id ? eventCategories.find((item) => item.name.trim().toLocaleLowerCase('id-ID') === order.ticket_category.trim().toLocaleLowerCase('id-ID')) : undefined);
        if (!category) {
          unmatchedOrders.push(order);
          return;
        }
        assignedOrders.set(category.id, [...(assignedOrders.get(category.id) ?? []), order]);
      });
      const categoriesReport: CategoryReport[] = eventCategories.map((category) => {
        const categoryOrders = assignedOrders.get(category.id) ?? [];
        const sold = categoryOrders.reduce((total, order) => total + order.quantity, 0);
        const quota = category.quota ?? null;
        return {
          category: { id: category.id, name: category.name, price: category.price, quota },
          sold,
          unsold: quota == null ? null : Math.max(0, quota - sold),
          revenue: categoryOrders.reduce((total, order) => total + order.total_price, 0),
        };
      });
      const unmatchedByCategory = new Map<string, TicketOrder[]>();
      unmatchedOrders.forEach((order) => {
        const name = order.ticket_category.trim() || 'Kategori tidak tercatat';
        unmatchedByCategory.set(name, [...(unmatchedByCategory.get(name) ?? []), order]);
      });
      unmatchedByCategory.forEach((categoryOrders, name) => categoriesReport.push({
        category: { id: `legacy-${name}`, name: `${name} (kategori lama)`, price: null, quota: null },
        sold: categoryOrders.reduce((total, order) => total + order.quantity, 0),
        unsold: null,
        revenue: categoryOrders.reduce((total, order) => total + order.total_price, 0),
      }));
      const paymentMap = new Map<string, PaymentGroup>();
      paidOrders.forEach((order) => {
        const payment = paymentDetails(order);
        const group = paymentMap.get(payment.key) ?? {
          ...payment,
          quantity: 0,
          revenue: 0,
          orders: 0,
        };
        group.quantity += order.quantity;
        group.revenue += order.total_price;
        group.orders += 1;
        paymentMap.set(payment.key, group);
      });
      return {
        event,
        categories: categoriesReport,
        payments: [...paymentMap.values()].sort((first, second) => second.revenue - first.revenue),
        sold: paidOrders.reduce((total, order) => total + order.quantity, 0),
        revenue: paidOrders.reduce((total, order) => total + order.total_price, 0),
      };
    }), [categories, eventFilter, events, orders]);

  const totalSold = reports.reduce((total, report) => total + report.sold, 0);
  const totalRevenue = reports.reduce((total, report) => total + report.revenue, 0);

  function printReport() {
    document.body.dataset.printMode = 'ticket-sales-report';
    window.setTimeout(() => {
      window.print();
      delete document.body.dataset.printMode;
    }, 0);
  }

  return (
    <div className="space-y-5">
      <TicketWorkspaceHeader
        title="Laporan Tiket"
        subtitle="Ringkasan kuota, penjualan, pendapatan, dan rekening pembayaran per Event."
        onBack={onBack}
        action={<button type="button" onClick={printReport} disabled={loading || Boolean(error) || reports.length === 0} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-800 shadow-sm transition hover:bg-blue-50 disabled:opacity-50" aria-label="Cetak laporan tiket" title="Cetak laporan tiket"><Printer className="h-4 w-4" /></button>}
      />
      <SearchableEventSelect options={events} value={eventFilter} onChange={setEventFilter} allLabel="Semua Event" ariaLabel="Pilih Event laporan" />
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">Laporan gagal dimuat: {error}</p>}
      {loading ? <div className="h-24 skeleton rounded-2xl" /> : !error && <>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Tiket Terjual</p><p className="mt-1 text-2xl font-black text-blue-800">{totalSold}</p></div>
          <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Pendapatan</p><p className="mt-1 break-words text-xl font-black text-emerald-800">{formatPrice(totalRevenue)}</p></div>
        </div>
        {!reports.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Tidak ada Event dalam scope.</div> : <div className="space-y-4">
          {reports.map((report) => <article key={report.event.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0"><h2 className="text-sm font-extrabold text-slate-950">{report.event.title}</h2><p className="mt-0.5 text-xs text-slate-500">{formatDate(report.event.date)}</p></div>
              <div className="shrink-0 text-right"><p className="text-xs font-bold text-blue-800">{report.sold} TIKET</p><p className="mt-0.5 text-xs font-extrabold text-emerald-800">{formatPrice(report.revenue)}</p></div>
            </header>
            <div className="space-y-4 p-3 sm:p-4">
              <section><h3 className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Penjualan per Kategori</h3>
                {report.categories.length ? <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[440px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Kategori</th><th className="px-3 py-2">Kuota</th><th className="px-3 py-2">Laku</th><th className="px-3 py-2">Belum Laku</th><th className="px-3 py-2 text-right">Pendapatan</th></tr></thead><tbody className="divide-y divide-slate-100">{report.categories.map((row) => <tr key={row.category.id}><td className="px-3 py-2 font-bold text-slate-900">{row.category.name}</td><td className="px-3 py-2">{row.category.quota == null ? 'Tanpa batas' : row.category.quota}</td><td className="px-3 py-2 font-bold text-blue-800">{row.sold}</td><td className="px-3 py-2">{row.unsold == null ? '—' : row.unsold}</td><td className="px-3 py-2 text-right font-semibold">{formatPrice(row.revenue)}</td></tr>)}</tbody></table></div> : <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">Belum ada kategori tiket.</p>}
              </section>
              <section><h3 className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Pendapatan per Rekening / Metode</h3>
                {report.payments.length ? <div className="space-y-2">{report.payments.map((payment) => <div key={payment.key} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-extrabold text-slate-900">{payment.bank} {payment.account !== '—' ? `· ${payment.account}` : ''}</p><p className="mt-0.5 text-[10px] text-slate-500">{payment.recipient} · {payment.method}</p><p className="mt-1 text-[10px] font-semibold text-slate-600">{payment.orders} order · {payment.quantity} tiket</p></div><p className="shrink-0 text-xs font-extrabold text-emerald-800">{formatPrice(payment.revenue)}</p></div></div>)}</div> : <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">Belum ada pembayaran lunas.</p>}
              </section>
            </div>
          </article>)}
        </div>}
      </>}
      <div className="print-sheet ticket-sales-report-print">
        <div className="print-brand"><img src={LOGO_URL} alt="" /><div><h1>LAPORAN PENJUALAN TIKET</h1><p>{eventFilter === 'all' ? 'Semua Event dalam scope Admin Tiket' : reports[0]?.event.title}</p><p>Dicetak: {new Date().toLocaleString('id-ID')}</p></div></div>
        <table><thead><tr><th>Total Event</th><th>Total Tiket Terjual</th><th>Total Pendapatan</th></tr></thead><tbody><tr><td>{reports.length}</td><td>{totalSold}</td><td>{formatPrice(totalRevenue)}</td></tr></tbody></table>
        {reports.map((report) => <section key={report.event.id} className="ticket-report-print-event">
          <h2>{report.event.title}</h2><p>{formatDate(report.event.date)} · {report.event.venue}</p>
          <h3>Penjualan per Kategori</h3>
          <table><thead><tr><th>Kategori</th><th>Harga</th><th>Kuota</th><th>Laku</th><th>Belum Laku</th><th>Pendapatan</th></tr></thead><tbody>{report.categories.map((row) => <tr key={row.category.id}><td>{row.category.name}</td><td>{row.category.price === null ? '—' : formatPrice(row.category.price)}</td><td>{row.category.quota == null ? 'Tanpa batas' : row.category.quota}</td><td>{row.sold}</td><td>{row.unsold == null ? '—' : row.unsold}</td><td>{formatPrice(row.revenue)}</td></tr>)}</tbody></table>
          <h3>Pendapatan per Rekening / Metode</h3>
          {report.payments.length ? <table><thead><tr><th>Bank / Metode</th><th>Nomor Rekening</th><th>Penerima</th><th>Order</th><th>Tiket</th><th>Pendapatan</th></tr></thead><tbody>{report.payments.map((payment) => <tr key={payment.key}><td>{payment.bank} · {payment.method}</td><td>{payment.account}</td><td>{payment.recipient}</td><td>{payment.orders}</td><td>{payment.quantity}</td><td>{formatPrice(payment.revenue)}</td></tr>)}</tbody></table> : <p>Belum ada pembayaran lunas.</p>}
          <p className="ticket-report-print-total">Total Event: {report.sold} tiket terjual · Pendapatan {formatPrice(report.revenue)}</p>
        </section>)}
      </div>
    </div>
  );
}
