import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock3, Printer, Search, SlidersHorizontal, ChevronDown, X, Eye } from 'lucide-react';
import type { EventItem, EventTicket, TicketOrder } from '@/lib/types';
import { formatDate, formatPrice, getEventStatus } from '@/lib/format';
import { LOGO_URL } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { TicketWorkspaceHeader } from '@/pages/admin/TicketWorkspaceHeader';
import { SearchableEventSelect } from '@/components/ui/SearchableEventSelect';

interface PaymentGroup {
  key: string;
  bank: string;
  account: string;
  recipient: string;
  qrisRecipient: string;
  method: string;
  quantity: number;
  revenue: number;
  orders: number;
}

interface CategoryReport {
  category: { id: string; name: string; price: number | null; quota: number | null };
  sold: number;
  onlineSold: number;
  otsSold: number;
  freePass: number;
  unsold: number | null;
  revenue: number;
  onlineRevenue: number;
  otsRevenue: number;
}

interface EventReport {
  event: EventItem;
  categories: CategoryReport[];
  payments: PaymentGroup[];
  sold: number;
  onlineSold: number;
  otsSold: number;
  freePass: number;
  revenue: number;
  onlineRevenue: number;
  otsRevenue: number;
  financials: FinancialSummary;
  transactions: TicketOrder[];
}

interface FeeDetail {
  label: string;
  amount: number;
}

interface OrderFinancials {
  subtotal: number | null;
  discount: number | null;
  fees: FeeDetail[];
  voucherCode: string | null;
}

interface FinancialSummary {
  ticketSubtotal: number | null;
  ticketValueAfterDiscount: number | null;
  tax: number | null;
  otherFees: number | null;
  discount: number | null;
  buyerPayments: number;
  netRevenue: null;
  missingSubtotalCount: number;
  missingDiscountCount: number;
  unclassifiedFeeCount: number;
}

interface OtsPaymentHistory {
  id: string;
  previous_status: 'pending' | 'confirmed' | null;
  new_status: 'pending' | 'confirmed';
  actor_id: string;
  created_at: string;
}

function nearestReportEventId(events: EventItem[]) {
  const upcomingEvents = events
    .filter((event) => getEventStatus(event.status, event.date) === 'upcoming')
    .sort((first, second) => first.date.localeCompare(second.date));
  if (upcomingEvents[0]) return upcomingEvents[0].id;
  const previousEvents = events
    .filter((event) => getEventStatus(event.status, event.date) !== 'cancelled')
    .sort((first, second) => second.date.localeCompare(first.date));
  return previousEvents[0]?.id ?? events[0]?.id ?? 'all';
}

function revenueIsRecognized(order: TicketOrder) {
  if (order.sale_channel === 'ots') return order.ots_payment_status === 'confirmed' || order.ots_payment_status == null;
  return order.status === 'Lunas' && order.order_type !== 'free_pass';
}

function finiteAmount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatReportAmount(value: number): string {
  return value === 0 ? 'Rp 0' : formatPrice(value);
}

function orderFinancials(order: TicketOrder): OrderFinancials {
  const breakdown = order.price_breakdown ?? {};
  const subtotal = finiteAmount(breakdown.ticket_subtotal) ?? finiteAmount(order.ticket_subtotal);
  const discount = finiteAmount(breakdown.discount_amount) ?? finiteAmount(order.discount_amount);
  const voucherCodeValue = breakdown.voucher_code ?? order.voucher_code_snapshot;
  const voucherCode = typeof voucherCodeValue === 'string' && voucherCodeValue.trim()
    ? voucherCodeValue.trim()
    : null;
  const additionalFeeAmount = finiteAmount(breakdown.additional_fee_amount) ?? finiteAmount(order.additional_fee_amount) ?? 0;
  const feeLines = Array.isArray(breakdown.fees)
    ? breakdown.fees.flatMap((fee): FeeDetail[] => {
      if (!fee || typeof fee !== 'object') return [];
      const item = fee as Record<string, unknown>;
      const amount = finiteAmount(item.amount);
      if (amount === null || amount <= 0) return [];
      return [{
        label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : 'Biaya tambahan (nama tidak tercatat)',
        amount,
      }];
    })
    : [];
  const feeSnapshot = breakdown.fee;
  const legacyFeeLabel = feeSnapshot && typeof feeSnapshot === 'object'
    && typeof (feeSnapshot as Record<string, unknown>).label === 'string'
    ? String((feeSnapshot as Record<string, unknown>).label).trim()
    : '';

  if (feeLines.length) {
    const recordedFeeTotal = feeLines.reduce((total, fee) => total + fee.amount, 0);
    if (additionalFeeAmount > recordedFeeTotal) {
      feeLines.push({ label: 'Biaya tambahan (rincian tidak tercatat)', amount: additionalFeeAmount - recordedFeeTotal });
    }
  } else if (additionalFeeAmount > 0) {
    feeLines.push({
      label: legacyFeeLabel || 'Biaya tambahan (rincian tidak tercatat)',
      amount: additionalFeeAmount,
    });
  }
  return { subtotal, discount, fees: feeLines, voucherCode };
}

function summarizeFinancials(orders: TicketOrder[]): FinancialSummary {
  let ticketSubtotal = 0;
  let discount = 0;
  let missingSubtotalCount = 0;
  let missingDiscountCount = 0;
  let tax = 0;
  let otherFees = 0;
  let unclassifiedFeeCount = 0;
  let buyerPayments = 0;

  orders.forEach((order) => {
    const financials = orderFinancials(order);
    if (financials.subtotal === null) missingSubtotalCount += 1;
    else ticketSubtotal += financials.subtotal;
    if (financials.discount === null) missingDiscountCount += 1;
    else discount += financials.discount;
    buyerPayments += order.total_price;
    financials.fees.forEach((fee) => {
      if (fee.label.toLocaleLowerCase('id-ID').includes('pajak')) tax += fee.amount;
      else {
        otherFees += fee.amount;
        if (fee.label.toLocaleLowerCase('id-ID').includes('rincian tidak tercatat')) unclassifiedFeeCount += 1;
      }
    });
  });

  return {
    ticketSubtotal: missingSubtotalCount ? null : ticketSubtotal,
    ticketValueAfterDiscount: missingSubtotalCount || missingDiscountCount ? null : ticketSubtotal - discount,
    tax: unclassifiedFeeCount ? null : tax,
    otherFees: unclassifiedFeeCount ? null : otherFees,
    discount: missingDiscountCount ? null : discount,
    buyerPayments,
    netRevenue: null,
    missingSubtotalCount,
    missingDiscountCount,
    unclassifiedFeeCount,
  };
}

function orderFeeAmounts(financials: OrderFinancials) {
  const hasUnclassifiedFee = financials.fees.some((fee) => fee.label.toLocaleLowerCase('id-ID').includes('rincian tidak tercatat'));
  const tax = financials.fees
    .filter((fee) => fee.label.toLocaleLowerCase('id-ID').includes('pajak'))
    .reduce((total, fee) => total + fee.amount, 0);
  const otherFees = financials.fees.filter((fee) => !fee.label.toLocaleLowerCase('id-ID').includes('pajak'));
  return { tax: hasUnclassifiedFee ? null : tax, otherFees };
}

function transactionPaymentStatus(order: TicketOrder) {
  if (order.sale_channel === 'ots') {
    if (order.ots_payment_status === 'confirmed') return 'OTS terkonfirmasi';
    if (order.ots_payment_status == null) return 'OTS historis · detail tidak tercatat';
  }
  return order.status;
}

function localDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function otsPaymentMethodLabel(order: TicketOrder) {
  if (!order.ots_payment_method) return '—';
  if (order.ots_payment_method === 'cash') return 'Cash / Tunai';
  return order.ots_payment_method === 'qris' ? 'QRIS Statis' : 'Transfer Bank';
}

function otsRecipientLabel(order: TicketOrder) {
  if (!order.ots_payment_method) return '—';
  if (order.ots_payment_method === 'cash') return 'Tunai';
  const snapshot = order.ots_payment_snapshot;
  const recipient = typeof snapshot?.qris_recipient_name === 'string' && snapshot.qris_recipient_name.trim()
    ? snapshot.qris_recipient_name.trim()
    : typeof snapshot?.recipient_name === 'string' ? snapshot.recipient_name.trim() : '';
  if (order.ots_payment_method === 'qris') {
    const identifier = typeof snapshot?.qris_identifier === 'string' ? snapshot.qris_identifier.trim() : '';
    return [recipient, identifier].filter(Boolean).join(' · ') || '—';
  }
  const bank = typeof snapshot?.bank_name === 'string' ? snapshot.bank_name.trim() : '';
  const account = typeof snapshot?.account_number === 'string' ? snapshot.account_number.trim() : '';
  return [recipient, bank, account].filter(Boolean).join(' · ') || '—';
}

async function loadCategories(events: EventItem[]) {
  const categories: EventTicket[] = [];
  const eventIds = events.map((event) => event.id);
  for (let offset = 0; offset < eventIds.length; offset += 100) {
    const ids = eventIds.slice(offset, offset + 100);
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase.from('event_tickets')
        .select('id, event_id, name, price, quota, description, ticket_url, status, sort_order, created_at, updated_at, available_public, available_ots, ots_price')
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
  if (order.payment_channel === 'midtrans') {
    return { key: 'midtrans', bank: 'MIDTRANS', account: '—', recipient: 'MIDTRANS', qrisRecipient: '', method: 'MIDTRANS' };
  }
  const snapshot = order.payment_method_snapshot;
  const bank = typeof snapshot?.bank_name === 'string' && snapshot.bank_name.trim() ? snapshot.bank_name.trim() : '';
  const account = typeof snapshot?.account_number === 'string' && snapshot.account_number.trim() ? snapshot.account_number.trim() : '';
  const transferRecipient = typeof snapshot?.recipient_name === 'string' && snapshot.recipient_name.trim() ? snapshot.recipient_name.trim() : '';
  const qrisPath = typeof snapshot?.qris_storage_path === 'string' ? snapshot.qris_storage_path.trim() : '';
  const qrisRecipient = qrisPath
    ? (typeof snapshot?.qris_recipient_name === 'string' ? snapshot.qris_recipient_name.trim() : '') || transferRecipient
    : '';
  const method = bank || account ? 'Transfer bank' : qrisPath ? 'QRIS' : '—';
  const recipient = method === 'QRIS' ? '' : transferRecipient;
  const key = [method, bank, account, recipient, qrisRecipient].join('|').toLocaleLowerCase('id-ID');
  return { key, bank: bank || (method === 'QRIS' ? 'QRIS' : '—'), account: account || '—', recipient: recipient || '—', qrisRecipient, method };
}

export function TicketSalesReportPage({ events, orders, onBack, onReload }: { events: EventItem[]; orders: TicketOrder[]; onBack: () => void; onReload: () => Promise<void> }) {
  const [categories, setCategories] = useState<EventTicket[]>([]);
  const [eventFilter, setEventFilter] = useState(() => nearestReportEventId(events));
  const eventFilterInitialized = useRef(events.length > 0);
  const [otsDateFrom, setOtsDateFrom] = useState('');
  const [otsDateTo, setOtsDateTo] = useState('');
  const [otsMethodFilter, setOtsMethodFilter] = useState('all');
  const [otsStatusFilter, setOtsStatusFilter] = useState('all');
  const [otsRecipientSearch, setOtsRecipientSearch] = useState('');
  const [otsFiltersOpen, setOtsFiltersOpen] = useState(false);
  const [detailsOrderId, setDetailsOrderId] = useState('');
  const [categorySections, setCategorySections] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<{ eventTitle: string; category: CategoryReport } | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<{ eventTitle: string; order: TicketOrder } | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<OtsPaymentHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
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
    if (!eventFilterInitialized.current && events.length > 0) {
      setEventFilter(nearestReportEventId(events));
      eventFilterInitialized.current = true;
    }
    if (eventFilter !== 'all' && !events.some((event) => event.id === eventFilter)) setEventFilter('all');
  }, [eventFilter, events]);

  const reportEventOptions = useMemo(() => events.map((event) => ({
    ...event,
    statusLabel: getEventStatus(event.status, event.date) === 'completed' ? 'SELESAI' : undefined,
  })), [events]);

  const reports = useMemo<EventReport[]>(() => events
    .filter((event) => eventFilter === 'all' || event.id === eventFilter)
    .map((event) => {
      const eventCategories = categories.filter((category) => category.event_id === event.id);
      const paidOrders = orders.filter((order) => order.event_id === event.id && order.status === 'Lunas' && order.order_type !== 'free_pass');
      const recognizedOrders = paidOrders.filter(revenueIsRecognized);
      const freePassOrders = orders.filter((order) => order.event_id === event.id && order.status === 'Lunas' && order.order_type === 'free_pass');
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
        const categoryFreePasses = freePassOrders.filter((order) => order.ticket_id === category.id
          || (!order.ticket_id && order.ticket_category.trim().toLocaleLowerCase('id-ID') === category.name.trim().toLocaleLowerCase('id-ID')));
        const recognizedOrders = categoryOrders.filter(revenueIsRecognized);
        const sold = categoryOrders.reduce((total, order) => total + order.quantity, 0);
        const onlineOrders = categoryOrders.filter((order) => order.sale_channel !== 'ots');
        const otsOrders = categoryOrders.filter((order) => order.sale_channel === 'ots');
        const freePass = categoryFreePasses.reduce((total, order) => total + order.quantity, 0);
        const quota = category.quota ?? null;
        return {
          category: { id: category.id, name: category.name, price: category.price, quota },
          sold,
          onlineSold: onlineOrders.reduce((total, order) => total + order.quantity, 0),
          otsSold: otsOrders.reduce((total, order) => total + order.quantity, 0),
          freePass,
          unsold: quota == null ? null : Math.max(0, quota - sold - freePass),
          revenue: recognizedOrders.reduce((total, order) => total + order.total_price, 0),
          onlineRevenue: onlineOrders.reduce((total, order) => total + order.total_price, 0),
          otsRevenue: otsOrders.reduce((total, order) => total + order.total_price, 0),
        };
      });
      const unmatchedByCategory = new Map<string, TicketOrder[]>();
      unmatchedOrders.forEach((order) => {
        const name = order.ticket_category.trim() || 'Kategori tidak tercatat';
        unmatchedByCategory.set(name, [...(unmatchedByCategory.get(name) ?? []), order]);
      });
      unmatchedByCategory.forEach((categoryOrders, name) => {
        const recognizedOrders = categoryOrders.filter(revenueIsRecognized);
        categoriesReport.push({
          category: { id: `legacy-${name}`, name: `${name} (kategori lama)`, price: null, quota: null },
          sold: categoryOrders.reduce((total, order) => total + order.quantity, 0),
          onlineSold: categoryOrders.filter((order) => order.sale_channel !== 'ots').reduce((total, order) => total + order.quantity, 0),
          otsSold: categoryOrders.filter((order) => order.sale_channel === 'ots').reduce((total, order) => total + order.quantity, 0),
          freePass: 0,
          unsold: null,
          revenue: recognizedOrders.reduce((total, order) => total + order.total_price, 0),
          onlineRevenue: categoryOrders.filter((order) => order.sale_channel !== 'ots').reduce((total, order) => total + order.total_price, 0),
          otsRevenue: recognizedOrders.filter((order) => order.sale_channel === 'ots').reduce((total, order) => total + order.total_price, 0),
        });
      });
      const unmatchedFreePasses = freePassOrders.filter((order) => !eventCategories.some((category) => category.id === order.ticket_id
        || (!order.ticket_id && order.ticket_category.trim().toLocaleLowerCase('id-ID') === category.name.trim().toLocaleLowerCase('id-ID'))));
      if (unmatchedFreePasses.length) {
        categoriesReport.push({
          category: { id: 'free-pass-unmatched', name: 'Free Pass (kategori tidak tercatat)', price: null, quota: null },
          sold: 0,
          onlineSold: 0,
          otsSold: 0,
          freePass: unmatchedFreePasses.reduce((total, order) => total + order.quantity, 0),
          unsold: null,
          revenue: 0,
          onlineRevenue: 0,
          otsRevenue: 0,
        });
      }
      const paymentMap = new Map<string, PaymentGroup>();
      paidOrders.filter((order) => order.sale_channel !== 'ots').forEach((order) => {
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
        onlineSold: paidOrders.filter((order) => order.sale_channel !== 'ots').reduce((total, order) => total + order.quantity, 0),
        otsSold: paidOrders.filter((order) => order.sale_channel === 'ots').reduce((total, order) => total + order.quantity, 0),
        freePass: freePassOrders.reduce((total, order) => total + order.quantity, 0),
        revenue: paidOrders.filter(revenueIsRecognized).reduce((total, order) => total + order.total_price, 0),
        onlineRevenue: paidOrders.filter((order) => order.sale_channel !== 'ots').reduce((total, order) => total + order.total_price, 0),
        otsRevenue: paidOrders.filter((order) => order.sale_channel === 'ots' && revenueIsRecognized(order)).reduce((total, order) => total + order.total_price, 0),
        financials: summarizeFinancials(recognizedOrders),
        transactions: recognizedOrders,
      };
    }), [categories, eventFilter, events, orders]);

  const totalSold = reports.reduce((total, report) => total + report.sold, 0);
  const totalRevenue = reports.reduce((total, report) => total + report.revenue, 0);
  const financialSummary = summarizeFinancials(reports.flatMap((report) => report.transactions));
  const printedFeeBreakdown = reports.flatMap((report) => report.transactions)
    .flatMap((order) => orderFinancials(order).fees)
    .reduce<FeeDetail[]>((totals, fee) => {
      const existing = totals.find((item) => item.label === fee.label);
      if (existing) existing.amount += fee.amount;
      else totals.push({ ...fee });
      return totals;
    }, [])
    .sort((first, second) => first.label.localeCompare(second.label, 'id-ID'));
  const selectedTransactionFinancials = selectedTransaction ? orderFinancials(selectedTransaction.order) : null;
  const selectedTransactionFees = selectedTransactionFinancials ? orderFeeAmounts(selectedTransactionFinancials) : null;
  const selectedTransactionPayment = selectedTransaction ? paymentDetails(selectedTransaction.order) : null;
  const selectedTransactionNetTicketValue = selectedTransactionFinancials?.subtotal === null || selectedTransactionFinancials?.discount === null
    ? null
    : (selectedTransactionFinancials?.subtotal ?? 0) - (selectedTransactionFinancials?.discount ?? 0);
  const filteredOtsOrders = orders.filter((order) => {
    if (order.sale_channel !== 'ots' || (eventFilter !== 'all' && order.event_id !== eventFilter)) return false;
    const transactionDate = localDateKey(order.created_at);
    if (otsDateFrom && transactionDate < otsDateFrom) return false;
    if (otsDateTo && transactionDate > otsDateTo) return false;
    if (otsMethodFilter !== 'all' && (order.ots_payment_method ?? 'unrecorded') !== otsMethodFilter) return false;
    if (otsStatusFilter !== 'all' && (order.ots_payment_status ?? 'legacy') !== otsStatusFilter) return false;
    const query = otsRecipientSearch.trim().toLocaleLowerCase('id-ID');
    if (query && ![
      order.order_number ?? '',
      order.full_name,
      order.whatsapp,
      order.ticket_category,
      otsRecipientLabel(order),
      otsPaymentMethodLabel(order),
    ].join(' ').toLocaleLowerCase('id-ID').includes(query)) return false;
    return true;
  });
  const otsTotalValue = filteredOtsOrders.reduce((total, order) => total + order.total_price, 0);
  const otsConfirmedRevenue = filteredOtsOrders
    .filter((order) => order.ots_payment_status === 'confirmed')
    .reduce((total, order) => total + order.total_price, 0);
  const otsPendingValue = filteredOtsOrders
    .filter((order) => order.ots_payment_status === 'pending')
    .reduce((total, order) => total + order.total_price, 0);
  const otsLegacyValue = filteredOtsOrders
    .filter((order) => order.ots_payment_status == null)
    .reduce((total, order) => total + order.total_price, 0);
  const otsIssuedTickets = filteredOtsOrders.reduce((total, order) => total + order.quantity, 0);
  const activeOtsFilterCount = Number(Boolean(otsDateFrom || otsDateTo))
    + Number(otsMethodFilter !== 'all')
    + Number(otsStatusFilter !== 'all');
  const otsPaymentGroups = [...filteredOtsOrders.reduce((groups, order) => {
    const key = `${order.ots_payment_method ?? 'unrecorded'}|${otsRecipientLabel(order)}`;
    const group = groups.get(key) ?? {
      key,
      method: otsPaymentMethodLabel(order),
      recipient: otsRecipientLabel(order),
      orders: 0,
      value: 0,
      confirmed: 0,
      pending: 0,
    };
    group.orders += 1;
    group.value += order.total_price;
    if (order.ots_payment_status === 'confirmed') group.confirmed += order.total_price;
    if (order.ots_payment_status === 'pending') group.pending += order.total_price;
    groups.set(key, group);
    return groups;
  }, new Map<string, { key: string; method: string; recipient: string; orders: number; value: number; confirmed: number; pending: number }>()).values()];

  async function togglePaymentHistory(orderId: string) {
    if (detailsOrderId === orderId) {
      setDetailsOrderId('');
      setPaymentHistory([]);
      return;
    }
    setDetailsOrderId(orderId);
    setPaymentHistory([]);
    setHistoryLoading(true);
    setActionError('');
    const { data, error: historyError } = await supabase.from('ticket_ots_payment_history')
      .select('id, previous_status, new_status, actor_id, created_at')
      .eq('ticket_order_id', orderId)
      .order('created_at', { ascending: true });
    setHistoryLoading(false);
    if (historyError) {
      console.error('Riwayat pembayaran OTS gagal dimuat.', historyError);
      setActionError(`Riwayat pembayaran gagal dimuat: ${historyError.message}`);
      return;
    }
    setPaymentHistory((data as OtsPaymentHistory[]) ?? []);
  }

  async function confirmOtsPayment(order: TicketOrder) {
    if (!window.confirm(`Konfirmasi bahwa pembayaran ${otsPaymentMethodLabel(order)} untuk order ${order.order_number ?? order.id} sudah diterima dan diperiksa?`)) return;
    setBusyOrderId(order.id);
    setActionError('');
    setActionNotice('');
    const { data, error: invokeError } = await supabase.functions.invoke('ticketing-admin', {
      body: { action: 'confirm-ots-payment', order_id: order.id },
    });
    setBusyOrderId('');
    if (invokeError) {
      const context = (invokeError as Error & { context?: Response }).context;
      let message = invokeError.message;
      if (context && typeof context.json === 'function') {
        try {
          const response = await context.json() as { error?: string };
          message = response.error ?? message;
        } catch {
          message = invokeError.message;
        }
      }
      setActionError(`Konfirmasi pembayaran OTS gagal: ${message}`);
      return;
    }
    if (data?.payment_status !== 'confirmed') {
      setActionError('Server tidak mengembalikan status konfirmasi pembayaran yang valid.');
      return;
    }
    setActionNotice(data.changed === false ? 'Pembayaran OTS ini sudah pernah dikonfirmasi.' : 'Pembayaran OTS berhasil dikonfirmasi.');
    await onReload();
    if (detailsOrderId === order.id) {
      setHistoryLoading(true);
      const { data: history, error: historyError } = await supabase.from('ticket_ots_payment_history')
        .select('id, previous_status, new_status, actor_id, created_at')
        .eq('ticket_order_id', order.id)
        .order('created_at', { ascending: true });
      setHistoryLoading(false);
      if (historyError) {
        console.error('Riwayat pembayaran OTS gagal dimuat.', historyError);
        setActionError(`Pembayaran terkonfirmasi, tetapi riwayat gagal dimuat: ${historyError.message}`);
      } else {
        setPaymentHistory((history as OtsPaymentHistory[]) ?? []);
      }
    }
  }

  function printReport() {
    document.body.dataset.printMode = 'ticket-sales-report';
    window.setTimeout(() => {
      window.print();
      delete document.body.dataset.printMode;
    }, 0);
  }

  useEffect(() => {
    if (!selectedCategory && !selectedTransaction) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelectedCategory(null);
        setSelectedTransaction(null);
      }
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedCategory, selectedTransaction]);

  return (
    <div className="space-y-5">
      <TicketWorkspaceHeader
        title="Laporan Tiket"
        subtitle="Ringkasan kuota, penjualan Online/OTS, pendapatan, dan pembayaran per Event."
        onBack={onBack}
        action={<button type="button" onClick={printReport} disabled={loading || Boolean(error) || reports.length === 0} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-800 shadow-sm transition hover:bg-blue-50 disabled:opacity-50" aria-label="Cetak laporan tiket" title="Cetak laporan tiket"><Printer className="h-4 w-4" /></button>}
      />
      <SearchableEventSelect options={reportEventOptions} value={eventFilter} onChange={setEventFilter} allLabel="Semua Event" ariaLabel="Pilih Event laporan" />
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">Laporan gagal dimuat: {error}</p>}
      {loading ? <div className="h-24 skeleton rounded-2xl" /> : !error && <>
        <div className="flex flex-col gap-5">
        <section className="order-1 space-y-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
          <div><h2 className="font-extrabold text-slate-950">Ringkasan Penjualan</h2><p className="mt-1 text-xs text-slate-500">Mengikuti event terpilih; nilai OTS mengikuti filter pada bagian OTS.</p></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-blue-800 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-900">Total Tiket Terjual</p><p className="mt-1 text-xl font-black text-slate-950">{totalSold}</p></div>
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-emerald-800 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-900">Pendapatan Tercatat</p><p className="mt-1 break-words text-sm font-black text-slate-950">{formatPrice(totalRevenue)}</p></div>
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-indigo-800 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-indigo-900">Online</p><p className="mt-1 text-xl font-black text-slate-950">{reports.reduce((total, report) => total + report.onlineSold, 0)} tiket</p><p className="mt-1 text-xs font-semibold text-indigo-900">{formatPrice(reports.reduce((total, report) => total + report.onlineRevenue, 0))}</p></div>
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-violet-800 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-violet-900">OTS Terkonfirmasi</p><p className="mt-1 text-xl font-black text-slate-950">{filteredOtsOrders.filter((order) => order.ots_payment_status === 'confirmed').reduce((count, order) => count + order.quantity, 0)} tiket</p><p className="mt-1 text-xs font-semibold text-violet-900">{formatPrice(otsConfirmedRevenue)}</p></div>
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-amber-700 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-amber-900">Free Pass</p><p className="mt-1 text-xl font-black text-slate-950">{reports.reduce((total, report) => total + report.freePass, 0)}</p></div>
          </div>
        </section>
        <section className="order-2 space-y-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
          <div>
            <h2 className="font-extrabold text-slate-950">Rincian Keuangan Penjualan</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Hanya transaksi Lunas dan OTS terkonfirmasi atau historis. Angka memakai snapshot harga yang tersimpan saat order dibuat.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-slate-600 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-700">Total Harga Tiket</p><p className="mt-1 break-words text-sm font-black text-slate-950">{financialSummary.ticketSubtotal === null ? '—' : formatPrice(financialSummary.ticketSubtotal)}</p></div>
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-amber-700 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-amber-900">Total Pajak</p><p className="mt-1 break-words text-sm font-black text-slate-950">{financialSummary.tax === null ? '—' : formatPrice(financialSummary.tax)}</p></div>
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-orange-700 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-orange-900">Total Biaya Lainnya</p><p className="mt-1 break-words text-sm font-black text-slate-950">{financialSummary.otherFees === null ? '—' : formatPrice(financialSummary.otherFees)}</p></div>
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-emerald-800 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-900">Total Diskon Voucher</p><p className="mt-1 break-words text-sm font-black text-slate-950">{financialSummary.discount === null ? '—' : formatPrice(financialSummary.discount)}</p></div>
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-blue-800 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-900">Total Pembayaran Pembeli</p><p className="mt-1 break-words text-sm font-black text-slate-950">{formatPrice(financialSummary.buyerPayments)}</p></div>
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-slate-600 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-700">Pendapatan Bersih</p><p className="mt-1 break-words text-sm font-black text-slate-900">—</p></div>
          </div>
          {(financialSummary.missingSubtotalCount > 0 || financialSummary.missingDiscountCount > 0 || financialSummary.unclassifiedFeeCount > 0)
            && <p className="text-xs text-slate-500">Sebagian rincian harga historis tidak tercatat; ditampilkan sebagai — dan tidak dihitung ulang.</p>}
        </section>
        <section className="order-6 space-y-4 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm sm:p-5">
          <div>
            <h2 className="font-extrabold text-slate-950">Pembayaran OTS</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Filter tanggal, metode, dan status berlaku untuk daftar OTS ini. Metode atau penerima yang tidak tercatat ditampilkan sebagai —.</p>
          </div>
          {actionError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{actionError}</p>}
          {actionNotice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800">{actionNotice}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-slate-600 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-700">Transaksi</p><p className="mt-1 text-lg font-black text-slate-950">{filteredOtsOrders.length}</p></div>
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-blue-800 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-900">Tiket Terbit</p><p className="mt-1 text-lg font-black text-slate-950">{otsIssuedTickets}</p></div>
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-slate-600 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-700">Nilai Transaksi</p><p className="mt-1 break-words text-sm font-black text-slate-950">{formatPrice(otsTotalValue)}</p></div>
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-emerald-800 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-900">Dikonfirmasi</p><p className="mt-1 break-words text-sm font-black text-slate-950">{formatPrice(otsConfirmedRevenue)}</p></div>
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-amber-700 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-amber-900">Menunggu</p><p className="mt-1 break-words text-sm font-black text-slate-950">{formatPrice(otsPendingValue)}</p></div>
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-slate-600 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-700">Historis Tanpa Detail</p><p className="mt-1 break-words text-sm font-black text-slate-950">{formatPrice(otsLegacyValue)}</p></div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {otsPaymentGroups.map((group) => <div key={group.key} className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-extrabold text-slate-900">{group.method}</p>
              <p className="mt-1 truncate text-[11px] text-slate-600">{group.recipient}</p>
              <p className="mt-2 text-[10px] text-slate-500">{group.orders} transaksi · Nilai {formatPrice(group.value)}</p>
              <p className="mt-1 text-[10px] font-semibold text-emerald-700">Dikonfirmasi {formatPrice(group.confirmed)} · Menunggu {formatPrice(group.pending)}</p>
            </div>)}
          </div>
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 sm:p-3">
            <div className="flex gap-2">
              <label className="relative min-w-0 flex-1" aria-label="Cari order, pembeli, atau penerima">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={otsRecipientSearch} onChange={(event) => setOtsRecipientSearch(event.target.value)} className="input-field bg-white pl-9 pr-9" placeholder="Cari pembeli, order, penerima..." />
                {otsRecipientSearch && <button type="button" onClick={() => setOtsRecipientSearch('')} aria-label="Hapus pencarian" className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>}
              </label>
              <button type="button" onClick={() => setOtsFiltersOpen((open) => !open)} aria-expanded={otsFiltersOpen} className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${otsFiltersOpen || activeOtsFilterCount ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Filter</span>
                {activeOtsFilterCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-700 px-1 text-[10px] text-white">{activeOtsFilterCount}</span>}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${otsFiltersOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
            {otsFiltersOpen && <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2 sm:grid-cols-4">
              <label className="text-[11px] font-semibold text-slate-600">Tanggal Mulai
                <input type="date" value={otsDateFrom} onChange={(event) => setOtsDateFrom(event.target.value)} className="input-field mt-1 bg-white" />
              </label>
              <label className="text-[11px] font-semibold text-slate-600">Tanggal Sampai
                <input type="date" value={otsDateTo} onChange={(event) => setOtsDateTo(event.target.value)} className="input-field mt-1 bg-white" />
              </label>
              <label className="text-[11px] font-semibold text-slate-600">Metode
                <select value={otsMethodFilter} onChange={(event) => setOtsMethodFilter(event.target.value)} className="input-field mt-1 bg-white">
                  <option value="all">Semua Metode</option><option value="cash">Cash / Tunai</option><option value="qris">QRIS Statis</option><option value="bank_transfer">Transfer Bank</option><option value="unrecorded">Tidak Tercatat (Lama)</option>
                </select>
              </label>
              <label className="text-[11px] font-semibold text-slate-600">Status Pembayaran
                <select value={otsStatusFilter} onChange={(event) => setOtsStatusFilter(event.target.value)} className="input-field mt-1 bg-white">
                  <option value="all">Semua Status</option><option value="pending">Menunggu Konfirmasi</option><option value="confirmed">Terkonfirmasi</option><option value="legacy">Historis Tidak Tercatat</option>
                </select>
              </label>
              {activeOtsFilterCount > 0 && <button type="button" onClick={() => { setOtsDateFrom(''); setOtsDateTo(''); setOtsMethodFilter('all'); setOtsStatusFilter('all'); }} className="col-span-2 justify-self-start text-xs font-bold text-blue-700 hover:text-blue-900 sm:col-span-4">Hapus semua filter</button>}
            </div>}
          </div>
          <p className="text-xs font-semibold text-slate-600">Menampilkan {filteredOtsOrders.length} dari {orders.filter((order) => order.sale_channel === 'ots' && (eventFilter === 'all' || order.event_id === eventFilter)).length} transaksi OTS</p>
          <div className="space-y-2 md:hidden">
            {filteredOtsOrders.map((order) => {
              const isExpanded = detailsOrderId === order.id;
              const paymentStatus = order.ots_payment_status ?? 'legacy';
              return <article key={order.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="space-y-3 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="text-[10px] font-semibold text-slate-500">{new Date(order.created_at).toLocaleString('id-ID')}</p><p className="mt-0.5 break-all font-mono text-[10px] text-slate-500">{order.order_number ?? order.id}</p><p className="mt-1 text-xs font-bold text-slate-900">{events.find((event) => event.id === order.event_id)?.title ?? 'Event tidak ditemukan'}</p><p className="text-[11px] text-slate-500">{order.ticket_category}</p></div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${paymentStatus === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : paymentStatus === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{paymentStatus === 'confirmed' ? 'Terkonfirmasi' : paymentStatus === 'pending' ? 'Menunggu' : 'Historis'}</span>
                  </div>
                  <div className="flex items-end justify-between gap-2 border-t border-slate-100 pt-2">
                    <div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{order.full_name}</p><p className="text-[11px] text-slate-500">{order.whatsapp}</p><p className="mt-1 text-[10px] text-slate-500">{otsPaymentMethodLabel(order)} · {otsRecipientLabel(order)}</p></div>
                    <div className="shrink-0 text-right"><p className="text-[10px] text-slate-500">{order.quantity} tiket</p><p className="text-sm font-black text-slate-900">{formatPrice(order.total_price)}</p></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void togglePaymentHistory(order.id)} className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-blue-700 hover:bg-blue-50">{isExpanded ? 'Tutup Detail' : 'Detail & Riwayat'}</button>
                    {paymentStatus === 'pending' && <button type="button" onClick={() => void confirmOtsPayment(order)} disabled={busyOrderId === order.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60"><CheckCircle2 className="h-3.5 w-3.5" />{busyOrderId === order.id ? 'Menyimpan...' : 'Konfirmasi'}</button>}
                  </div>
                </div>
                {isExpanded && <div className="space-y-2 border-t border-slate-100 bg-slate-50 p-3">
                  <div className="rounded-lg bg-white p-3"><p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Pembayaran Saat Transaksi</p><p className="mt-1 text-xs font-semibold text-slate-800">{otsPaymentMethodLabel(order)} · {order.ots_payment_source === 'website' ? 'Tujuan Website' : order.ots_payment_source === 'other' ? 'Tujuan Lain' : 'Tanpa rekening'}</p><p className="mt-1 break-words text-xs text-slate-700">{otsRecipientLabel(order)}</p>{typeof order.ots_payment_snapshot?.note === 'string' && <p className="mt-1 text-xs text-slate-500">{order.ots_payment_snapshot.note}</p>}{order.ots_payment_confirmed_at && <p className="mt-2 text-xs text-emerald-700">Dikonfirmasi {new Date(order.ots_payment_confirmed_at).toLocaleString('id-ID')}</p>}</div>
                  <div className="rounded-lg bg-white p-3"><p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Riwayat Status</p>{historyLoading ? <p className="mt-2 text-xs text-slate-500">Memuat riwayat...</p> : paymentHistory.length ? <ul className="mt-2 space-y-2">{paymentHistory.map((entry) => <li key={entry.id} className="text-xs text-slate-700">{entry.previous_status ? `${entry.previous_status} → ` : ''}{entry.new_status === 'pending' ? 'Menunggu Konfirmasi' : 'Terkonfirmasi'} · {new Date(entry.created_at).toLocaleString('id-ID')}</li>)}</ul> : <p className="mt-2 text-xs text-slate-500">Riwayat pembayaran tidak tersedia.</p>}</div>
                </div>}
              </article>;
            })}
            {!filteredOtsOrders.length && <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">Tidak ada transaksi yang cocok. Coba ubah pencarian atau filter.</p>}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
            <table className="w-full min-w-[1120px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>
                <th className="px-3 py-2">Tanggal / Order</th><th className="px-3 py-2">Event / Kategori</th><th className="px-3 py-2">Pembeli / WhatsApp</th><th className="px-3 py-2">Jumlah / Total</th><th className="px-3 py-2">Metode / Penerima</th><th className="px-3 py-2">Status Pembayaran</th><th className="px-3 py-2">Admin Pencatat</th><th className="px-3 py-2">Aksi</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOtsOrders.map((order) => {
                  const isExpanded = detailsOrderId === order.id;
                  const paymentStatus = order.ots_payment_status ?? 'legacy';
                  return <Fragment key={order.id}><tr className="align-top">
                    <td className="px-3 py-3"><p className="whitespace-nowrap font-semibold text-slate-800">{new Date(order.created_at).toLocaleString('id-ID')}</p><p className="mt-1 font-mono text-[10px] text-slate-500">{order.order_number ?? order.id}</p></td>
                    <td className="px-3 py-3"><p className="max-w-44 font-semibold text-slate-800">{events.find((event) => event.id === order.event_id)?.title ?? 'Event tidak ditemukan'}</p><p className="mt-1 text-slate-500">{order.ticket_category}</p></td>
                    <td className="px-3 py-3"><p className="font-semibold text-slate-800">{order.full_name}</p><p className="mt-1">{order.whatsapp}</p></td>
                    <td className="px-3 py-3"><p>{order.quantity} tiket</p><p className="mt-1 whitespace-nowrap font-bold text-slate-900">{formatPrice(order.total_price)}</p></td>
                    <td className="px-3 py-3"><p className="font-semibold text-slate-800">{otsPaymentMethodLabel(order)}</p><p className="mt-1 max-w-56 whitespace-normal text-slate-500">{otsRecipientLabel(order)}</p></td>
                    <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${paymentStatus === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : paymentStatus === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{paymentStatus === 'confirmed' ? 'Terkonfirmasi' : paymentStatus === 'pending' ? 'Menunggu Konfirmasi' : 'Historis · Tidak Tercatat'}</span></td>
                    <td className="max-w-36 break-all px-3 py-3 text-slate-600">{order.issued_by ?? '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start gap-2">
                        <button type="button" onClick={() => void togglePaymentHistory(order.id)} className="font-bold text-blue-700 hover:underline">{isExpanded ? 'Tutup Detail' : 'Detail & Riwayat'}</button>
                        {paymentStatus === 'pending' && <button type="button" onClick={() => void confirmOtsPayment(order)} disabled={busyOrderId === order.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-2.5 text-[10px] font-bold text-white hover:bg-emerald-800 disabled:opacity-60"><CheckCircle2 className="h-3.5 w-3.5" />{busyOrderId === order.id ? 'Menyimpan...' : 'Konfirmasi'}</button>}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && <tr><td colSpan={8} className="bg-slate-50 px-4 py-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg bg-white p-3">
                          <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Snapshot Pembayaran Saat Transaksi</p>
                          <p className="mt-2 text-xs font-semibold text-slate-800">{otsPaymentMethodLabel(order)} · {order.ots_payment_source === 'website' ? 'Tujuan Website' : order.ots_payment_source === 'other' ? 'Tujuan Lain' : 'Tanpa rekening'}</p>
                          <p className="mt-1 text-xs text-slate-700">{otsRecipientLabel(order)}</p>
                          {typeof order.ots_payment_snapshot?.note === 'string' && <p className="mt-1 text-xs text-slate-500">{order.ots_payment_snapshot.note}</p>}
                          {order.ots_payment_confirmed_at && <p className="mt-2 text-xs text-emerald-700">Dikonfirmasi {new Date(order.ots_payment_confirmed_at).toLocaleString('id-ID')} · Admin {order.ots_payment_confirmed_by}</p>}
                        </div>
                        <div className="rounded-lg bg-white p-3">
                          <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Riwayat Status Pembayaran</p>
                          {historyLoading && detailsOrderId === order.id ? <p className="mt-2 text-xs text-slate-500">Memuat riwayat...</p>
                            : detailsOrderId === order.id && paymentHistory.length
                              ? <ul className="mt-2 space-y-2">{paymentHistory.map((entry) => <li key={entry.id} className="flex items-start gap-2 text-xs text-slate-700"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /><span>{entry.previous_status ? `${entry.previous_status} → ` : ''}{entry.new_status === 'pending' ? 'Menunggu Konfirmasi' : 'Terkonfirmasi'} · {new Date(entry.created_at).toLocaleString('id-ID')} · Admin {entry.actor_id}</span></li>)}</ul>
                              : <p className="mt-2 text-xs text-slate-500">Riwayat pembayaran tidak tersedia.</p>}
                        </div>
                      </div>
                    </td></tr>}
                  </Fragment>;
                })}
                {!filteredOtsOrders.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-xs text-slate-500">Tidak ada transaksi OTS untuk filter ini.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        {!reports.length ? <div className="order-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Tidak ada Event dalam scope.</div> : <div className="order-4 space-y-4">
          {reports.map((report) => <article key={report.event.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0"><h2 className="text-sm font-extrabold text-slate-950">{report.event.title}</h2><p className="mt-0.5 text-xs text-slate-500">{formatDate(report.event.date)}</p></div>
              <div className="shrink-0 text-right"><p className="text-xs font-bold text-blue-800">{report.onlineSold} ONLINE · {report.otsSold} OTS · {report.freePass} FREE PASS</p><p className="mt-0.5 text-xs font-extrabold text-emerald-800">{formatPrice(report.revenue)}</p></div>
            </header>
            <div className="flex flex-col gap-4 p-3 sm:p-4">
                <section className="order-2">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Penjualan dan Free Pass per Kategori</h3>
                    {report.categories.length > 0 && <button type="button" aria-label={categorySections[report.event.id] === false ? 'Tampilkan kategori' : 'Minimalkan kategori'} title={categorySections[report.event.id] === false ? 'Tampilkan kategori' : 'Minimalkan kategori'} aria-expanded={categorySections[report.event.id] !== false} onClick={() => setCategorySections((current) => ({ ...current, [report.event.id]: current[report.event.id] === false }))} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-200 text-blue-800 hover:bg-blue-50">
                        <ChevronDown className={`h-4 w-4 transition-transform ${categorySections[report.event.id] === false ? '' : 'rotate-180'}`} />
                    </button>}
                  </div>
                {report.categories.length ? categorySections[report.event.id] === false
                  ? null
                  : <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {report.categories.map((row) => <article key={row.category.id} className="rounded-xl border border-slate-300 border-t-2 border-t-blue-800 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-extrabold text-slate-950" title={row.category.name}>{row.category.name}</h4>
                          <p className="mt-0.5 text-[11px] text-slate-500">{row.category.quota == null ? 'Kuota tanpa batas' : `Kuota ${row.category.quota}`}</p>
                        </div>
                        <button type="button" onClick={() => setSelectedCategory({ eventTitle: report.event.title, category: row })} aria-label={`Lihat detail kategori ${row.category.name}`} title="Lihat detail kategori" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-200 text-blue-800 transition hover:bg-blue-50">
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-center">
                        <div><p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-900">Online</p><p className="mt-0.5 text-sm font-bold text-slate-950">{row.onlineSold}</p></div>
                        <div><p className="text-[10px] font-semibold uppercase tracking-wide text-violet-900">OTS</p><p className="mt-0.5 text-sm font-bold text-slate-950">{row.otsSold}</p></div>
                        <div><p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900">Free Pass</p><p className="mt-0.5 text-sm font-bold text-slate-950">{row.freePass}</p></div>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                        <span className="text-slate-500">Pendapatan</span><span className="font-extrabold text-emerald-800">{formatPrice(row.revenue)}</span>
                      </div>
                    </article>)}
                  </div> : <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">Belum ada kategori tiket.</p>}
              </section>
              <section className="order-1"><h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-600">Pendapatan per Rekening / Metode</h3>
                {report.payments.length ? <div className="space-y-2">{report.payments.map((payment) => <div key={payment.key} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-extrabold text-slate-900">{payment.bank} {payment.account !== '—' ? `· ${payment.account}` : ''}</p><p className="mt-0.5 text-[10px] text-slate-500">{payment.recipient} · {payment.method}</p>{payment.qrisRecipient && <p className="mt-0.5 text-[10px] text-slate-500">Penerima QRIS: {payment.qrisRecipient}</p>}<p className="mt-1 text-[10px] font-semibold text-slate-600">{payment.orders} order · {payment.quantity} tiket</p></div><p className="shrink-0 text-xs font-extrabold text-emerald-800">{formatPrice(payment.revenue)}</p></div></div>)}</div> : <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">Belum ada pembayaran lunas.</p>}
              </section>
              <section className="order-3">
                <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-600">Daftar Transaksi Lunas</h3>
                {!report.transactions.length
                  ? <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">Belum ada transaksi yang dihitung sebagai pendapatan.</p>
                  : <>
                    <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200">
                      <table className="w-full min-w-[1320px] text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600 shadow-[0_1px_0_0_#e2e8f0]"><tr>
                          <th className="whitespace-nowrap px-2.5 py-2.5">ID Pesanan</th><th className="px-2.5 py-2.5">Pembeli</th><th className="px-2.5 py-2.5">Event</th><th className="whitespace-nowrap px-2.5 py-2.5">Kategori / Jumlah</th><th className="whitespace-nowrap px-2.5 py-2.5 text-right">Subtotal</th><th className="px-2.5 py-2.5">Voucher / Diskon</th><th className="whitespace-nowrap px-2.5 py-2.5 text-right">Pajak</th><th className="px-2.5 py-2.5">Biaya Lainnya</th><th className="whitespace-nowrap px-2.5 py-2.5 text-right">Total Pembayaran</th><th className="px-2.5 py-2.5">Status</th><th className="px-2.5 py-2.5">Aksi</th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-200">{report.transactions.map((order) => {
                          const financials = orderFinancials(order);
                          const fees = orderFeeAmounts(financials);
                          return <Fragment key={order.id}>
                            <tr className="align-middle odd:bg-white even:bg-slate-50/50">
                              <td className="whitespace-nowrap px-2.5 py-2 font-mono text-[11px] text-slate-600">{order.order_number ?? order.id}</td>
                              <td className="max-w-40 truncate px-2.5 py-2 font-semibold text-slate-900" title={order.full_name}>{order.full_name}</td>
                              <td className="max-w-48 truncate px-2.5 py-2 text-slate-700" title={report.event.title}>{report.event.title}</td>
                              <td className="whitespace-nowrap px-2.5 py-2">{order.ticket_category} · {order.quantity} tiket</td>
                              <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums">{financials.subtotal === null ? '—' : formatPrice(financials.subtotal)}</td>
                              <td className="px-2.5 py-2">{financials.voucherCode ?? '—'}{financials.discount === null ? '' : ` · ${formatPrice(financials.discount)}`}</td>
                              <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums">{fees.tax === null ? '—' : formatPrice(fees.tax)}</td>
                              <td className="max-w-48 truncate px-2.5 py-2" title={fees.otherFees.map((fee) => `${fee.label}: ${formatPrice(fee.amount)}`).join(' · ') || formatPrice(0)}>{fees.otherFees.map((fee) => `${fee.label}: ${formatPrice(fee.amount)}`).join(' · ') || formatPrice(0)}</td>
                              <td className="whitespace-nowrap px-2.5 py-2 text-right font-bold tabular-nums text-blue-900">{formatPrice(order.total_price)}</td>
                              <td className="whitespace-nowrap px-2.5 py-2"><span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">{transactionPaymentStatus(order)}</span></td>
                              <td className="px-2.5 py-2"><button type="button" onClick={() => setSelectedTransaction({ eventTitle: report.event.title, order })} className="inline-flex min-h-9 items-center whitespace-nowrap rounded-lg border border-blue-200 px-2.5 text-[11px] font-bold text-blue-800 hover:bg-blue-50">Lihat Detail</button></td>
                            </tr>
                          </Fragment>;
                        })}</tbody>
                      </table>
                    </div>
                  </>}
              </section>
            </div>
          </article>)}
        </div>}
        </div>
      </>}
      {(selectedCategory || selectedTransaction) && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          setSelectedCategory(null);
          setSelectedTransaction(null);
        }
      }}>
        <section role="dialog" aria-modal="true" aria-labelledby="ticket-report-detail-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
          <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">{selectedCategory ? 'Laporan Kategori Tiket' : 'Rincian Pembayaran'}</p>
              <h2 id="ticket-report-detail-title" className="mt-1 break-words text-lg font-extrabold leading-tight text-slate-950">{selectedCategory?.category.category.name ?? selectedTransaction?.order.full_name}</h2>
              <p className="mt-1 break-words text-xs text-slate-600">{selectedCategory?.eventTitle ?? selectedTransaction?.eventTitle}</p>
              {selectedTransaction && <p className="mt-1 font-mono text-[11px] text-slate-500">Order {selectedTransaction.order.order_number ?? selectedTransaction.order.id}</p>}
            </div>
            <button type="button" onClick={() => { setSelectedCategory(null); setSelectedTransaction(null); }} aria-label="Tutup detail" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /></button>
          </header>
          {selectedCategory && <div className="space-y-4 p-4 sm:p-5">
            <section>
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Ringkasan tiket</h3>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-300 border-l-4 border-l-blue-800 bg-white p-3"><p className="text-[11px] font-semibold text-blue-900">Tiket terjual</p><p className="mt-1 text-2xl font-black text-slate-950">{selectedCategory.category.sold}</p></div>
                <div className="rounded-xl border border-slate-300 border-l-4 border-l-slate-600 bg-white p-3"><p className="text-[11px] font-semibold text-slate-700">Sisa kuota</p><p className="mt-1 text-lg font-extrabold text-slate-950">{selectedCategory.category.unsold == null ? '—' : selectedCategory.category.unsold}</p><p className="text-[10px] text-slate-600">Kuota {selectedCategory.category.category.quota == null ? 'tanpa batas' : selectedCategory.category.category.quota}</p></div>
              </div>
            </section>
            <section>
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Asal penjualan</h3>
              <div className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-300 px-3">
                <div className="flex items-center justify-between py-2.5 text-sm"><span className="text-slate-700">Online</span><span className="font-bold text-indigo-900">{selectedCategory.category.onlineSold} tiket</span></div>
                <div className="flex items-center justify-between py-2.5 text-sm"><span className="text-slate-700">OTS</span><span className="font-bold text-violet-900">{selectedCategory.category.otsSold} tiket</span></div>
                <div className="flex items-center justify-between py-2.5 text-sm"><span className="text-slate-700">Free Pass</span><span className="font-bold text-amber-900">{selectedCategory.category.freePass} tiket</span></div>
              </div>
            </section>
            <div className="flex items-center justify-between rounded-xl border border-emerald-800 bg-white px-3 py-3">
              <div><p className="text-sm font-bold text-emerald-950">Pendapatan tercatat</p><p className="mt-0.5 text-[10px] text-emerald-900">Dari transaksi yang diakui</p></div>
              <p className="text-lg font-black text-emerald-900">{formatReportAmount(selectedCategory.category.revenue)}</p>
            </div>
          </div>}
          {selectedTransaction && selectedTransactionFinancials && selectedTransactionFees && selectedTransactionPayment && <div className="space-y-3 p-4 sm:p-5">
            <section>
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Informasi pembeli</h3>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-slate-300 bg-white p-3">
                <div className="min-w-0"><p className="text-[10px] font-semibold text-slate-700">Status Pembayaran</p><p className="mt-0.5 inline-flex rounded-full bg-emerald-800 px-2 py-0.5 text-[11px] font-bold text-white">{transactionPaymentStatus(selectedTransaction.order)}</p></div>
                <div className="min-w-0"><p className="text-[10px] font-semibold text-slate-700">Kategori &amp; Jumlah</p><p className="mt-0.5 truncate text-xs font-bold text-slate-950" title={`${selectedTransaction.order.ticket_category} · ${selectedTransaction.order.quantity} Tiket`}>{selectedTransaction.order.ticket_category} · {selectedTransaction.order.quantity} Tiket</p></div>
                <div className="col-span-2 min-w-0"><p className="text-[10px] font-semibold text-slate-700">WhatsApp</p><p className="mt-0.5 break-all text-xs font-semibold text-slate-950">{selectedTransaction.order.whatsapp || '—'}</p></div>
              </div>
            </section>
            <section>
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Rincian harga</h3>
              <dl className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-300 px-3">
                <div className="flex items-center justify-between gap-3 py-2 text-xs"><dt className="font-bold uppercase tracking-wide text-slate-800">Harga tiket sebelum diskon</dt><dd className="shrink-0 font-semibold text-slate-900">{selectedTransactionFinancials.subtotal === null ? '—' : formatReportAmount(selectedTransactionFinancials.subtotal)}</dd></div>
                <div className="flex items-center justify-between gap-3 py-2 text-xs"><dt className="text-slate-600">Voucher</dt><dd className="shrink-0 font-semibold text-slate-900">{selectedTransactionFinancials.voucherCode ?? '—'}</dd></div>
                <div className="flex items-center justify-between gap-3 py-2 text-xs"><dt className="text-slate-600">Diskon voucher</dt><dd className="shrink-0 font-semibold text-emerald-800">{selectedTransactionFinancials.discount === null ? '—' : selectedTransactionFinancials.discount > 0 ? `− ${formatReportAmount(selectedTransactionFinancials.discount)}` : formatReportAmount(0)}</dd></div>
                <div className="flex items-center justify-between gap-3 border-l-4 border-l-blue-800 bg-blue-900 px-2 py-2 text-xs"><dt className="font-bold uppercase tracking-wide text-white">Nilai Tiket Setelah Diskon</dt><dd className="shrink-0 font-bold text-white">{selectedTransactionNetTicketValue === null ? '—' : formatReportAmount(selectedTransactionNetTicketValue)}</dd></div>
                <div className="flex items-center justify-between gap-3 py-2 text-xs"><dt className="text-slate-600">Pajak</dt><dd className="shrink-0 font-semibold text-slate-900">{selectedTransactionFees.tax === null ? '—' : formatReportAmount(selectedTransactionFees.tax)}</dd></div>
                {selectedTransactionFinancials.fees.filter((fee) => !fee.label.toLocaleLowerCase('id-ID').includes('pajak')).map((fee) => <div key={fee.label} className="flex items-center justify-between gap-3 py-2 text-xs"><dt className="text-slate-600">{fee.label}</dt><dd className="shrink-0 font-semibold text-slate-900">{formatReportAmount(fee.amount)}</dd></div>)}
                {selectedTransactionFinancials.fees.every((fee) => fee.label.toLocaleLowerCase('id-ID').includes('pajak')) && <div className="flex items-center justify-between gap-3 py-2 text-xs"><dt className="text-slate-600">Biaya lainnya</dt><dd className="shrink-0 font-semibold text-slate-900">{formatReportAmount(0)}</dd></div>}
              </dl>
            </section>
            <section>
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Pembayaran</h3>
              <div className="mt-2 grid grid-cols-2 gap-x-3 rounded-xl border border-slate-300 bg-white px-3 py-2">
                <div className="min-w-0"><p className="text-[10px] font-semibold text-slate-700">Metode</p><p className="mt-0.5 text-xs font-bold text-slate-950">{selectedTransactionPayment.method === 'Transfer bank' ? 'Transfer Bank' : selectedTransactionPayment.method}</p></div>
                <div className="min-w-0"><p className="text-[10px] font-semibold text-slate-700">Penerima</p><p className="mt-0.5 break-words text-xs font-bold text-slate-950">{selectedTransactionPayment.recipient === '—' ? (selectedTransactionPayment.qrisRecipient || '—') : selectedTransactionPayment.recipient}</p></div>
              </div>
            </section>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-blue-900 px-4 py-2.5">
              <p className="text-sm font-bold text-white">Total Pembayaran</p>
              <span className="shrink-0 text-lg font-black text-white">{formatReportAmount(selectedTransaction.order.total_price)}</span>
            </div>
          </div>}
        </section>
      </div>}
      <div className="print-sheet ticket-sales-report-print">
        <div className="print-brand"><img src={LOGO_URL} alt="" /><div><h1>LAPORAN PENJUALAN TIKET</h1><p>{eventFilter === 'all' ? 'Semua Event dalam scope Admin Tiket' : reports[0]?.event.title}</p><p>Dicetak: {new Date().toLocaleString('id-ID')}</p></div></div>
        <table><thead><tr><th>Total Event</th><th>Total Online</th><th>OTS Terkonfirmasi</th><th>Total Free Pass</th><th>Pendapatan Tercatat</th></tr></thead><tbody><tr><td>{reports.length}</td><td>{reports.reduce((total, report) => total + report.onlineSold, 0)}</td><td>{filteredOtsOrders.filter((order) => order.ots_payment_status === 'confirmed').reduce((count, order) => count + order.quantity, 0)}</td><td>{reports.reduce((total, report) => total + report.freePass, 0)}</td><td>{formatPrice(totalRevenue)}</td></tr></tbody></table>
        <h2>Rekap Pendapatan dan Rincian Harga</h2>
        <p className="ticket-report-print-note">Rekap memakai transaksi yang diakui sistem dan snapshot harga saat order dibuat. Nilai tiket setelah diskon belum dikurangi pajak/biaya layanan. Pendapatan bersih penyelenggara tidak ditetapkan tanpa klasifikasi akuntansi yang valid.</p>
        <table className="ticket-report-print-financials">
          <thead><tr><th>Komponen</th><th>Nilai</th><th>Keterangan</th></tr></thead>
          <tbody>
            <tr><td>Total harga tiket (sebelum diskon)</td><td>{financialSummary.ticketSubtotal === null ? '—' : formatPrice(financialSummary.ticketSubtotal)}</td><td>Harga tiket sesuai snapshot transaksi</td></tr>
            <tr><td>Total diskon voucher</td><td>{financialSummary.discount === null ? '—' : `− ${formatPrice(financialSummary.discount)}`}</td><td>Potongan yang tercatat pada order</td></tr>
            <tr className="ticket-report-print-emphasis"><td>Nilai tiket setelah diskon</td><td>{financialSummary.ticketValueAfterDiscount === null ? '—' : formatPrice(financialSummary.ticketValueAfterDiscount)}</td><td>Harga tiket dikurangi diskon; belum termasuk pajak atau biaya</td></tr>
            <tr><td>Total pajak teridentifikasi</td><td>{financialSummary.tax === null ? '—' : formatPrice(financialSummary.tax)}</td><td>Nama biaya dikenali sebagai pajak dari snapshot</td></tr>
            {printedFeeBreakdown.map((fee) => <tr key={fee.label}><td>Rincian biaya: {fee.label}</td><td>{formatPrice(fee.amount)}</td><td>{fee.label.toLocaleLowerCase('id-ID').includes('pajak') ? 'Pajak sesuai label snapshot' : 'Biaya tambahan sesuai label snapshot'}</td></tr>)}
            <tr><td>Total biaya lainnya</td><td>{financialSummary.otherFees === null ? '—' : formatPrice(financialSummary.otherFees)}</td><td>{financialSummary.unclassifiedFeeCount > 0 ? 'Ada komponen biaya historis yang labelnya tidak tercatat' : 'Jumlah seluruh biaya non-pajak yang tercatat'}</td></tr>
            <tr className="ticket-report-print-emphasis"><td>Total pembayaran pembeli</td><td>{formatPrice(financialSummary.buyerPayments)}</td><td>Jumlah total akhir dari transaksi yang diakui</td></tr>
            <tr><td>Pendapatan bersih penyelenggara</td><td>—</td><td>Klasifikasi akuntansi pajak dan biaya belum tersedia</td></tr>
          </tbody>
        </table>
        {reports.map((report) => <section key={report.event.id} className="ticket-report-print-event">
          <h2>{report.event.title}</h2><p>{formatDate(report.event.date)} · {report.event.venue}</p>
          <h3>Penjualan dan Free Pass per Kategori</h3>
          <table><thead><tr><th>Kategori</th><th>Harga Publik</th><th>Kuota</th><th>Online</th><th>OTS</th><th>Free Pass</th><th>Sisa</th><th>Pendapatan</th></tr></thead><tbody>{report.categories.map((row) => <tr key={row.category.id}><td>{row.category.name}</td><td>{row.category.price === null ? '—' : formatPrice(row.category.price)}</td><td>{row.category.quota == null ? 'Tanpa batas' : row.category.quota}</td><td>{row.onlineSold}</td><td>{row.otsSold}</td><td>{row.freePass}</td><td>{row.unsold == null ? '—' : row.unsold}</td><td>{formatPrice(row.revenue)}</td></tr>)}</tbody></table>
          <h3>Pendapatan per Rekening / Metode</h3>
          {report.payments.length ? <table><thead><tr><th>Bank / Metode</th><th>Nomor Rekening</th><th>Penerima</th><th>Penerima QRIS</th><th>Order</th><th>Tiket</th><th>Pendapatan</th></tr></thead><tbody>{report.payments.map((payment) => <tr key={payment.key}><td>{payment.bank} · {payment.method}</td><td>{payment.account}</td><td>{payment.recipient}</td><td>{payment.qrisRecipient || '—'}</td><td>{payment.orders}</td><td>{payment.quantity}</td><td>{formatPrice(payment.revenue)}</td></tr>)}</tbody></table> : <p>Belum ada pembayaran lunas.</p>}
          <h3>Rincian Transaksi Lunas</h3>
          {report.transactions.length ? <table><thead><tr><th>ID Pesanan</th><th>Nama Pembeli</th><th>Event</th><th>Kategori / Jumlah</th><th>Harga Tiket</th><th>Kode Voucher</th><th>Diskon Voucher</th><th>Nilai Tiket Setelah Diskon</th><th>Pajak</th><th>Biaya Lainnya</th><th>Total Pembayaran</th><th>Status</th></tr></thead><tbody>{report.transactions.map((order) => {
            const financials = orderFinancials(order);
            const fees = orderFeeAmounts(financials);
            const ticketValueAfterDiscount = financials.subtotal === null || financials.discount === null ? null : financials.subtotal - financials.discount;
            return <tr key={order.id}><td>{order.order_number ?? order.id}</td><td>{order.full_name}</td><td>{report.event.title}</td><td>{order.ticket_category} · {order.quantity}</td><td>{financials.subtotal === null ? '—' : formatPrice(financials.subtotal)}</td><td>{financials.voucherCode ?? '—'}</td><td>{financials.discount === null ? '—' : financials.discount > 0 ? `− ${formatPrice(financials.discount)}` : formatPrice(0)}</td><td>{ticketValueAfterDiscount === null ? '—' : formatPrice(ticketValueAfterDiscount)}</td><td>{fees.tax === null ? '—' : formatPrice(fees.tax)}</td><td>{fees.otherFees.map((fee) => `${fee.label}: ${formatPrice(fee.amount)}`).join(' · ') || formatPrice(0)}</td><td>{formatPrice(order.total_price)}</td><td>{transactionPaymentStatus(order)}</td></tr>;
          })}</tbody></table> : <p>Belum ada transaksi yang dihitung sebagai pendapatan.</p>}
          <h3>Rincian Pembayaran OTS</h3>
          {filteredOtsOrders.filter((order) => order.event_id === report.event.id).length
            ? <table><thead><tr><th>Tanggal / Order</th><th>Pembeli / WhatsApp</th><th>Metode / Penerima</th><th>Tiket</th><th>Nilai</th><th>Status Pembayaran</th></tr></thead><tbody>{filteredOtsOrders.filter((order) => order.event_id === report.event.id).map((order) => <tr key={order.id}><td>{new Date(order.created_at).toLocaleString('id-ID')} · {order.order_number ?? order.id}</td><td>{order.full_name} · {order.whatsapp}</td><td>{otsPaymentMethodLabel(order)} · {otsRecipientLabel(order)}</td><td>{order.quantity}</td><td>{formatPrice(order.total_price)}</td><td>{order.ots_payment_status === 'confirmed' ? 'Terkonfirmasi' : order.ots_payment_status === 'pending' ? 'Menunggu Konfirmasi' : 'Historis · Tidak Tercatat'}</td></tr>)}</tbody></table>
            : <p>Tidak ada transaksi OTS untuk filter ini.</p>}
          <p className="ticket-report-print-total">Total Event: {report.sold} tiket terjual · {report.freePass} Free Pass · Pendapatan {formatPrice(report.revenue)}</p>
        </section>)}
      </div>
    </div>
  );
}
