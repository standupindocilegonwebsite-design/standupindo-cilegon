import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleAlert, Copy, CreditCard, Eye, Landmark, LoaderCircle, QrCode, Ticket, Upload, UserRound } from 'lucide-react';
import type { Router } from '@/lib/router';
import { LOGO_URL, type EventItem, type EventTicket } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { getImageFileExtension, processImageForUpload, validateImageFile } from '@/lib/image-processing';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { createOrderNumber, formatDate, formatPrice, getEventStatus } from '@/lib/format';

interface PaymentSnapshot {
  recipient_name: string;
  qris_recipient_name?: string | null;
  bank_name: string | null;
  account_number: string | null;
  qris_storage_path: string | null;
  note: string | null;
}

function PaymentInstructions({ method, totalPrice }: { method: PaymentSnapshot; totalPrice: number }) {
  const qrisPath = method.qris_storage_path;
  const hasBankTransfer = Boolean(method.bank_name || method.account_number);
  const hasQris = Boolean(qrisPath);
  const [selectedMethod, setSelectedMethod] = useState<'bank' | 'qris'>(hasBankTransfer ? 'bank' : 'qris');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [qrisPreviewOpen, setQrisPreviewOpen] = useState(false);
  const qrisUrl = qrisPath ? supabase.storage.from('standupindo-media').getPublicUrl(qrisPath).data.publicUrl : '';

  async function copyAccountNumber() {
    if (!method.account_number) return;
    try {
      await navigator.clipboard.writeText(method.account_number);
      setCopied(true);
      setCopyError('');
    } catch {
      setCopied(false);
      setCopyError('Nomor rekening gagal disalin. Silakan salin secara manual.');
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white px-4 py-4 sm:px-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><CreditCard className="h-5 w-5" /></span>
        <div>
          <h2 className="font-extrabold text-slate-900">Informasi Pembayaran</h2>
          <p className="mt-0.5 text-xs text-slate-500">Transfer sesuai jumlah total berikut</p>
        </div>
      </div>
      <div className="space-y-3 p-3 sm:p-4">
        {hasBankTransfer && hasQris && (
          <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1" role="tablist" aria-label="Pilih metode pembayaran">
            <button
              type="button"
              role="tab"
              aria-selected={selectedMethod === 'bank'}
              onClick={() => setSelectedMethod('bank')}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-sm font-bold transition ${selectedMethod === 'bank' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}
            >
              <Landmark className="h-4 w-4" /> Transfer Bank
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedMethod === 'qris'}
              onClick={() => setSelectedMethod('qris')}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-sm font-bold transition ${selectedMethod === 'qris' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}
            >
              <QrCode className="h-4 w-4" /> QRIS
            </button>
          </div>
        )}
        {hasBankTransfer && (!hasQris || selectedMethod === 'bank') && (
          <div className="overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-3.5 shadow-sm sm:p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Landmark className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Transfer ke rekening</p>
                <p className="mt-0.5 truncate text-lg font-black leading-tight text-slate-950">{method.bank_name || 'Rekening Bank'}</p>
              </div>
            </div>
            {method.account_number && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:px-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Nomor rekening</p>
                  <span className="mt-0.5 block break-all font-mono text-xl font-extrabold tracking-wider text-slate-950 sm:text-2xl">{method.account_number}</span>
                </div>
                <button type="button" onClick={() => void copyAccountNumber()} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2" aria-label={copied ? 'Nomor rekening tersalin' : 'Salin nomor rekening'} title={copied ? 'Nomor rekening tersalin' : 'Salin nomor rekening'}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
              </div>
            )}
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-blue-100/80 bg-white/80 px-3 py-3">
              <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Nama penerima</p>
                <p className="mt-0.5 break-words text-sm font-bold text-slate-900">{method.recipient_name}</p>
              </div>
            </div>
            {copyError && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{copyError}</p>}
          </div>
        )}
        {hasQris && (!hasBankTransfer || selectedMethod === 'qris') && (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center gap-2">
              <QrCode className="h-4 w-4 text-blue-700" />
              <p className="text-sm font-bold text-slate-800">Bayar dengan QRIS</p>
            </div>
            <p className="mb-3 text-xs text-slate-500">Pindai kode QR menggunakan aplikasi pembayaran. Penerima: <span className="font-semibold text-slate-700">{method.qris_recipient_name?.trim() || method.recipient_name}</span></p>
            {qrisPath && (
              <>
                <button
                  type="button"
                  onClick={() => setQrisPreviewOpen(true)}
                  className="group mx-auto block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  aria-label="Perbesar QRIS pembayaran"
                  title="Ketuk untuk memperbesar QRIS"
                >
                  <img src={qrisUrl} alt="QRIS pembayaran Event, ketuk untuk memperbesar" className="mx-auto max-h-[70vh] max-w-full rounded-lg border border-slate-200 object-contain transition group-hover:border-blue-400 sm:max-h-[28rem]" />
                  <span className="mt-2 block text-center text-xs font-semibold text-blue-700">Ketuk QRIS untuk melihat lebih besar</span>
                </button>
                <ImageLightbox
                  src={qrisUrl}
                  alt="QRIS pembayaran Event"
                  open={qrisPreviewOpen}
                  onClose={() => setQrisPreviewOpen(false)}
                  closeAriaLabel="Tutup QRIS"
                />
              </>
            )}
          </div>
        )}
        {method.note && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{method.note}</p>}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Jumlah transfer wajib sama</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{formatPrice(totalPrice)}</p>
          <p className="mt-1 text-xs leading-5 text-amber-900">Pastikan jumlah yang ditransfer sama persis dengan total pembayaran agar order dapat diverifikasi.</p>
        </div>
      </div>
    </section>
  );
}

interface SavedTicketOrder {
  id: string;
  order_number: string;
  full_name?: string;
  email?: string | null;
  total_price: number;
  expires_at: string | null;
  ticket_category?: string;
  quantity?: number;
  status?: string;
  payment_method_snapshot: PaymentSnapshot | null;
  price_breakdown?: PriceBreakdownData;
}

interface PriceBreakdownData {
  ticket_subtotal: number;
  discount_amount: number;
  voucher_code: string | null;
  additional_fee_amount: number;
  total_price: number;
  fee?: { label?: string } | null;
  fees?: Array<{ label: string; amount: number }>;
}

interface PriceQuote {
  quantity: number;
  ticket_subtotal: number;
  discount_amount: number;
  additional_fee_amount: number;
  total_price: number;
  voucher_code: string | null;
  price_breakdown: PriceBreakdownData;
}

interface CreatedPricedOrder {
  id: string;
  order_number: string;
  total_price: number;
  price_breakdown: PriceBreakdownData;
}

type BuyerField = 'full_name' | 'email' | 'whatsapp';
type BuyerFieldTouched = Record<BuyerField, boolean>;

function getBuyerFieldError(field: BuyerField, value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    if (field === 'full_name') return 'Nama lengkap wajib diisi.';
    if (field === 'email') return 'Email wajib diisi.';
    return 'Nomor WhatsApp wajib diisi.';
  }

  if (field === 'full_name') {
    return /[\p{L}]/u.test(trimmedValue) && trimmedValue.length >= 2
      ? ''
      : 'Masukkan nama lengkap yang valid.';
  }

  if (field === 'email') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedValue)
      ? ''
      : 'Format email belum benar. Contoh: nama@email.com.';
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

  if (subscriberNumber.length < 9) {
    const missingDigits = 9 - subscriberNumber.length;
    return `Nomor WhatsApp kurang ${missingDigits} angka.`;
  }
  if (subscriberNumber.length > 12) {
    return 'Nomor WhatsApp terlalu panjang. Periksa kembali nomornya.';
  }
  return '';
}

function isPriceBreakdown(value: unknown): value is PriceBreakdownData {
  if (!value || typeof value !== 'object') return false;
  const breakdown = value as Partial<PriceBreakdownData>;
  return typeof breakdown.ticket_subtotal === 'number'
    && typeof breakdown.discount_amount === 'number'
    && typeof breakdown.additional_fee_amount === 'number'
    && typeof breakdown.total_price === 'number';
}

function isPriceQuote(value: unknown): value is PriceQuote {
  if (!value || typeof value !== 'object') return false;
  const quote = value as Partial<PriceQuote>;
  return typeof quote.ticket_subtotal === 'number'
    && typeof quote.quantity === 'number'
    && typeof quote.discount_amount === 'number'
    && typeof quote.additional_fee_amount === 'number'
    && typeof quote.total_price === 'number'
    && isPriceBreakdown(quote.price_breakdown);
}

function isCreatedPricedOrder(value: unknown): value is CreatedPricedOrder {
  if (!value || typeof value !== 'object') return false;
  const order = value as Partial<CreatedPricedOrder>;
  return typeof order.id === 'string'
    && typeof order.order_number === 'string'
    && typeof order.total_price === 'number'
    && isPriceBreakdown(order.price_breakdown);
}

function PriceBreakdown({ quote }: { quote: PriceQuote | null }) {
  if (!quote) return null;
  const feeLines = quote.price_breakdown.fees?.length
    ? quote.price_breakdown.fees
    : quote.additional_fee_amount > 0
      ? [{ label: quote.price_breakdown.fee?.label || 'Biaya Tambahan', amount: quote.additional_fee_amount }]
      : [];
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><CreditCard className="h-4 w-4" /></span>
          <h3 className="text-sm font-extrabold text-slate-900">Rincian Pembayaran</h3>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-100">Harga Terverifikasi</span>
      </div>
      <div className="space-y-3 px-4 py-4 text-sm">
        <div className="flex items-center justify-between gap-3 text-slate-600"><span>Harga Tiket</span><span className="font-medium text-slate-800">{formatPrice(quote.ticket_subtotal / quote.quantity)}</span></div>
        <div className="flex items-center justify-between gap-3 text-slate-600"><span>Jumlah Tiket</span><span className="font-medium text-slate-800">{quote.quantity} Tiket</span></div>
        <div className="border-t border-dashed border-slate-200 pt-3">
          <div className="flex items-center justify-between gap-3 text-slate-700"><span>Subtotal Tiket</span><span className="font-semibold">{formatPrice(quote.ticket_subtotal)}</span></div>
          {quote.discount_amount > 0 && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-emerald-700">
              <span className="flex min-w-0 items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 shrink-0" /><span className="truncate">Diskon{quote.voucher_code ? ` (${quote.voucher_code})` : ''}</span></span>
              <span className="shrink-0 font-bold">−{formatPrice(quote.discount_amount)}</span>
            </div>
          )}
          {feeLines.map((fee, index) => <div key={`${fee.label}-${index}`} className="mt-3 flex items-center justify-between gap-3 text-slate-600"><span>{fee.label}</span><span className="font-medium text-slate-800">{formatPrice(fee.amount)}</span></div>)}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[#d8e2f0] bg-[#f1f5fb] px-3 py-3.5 sm:gap-4 sm:px-4 sm:py-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Total Pembayaran</p>
          <p className="mt-0.5 text-[10px] leading-4 text-slate-500 sm:text-[11px]">Sudah termasuk biaya yang berlaku</p>
        </div>
        <span className="shrink-0 whitespace-nowrap text-lg font-black tracking-tight text-[#23447f] sm:text-xl">{formatPrice(quote.total_price)}</span>
      </div>
    </div>
  );
}

interface Props {
  router: Router;
  slug: string;
  ticketId: string;
}

export function TicketOrderPage({ router, slug, ticketId }: Props) {
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<EventItem | null>(null);
  const [ticket, setTicket] = useState<EventTicket | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentSnapshot | null>(null);
  const [form, setForm] = useState({ full_name: '', email: '', whatsapp: '', quantity: '1' });
  const [buyerFieldsTouched, setBuyerFieldsTouched] = useState<BuyerFieldTouched>({ full_name: false, email: false, whatsapp: false });
  const [buyerValidationSubmitted, setBuyerValidationSubmitted] = useState(false);
  const [voucherCode, setVoucherCode] = useState('');
  const [appliedVoucherCode, setAppliedVoucherCode] = useState('');
  const [priceQuote, setPriceQuote] = useState<PriceQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const quoteRequestId = useRef(0);
  const [error, setError] = useState('');
  const [paymentMethodError, setPaymentMethodError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [paymentConfirmationOpen, setPaymentConfirmationOpen] = useState(false);
  const [orderDetailsOpen, setOrderDetailsOpen] = useState(false);
  const [savedOrder, setSavedOrder] = useState<SavedTicketOrder | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('Draft Pembayaran');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);

  useEffect(() => {
    if (!proofFile) {
      setProofPreviewUrl('');
      return;
    }
    const previewUrl = URL.createObjectURL(proofFile);
    setProofPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [proofFile]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: eventData } = await supabase.from('events').select('*').eq('slug', slug).eq('published', true).maybeSingle();
      const eventRow = eventData as EventItem | null;
      if (!active) return;
      setEvent(eventRow);

      if (eventRow) {
        const { data: ticketData } = await supabase.from('event_tickets').select('*').eq('id', ticketId).eq('event_id', eventRow.id).eq('status', 'active').eq('available_public', true).maybeSingle();
        if (active) setTicket((ticketData as EventTicket) ?? null);
        const { data: paymentAssignment, error: assignmentError } = await supabase.from('event_payment_method_assignments')
          .select('payment_method_id')
          .eq('event_id', eventRow.id).eq('is_active', true).maybeSingle();
        const { data: paymentData, error: paymentError } = paymentAssignment
          ? await supabase.from('event_payment_methods')
            .select('recipient_name, qris_recipient_name, bank_name, account_number, qris_storage_path, note')
            .eq('id', paymentAssignment.payment_method_id).maybeSingle()
          : { data: null, error: assignmentError };
        if (active) {
          setPaymentMethod((paymentData as PaymentSnapshot | null) ?? null);
          if (assignmentError || paymentError) setPaymentMethodError('Informasi pembayaran Event gagal dimuat. Muat ulang halaman sebelum mengirim order.');
          else if (!paymentData) setPaymentMethodError('Informasi pembayaran untuk Event ini belum tersedia.');
        }
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [slug, ticketId]);

  const quantity = Math.max(1, Math.min(10, Number.parseInt(form.quantity, 10) || 1));
  const totalPrice = ticket ? ticket.price * quantity : 0;
  const displayedTotal = priceQuote?.total_price ?? totalPrice;
  const currentStatus = event ? getEventStatus(event.status, event.date) : 'completed';
  const buyerFieldStates = {
    full_name: { error: buyerFieldsTouched.full_name || buyerValidationSubmitted ? getBuyerFieldError('full_name', form.full_name) : '', valid: (buyerFieldsTouched.full_name || buyerValidationSubmitted) && Boolean(form.full_name.trim()) && !getBuyerFieldError('full_name', form.full_name) },
    email: { error: buyerFieldsTouched.email || buyerValidationSubmitted ? getBuyerFieldError('email', form.email) : '', valid: (buyerFieldsTouched.email || buyerValidationSubmitted) && Boolean(form.email.trim()) && !getBuyerFieldError('email', form.email) },
    whatsapp: { error: buyerFieldsTouched.whatsapp || buyerValidationSubmitted ? getBuyerFieldError('whatsapp', form.whatsapp) : '', valid: (buyerFieldsTouched.whatsapp || buyerValidationSubmitted) && Boolean(form.whatsapp.trim()) && !getBuyerFieldError('whatsapp', form.whatsapp) },
  };
  const quantityIsValid = /^\d+$/.test(form.quantity) && Number(form.quantity) >= 1 && Number(form.quantity) <= 10;
  const buyerInfoReady = quantityIsValid
    && (['full_name', 'email', 'whatsapp'] as const).every((field) => !getBuyerFieldError(field, form[field]));

  useEffect(() => {
    let active = true;
    if (savedOrder) return () => { active = false; };
    if (!event || !ticket || !buyerInfoReady) {
      setPriceQuote(null);
      setQuoteLoading(false);
      setAppliedVoucherCode('');
      return () => { active = false; };
    }
    const timeout = window.setTimeout(() => {
      const requestId = ++quoteRequestId.current;
      setQuoteLoading(true);
      void (async () => {
        try {
        const { data, error: priceError } = await supabase.rpc('quote_ticket_order', {
          p_event_id: event.id,
          p_ticket_id: ticket.id,
          p_quantity: quantity,
          p_whatsapp: '',
          p_voucher_code: null,
        });
        if (!active) return;
        if (requestId !== quoteRequestId.current) return;
        setQuoteLoading(false);
        if (priceError) {
          console.error('Rincian harga tiket gagal dihitung.', priceError);
          setQuoteError(`Rincian harga belum dapat dimuat: ${priceError.message}`);
          setPriceQuote(null);
          return;
        }
        if (!isPriceQuote(data)) {
          console.error('Server mengembalikan bentuk rincian harga yang tidak valid.');
          setQuoteError('Rincian harga dari server tidak valid. Silakan muat ulang halaman.');
          setPriceQuote(null);
          return;
        }
        setQuoteError('');
        setPriceQuote(data);
        } catch (priceError) {
        if (!active || requestId !== quoteRequestId.current) return;
        setQuoteLoading(false);
        console.error('Rincian harga tiket gagal dimuat.', priceError);
        setQuoteError('Rincian harga gagal dimuat. Periksa koneksi lalu coba lagi.');
        }
      })();
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [event, ticket, quantity, buyerInfoReady, form.whatsapp, savedOrder, quoteRefresh]);

  function setWhatsapp(value: string) {
    quoteRequestId.current += 1;
    setPriceQuote(null);
    setQuoteLoading(false);
    setVoucherLoading(false);
    setQuoteError('');
    setAppliedVoucherCode('');
    setQuoteRefresh((current) => current + 1);
    setForm((current) => ({ ...current, whatsapp: value }));
  }

  function updateBuyerField(field: BuyerField, value: string) {
    if (voucherLoading) {
      quoteRequestId.current += 1;
      setQuoteLoading(false);
      setVoucherLoading(false);
    }
    setForm((current) => ({ ...current, [field]: value }));
  }

  function touchBuyerField(field: BuyerField) {
    setBuyerFieldsTouched((current) => ({ ...current, [field]: true }));
  }

  function markBuyerFieldsForValidation() {
    setBuyerValidationSubmitted(true);
    setBuyerFieldsTouched({ full_name: true, email: true, whatsapp: true });
    const firstInvalidField = (['full_name', 'email', 'whatsapp'] as const)
      .find((field) => getBuyerFieldError(field, form[field]));
    if (firstInvalidField) {
      window.setTimeout(() => document.getElementById(`ticket-order-${firstInvalidField === 'full_name' ? 'name' : firstInvalidField}`)?.focus(), 0);
      return false;
    }
    return true;
  }

  function setQuantity(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 2);
    const parsedQuantity = Number.parseInt(digits, 10);
    const quantity = digits && parsedQuantity > 10 ? '10' : digits;
    quoteRequestId.current += 1;
    setPriceQuote(null);
    setQuoteLoading(false);
    setVoucherLoading(false);
    setQuoteError('');
    setAppliedVoucherCode('');
    setQuoteRefresh((current) => current + 1);
    setForm((current) => ({ ...current, quantity }));
  }

  function adjustQuantity(change: number) {
    const currentQuantity = Number.parseInt(form.quantity, 10) || 1;
    setQuantity(String(Math.max(1, Math.min(10, currentQuantity + change))));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!event || !ticket) return;
    setError('');

    if (!markBuyerFieldsForValidation()) return;
    if (!legalAccepted) {
      setError('Setujui Syarat & Ketentuan serta Kebijakan Privasi sebelum melanjutkan.');
      return;
    }
    if (!/^\d+$/.test(form.quantity) || Number(form.quantity) < 1 || Number(form.quantity) > 10) {
      setError('Jumlah tiket harus antara 1 dan 10.');
      return;
    }
    if (!paymentMethod) {
      setError(paymentMethodError || 'Informasi pembayaran Event belum tersedia.');
      return;
    }
    if (!proofFile) {
      setError('Upload bukti transfer sebelum mengirim order.');
      return;
    }
    if (voucherCode.trim() && voucherCode.trim() !== appliedVoucherCode) {
      setError('Tekan tombol Pakai untuk memeriksa voucher sebelum mengirim order.');
      return;
    }
    const proofValidationError = validateImageFile(proofFile);
    if (proofValidationError) {
      setError(proofValidationError);
      return;
    }
    if (savedOrder) {
      setError('');
      setPaymentConfirmationOpen(true);
      return;
    }
    setError('');
    setQuoteError('');
    setQuoteLoading(true);
    const requestId = ++quoteRequestId.current;
    try {
      const { data: quoteData, error: priceError } = await supabase.rpc('quote_ticket_order', {
        p_event_id: event.id,
        p_ticket_id: ticket.id,
        p_quantity: quantity,
        p_whatsapp: form.whatsapp,
        p_voucher_code: appliedVoucherCode || null,
      });
      if (requestId !== quoteRequestId.current) return;
      setQuoteLoading(false);
      if (priceError) {
        setQuoteError(priceError.message || 'Rincian harga atau voucher gagal diverifikasi.');
        setError(priceError.message || 'Rincian harga atau voucher gagal diverifikasi.');
        return;
      }
      if (!isPriceQuote(quoteData)) {
        const message = 'Rincian harga dari server tidak valid. Silakan muat ulang halaman.';
        setQuoteError(message);
        setError(message);
        return;
      }
      setQuoteError('');
      setPriceQuote(quoteData);
      setPaymentConfirmationOpen(true);
    } catch (priceError) {
      if (requestId !== quoteRequestId.current) return;
      console.error('Rincian harga atau voucher gagal diverifikasi.', priceError);
      const message = priceError instanceof Error ? priceError.message : 'Rincian harga atau voucher gagal diverifikasi.';
      setQuoteLoading(false);
      setQuoteError(message);
      setError(message);
    }
  }

  async function applyVoucher() {
    if (!event || !ticket || !voucherCode.trim()) {
      setQuoteError('Masukkan kode voucher terlebih dahulu.');
      return;
    }
    if (!buyerInfoReady) {
      markBuyerFieldsForValidation();
      setQuoteError('Lengkapi data pembeli dan jumlah tiket sebelum memeriksa voucher.');
      return;
    }
    const codeToApply = voucherCode.trim();
    const requestId = ++quoteRequestId.current;
    setQuoteLoading(true);
    setVoucherLoading(true);
    setQuoteError('');
    try {
      const { data, error: applyError } = await supabase.rpc('quote_ticket_order', {
        p_event_id: event.id,
        p_ticket_id: ticket.id,
        p_quantity: quantity,
        p_whatsapp: form.whatsapp,
        p_voucher_code: codeToApply,
      });
      if (requestId !== quoteRequestId.current) return;
      setQuoteLoading(false);
      setVoucherLoading(false);
      if (applyError) {
        console.error('Voucher gagal diverifikasi.', applyError);
        setQuoteError(applyError.message || 'Voucher gagal diverifikasi.');
        return;
      }
      if (!isPriceQuote(data)) {
        setQuoteError('Rincian harga dari server tidak valid. Silakan muat ulang halaman.');
        return;
      }
      setAppliedVoucherCode(codeToApply);
      setPriceQuote(data);
    } catch (applyError) {
      if (requestId !== quoteRequestId.current) return;
      console.error('Voucher gagal diverifikasi.', applyError);
      setQuoteLoading(false);
      setVoucherLoading(false);
      setQuoteError(applyError instanceof Error ? applyError.message : 'Voucher gagal diverifikasi.');
    }
  }

  function updateVoucherCode(value: string) {
    const nextCode = value.toUpperCase();
    const cancelVoucherCheck = voucherLoading;
    if (cancelVoucherCheck) {
      quoteRequestId.current += 1;
      setQuoteLoading(false);
      setVoucherLoading(false);
    }
    setVoucherCode(nextCode);
    setQuoteError('');
    if (appliedVoucherCode && nextCode.trim() !== appliedVoucherCode) {
      setAppliedVoucherCode('');
      setPriceQuote(null);
      setQuoteRefresh((current) => current + 1);
    } else if (cancelVoucherCheck) {
      setQuoteRefresh((current) => current + 1);
    }
  }

  async function uploadPaymentProof(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!savedOrder || !proofFile) {
      setError('Pilih bukti pembayaran terlebih dahulu.');
      return;
    }
    const proofValidationError = validateImageFile(proofFile);
    if (proofValidationError) {
      setError(proofValidationError);
      return;
    }
    setError('');
    setPaymentConfirmationOpen(true);
  }

  async function confirmPaymentProof() {
    if (!legalAccepted) {
      setError('Setujui Syarat & Ketentuan serta Kebijakan Privasi sebelum mengirim order.');
      setPaymentConfirmationOpen(false);
      return;
    }
    if (!event || !ticket || !proofFile) return;
    setUploadingProof(true);
    setError('');
    let uploadFile: Blob;
    try {
      uploadFile = await processImageForUpload(proofFile, 'payment-proof');
    } catch (processingError) {
      console.error('Bukti pembayaran gagal diproses.', processingError);
      setUploadingProof(false);
      setError(processingError instanceof Error ? processingError.message : 'Bukti pembayaran gagal diproses.');
      return;
    }
    let order = savedOrder;
    if (!order) {
      if (!paymentMethod) {
        setUploadingProof(false);
        setError(paymentMethodError || 'Informasi pembayaran Event belum tersedia.');
        return;
      }
      const orderNumber = createOrderNumber(event.title);
      const { data: createdOrder, error: orderError } = await supabase.rpc('create_ticket_order_priced', {
        p_order_number: orderNumber,
        p_event_id: event.id,
        p_ticket_id: ticket.id,
        p_full_name: form.full_name.trim(),
        p_email: form.email.trim().toLowerCase(),
        p_whatsapp: form.whatsapp,
        p_quantity: quantity,
        p_notes: null,
        p_voucher_code: appliedVoucherCode || null,
      });
      if (orderError || !isCreatedPricedOrder(createdOrder)) {
        setUploadingProof(false);
        setError(orderError?.message ?? 'Order belum berhasil dibuat. Periksa ketersediaan tiket dan informasi pembayaran Event.');
        return;
      }
      order = {
        id: createdOrder.id,
        order_number: orderNumber,
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        total_price: createdOrder.total_price,
        expires_at: null,
        ticket_category: ticket.name,
        quantity,
        status: 'Menunggu Pembayaran',
        payment_method_snapshot: paymentMethod,
        price_breakdown: createdOrder.price_breakdown,
      };
      setPriceQuote({
        quantity,
        ticket_subtotal: order.price_breakdown?.ticket_subtotal ?? totalPrice,
        discount_amount: order.price_breakdown?.discount_amount ?? 0,
        additional_fee_amount: order.price_breakdown?.additional_fee_amount ?? 0,
        total_price: order.total_price,
        voucher_code: order.price_breakdown?.voucher_code ?? null,
        price_breakdown: order.price_breakdown ?? {
          ticket_subtotal: totalPrice,
          discount_amount: 0,
          additional_fee_amount: 0,
          total_price: order.total_price,
          voucher_code: null,
        },
      });
      setSavedOrder(order);
    }
    const { data: uploadData, error: uploadLinkError } = await supabase.functions.invoke('ticketing-public', {
      body: {
        action: 'create-proof-upload',
        order_id: order.id,
        whatsapp: form.whatsapp,
        file_name: `${proofFile.name.replace(/\.[^.]+$/, '')}.${getImageFileExtension(uploadFile.type)}`,
        file_type: uploadFile.type,
      },
    });
    if (uploadLinkError || uploadData?.error) {
      setUploadingProof(false);
      setError(uploadLinkError?.message ?? uploadData?.error ?? 'Link upload bukti gagal dibuat.');
      return;
    }
    const { error: fileError } = await supabase.storage.from('ticket-payment-proofs').uploadToSignedUrl(uploadData.path, uploadData.token, uploadFile, { contentType: uploadFile.type, upsert: false });
    if (fileError) {
      setUploadingProof(false);
      setError('Bukti pembayaran gagal diupload. Coba pilih ulang file.');
      return;
    }
    const { data, error: submitError } = await supabase.functions.invoke('ticketing-public', {
      body: { action: 'submit-payment', order_id: order.id, whatsapp: form.whatsapp, payment_amount: order.total_price, proof_path: uploadData.path },
    });
    setUploadingProof(false);
    if (submitError || data?.error) {
      setError(submitError?.message ?? data?.error ?? 'Bukti pembayaran gagal dikirim.');
      return;
    }
    setPaymentStatus('Menunggu Verifikasi');
    setPaymentConfirmationOpen(false);
    setSubmitted(true);
  }

  if (loading) {
    return <><PageHeader router={router} title="Pesan Tiket" /><div className="container-app py-8"><LoadingSkeleton count={1} /></div></>;
  }

  if (!event || !ticket || currentStatus !== 'upcoming') {
    return <><PageHeader router={router} title="Tiket tidak tersedia" /><div className="container-app py-8"><div className="card p-8 text-center text-sm text-slate-500">Tiket ini tidak tersedia atau event sudah selesai.</div></div></>;
  }

  if (submitted) {
    const canContinuePayment = paymentStatus === 'Draft Pembayaran' || paymentStatus === 'Menunggu Pembayaran';
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title="Pesanan Tersimpan" subtitle={event.title} />
        <div className="container-app py-8">
          <div className="mx-auto max-w-xl space-y-4">
            <div className="card p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nama</p>
                  <h2 className="mt-1 truncate text-lg font-extrabold text-slate-900">{savedOrder?.full_name ?? form.full_name}</h2>
                  <p className="mt-2 text-sm font-semibold text-slate-700">{event.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{savedOrder?.quantity ?? quantity} tiket</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Total bayar</p>
                  <p className="mt-0.5 text-xl font-black text-slate-900">{formatPrice(savedOrder?.total_price ?? displayedTotal)}</p>
                </div>
                <button type="button" onClick={() => setOrderDetailsOpen(true)} aria-label="Lihat detail order" title="Lihat detail order" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100">
                  <Eye className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-sm font-semibold">
                <CheckCircle2 className={`h-5 w-5 ${paymentStatus === 'Lunas' ? 'text-emerald-600' : 'text-blue-600'}`} />
                <span className={paymentStatus === 'Lunas' ? 'text-emerald-700' : 'text-blue-800'}>{paymentStatus === 'Lunas' ? 'Pembayaran terverifikasi' : canContinuePayment ? 'Menunggu bukti pembayaran' : 'Menunggu verifikasi pembayaran'}</span>
              </div>
            </div>
            {canContinuePayment && <form onSubmit={(e) => void uploadPaymentProof(e)} className="card space-y-4 p-5">
              <h3 className="font-extrabold text-slate-900">Kirim Bukti Pembayaran</h3>
              <div><label className="label-field" htmlFor="ticket-payment-proof">Bukti transfer</label><input id="ticket-payment-proof" type="file" accept="image/jpeg,image/png,image/webp" onChange={(input) => setProofFile(input.target.files?.[0] ?? null)} className="input-field" required /><p className="mt-1 text-xs text-slate-500">JPG, PNG, WEBP · Maks. 5 MB</p></div>
              {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
              <button type="submit" disabled={uploadingProof} className="btn-primary w-full">{uploadingProof ? 'Mengirim bukti...' : <><Upload className="h-4 w-4" /> Kirim Bukti Pembayaran</>}</button>
            </form>}
            {paymentStatus === 'Menunggu Verifikasi' && <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800">
              <p>Bukti pembayaran diterima. Order sudah masuk ke Admin Tiket untuk diverifikasi.</p>
            </div>}
            {paymentStatus === 'Lunas' && <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><p>Order telah disetujui dan lunas.</p><button type="button" onClick={() => router.navigate('/tiket')} className="btn-primary w-full">Buka Tiket Saya</button></div>}
            {paymentStatus !== 'Menunggu Verifikasi' && paymentStatus !== 'Lunas' && !canContinuePayment && <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900"><p>Status order: {paymentStatus}.</p>{paymentStatus === 'Ditolak' && <button type="button" onClick={() => { setSubmitted(false); setSavedOrder(null); setPaymentStatus('Draft Pembayaran'); setProofFile(null); setError(''); }} className="btn-primary w-full">Buat Order Baru</button>}</div>}
            <Modal open={orderDetailsOpen} onClose={() => setOrderDetailsOpen(false)} title="Detail Order" size="lg">
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><p className="text-xs font-semibold text-slate-500">Nomor order</p><p className="mt-0.5 font-mono font-bold text-slate-900">{savedOrder?.order_number}</p></div>
                    <div><p className="text-xs font-semibold text-slate-500">Status</p><p className="mt-0.5 font-bold text-slate-900">{paymentStatus}</p></div>
                    <div><p className="text-xs font-semibold text-slate-500">Nama</p><p className="mt-0.5 font-semibold text-slate-900">{savedOrder?.full_name ?? form.full_name}</p></div>
                    <div><p className="text-xs font-semibold text-slate-500">Email</p><p className="mt-0.5 break-all font-semibold text-slate-900">{savedOrder?.email ?? form.email}</p></div>
                    <div><p className="text-xs font-semibold text-slate-500">WhatsApp</p><p className="mt-0.5 font-semibold text-slate-900">{form.whatsapp}</p></div>
                    <div><p className="text-xs font-semibold text-slate-500">Event</p><p className="mt-0.5 font-semibold text-slate-900">{event.title}</p></div>
                    <div><p className="text-xs font-semibold text-slate-500">Tiket</p><p className="mt-0.5 font-semibold text-slate-900">{savedOrder?.ticket_category ?? ticket.name} · {savedOrder?.quantity ?? quantity} tiket</p></div>
                    <div><p className="text-xs font-semibold text-slate-500">Total bayar</p><p className="mt-0.5 font-extrabold text-slate-900">{formatPrice(savedOrder?.total_price ?? displayedTotal)}</p></div>
                  </div>
                </div>
                {savedOrder?.payment_method_snapshot && canContinuePayment && <PaymentInstructions method={savedOrder.payment_method_snapshot} totalPrice={savedOrder.total_price} />}
                {proofFile && proofPreviewUrl && <section className="rounded-xl border border-blue-200 bg-white p-4">
                  <h3 className="mb-3 font-extrabold text-slate-900">Pratinjau bukti transfer</h3>
                  <img src={proofPreviewUrl} alt="Bukti transfer yang telah dikirim" className="mx-auto max-h-[60vh] w-full rounded-lg object-contain" />
                  <p className="mt-2 truncate text-center text-xs text-slate-500">{proofFile.name}</p>
                </section>}
                {paymentStatus === 'Lunas' && <button type="button" onClick={() => router.navigate('/tiket')} className="btn-primary w-full">Buka Tiket Saya</button>}
                <button type="button" onClick={() => setOrderDetailsOpen(false)} className="btn-secondary w-full">Tutup detail</button>
              </div>
            </Modal>
            <Modal open={paymentConfirmationOpen} onClose={() => !uploadingProof && setPaymentConfirmationOpen(false)} title="Konfirmasi Pembayaran" size="md">
              <div className="space-y-4">
                <p className="text-sm font-medium text-slate-700">Pastikan data dan bukti pembayaran berikut sudah benar sebelum dikirim.</p>
                <div className="review-summary">
                  <div className="review-row"><span className="review-label">Nama</span><span className="review-value">{savedOrder?.full_name ?? form.full_name}</span></div>
                  <div className="review-row"><span className="review-label">Email</span><span className="review-value">{savedOrder?.email ?? form.email}</span></div>
                  <div className="review-row"><span className="review-label">WhatsApp</span><span className="review-value">{form.whatsapp}</span></div>
                  <div className="review-row"><span className="review-label">Tiket</span><span className="review-value">{savedOrder?.ticket_category ?? ticket.name}</span></div>
                  <div className="review-row"><span className="review-label">Jumlah</span><span className="review-value">{savedOrder?.quantity ?? quantity}</span></div>
                  <PriceBreakdown quote={priceQuote} />
                  <div className="review-row"><span className="review-label">Bukti transfer</span><span className="review-value">{proofFile?.name}</span></div>
                  <div className="review-row"><span className="review-label">Bukti</span><span className="review-value">{proofFile?.name}</span></div>
                </div>
                {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <button type="button" onClick={() => setPaymentConfirmationOpen(false)} disabled={uploadingProof} className="btn-secondary flex-1">Periksa Lagi</button>
                  <button type="button" onClick={() => void confirmPaymentProof()} disabled={uploadingProof || !legalAccepted} className="btn-primary flex-1">
                    {uploadingProof ? 'Membuat order dan mengirim bukti...' : <><ArrowRight className="h-4 w-4" /> Konfirmasi &amp; Kirim Orderan</>}
                  </button>
                </div>
              </div>
            </Modal>
            <button type="button" onClick={() => router.navigate(`/event/${event.slug}`)} className="btn-secondary w-full">Kembali ke Event</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Pesan Tiket" />
      <div className="container-app py-8 sm:py-10">
        <div className="mx-auto max-w-2xl">
          <form data-scroll-reveal noValidate onSubmit={submit} className="scroll-reveal card space-y-4 p-5 sm:p-7">
            <div className="flex items-stretch gap-3 border-b border-slate-100 pb-5">
              {event.poster ? (
                <img src={event.poster} alt={`Poster ${event.title}`} className="w-24 shrink-0 self-stretch rounded-xl bg-white object-contain ring-1 ring-slate-200 sm:w-28" />
              ) : (
                <span className="flex w-24 shrink-0 items-center justify-center self-stretch overflow-hidden rounded-xl bg-white ring-1 ring-blue-100 sm:w-28">
                  <img src={LOGO_URL} alt="Logo Standupindo Cilegon" className="h-9 w-9 object-contain" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="mb-1 line-clamp-2 text-xs font-semibold leading-4 text-slate-500">{event.title}</p>
                <h2 className="font-extrabold text-slate-900">{ticket.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{formatDate(event.date)} · {event.venue}</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{formatPrice(ticket.price)}</p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Ticket className="h-5 w-5" /></span>
            </div>

            <div>
              <label className="label-field" htmlFor="ticket-order-name">Nama Lengkap</label>
              <div className="relative">
                <input id="ticket-order-name" name="name" type="text" required disabled={Boolean(savedOrder)} value={form.full_name} onChange={(e) => updateBuyerField('full_name', e.target.value)} onBlur={(e) => { updateBuyerField('full_name', e.currentTarget.value); touchBuyerField('full_name'); }} aria-invalid={Boolean(buyerFieldStates.full_name.error)} aria-describedby={buyerFieldStates.full_name.error ? 'ticket-order-name-error' : undefined} className={`input-field pr-11 ${buyerFieldStates.full_name.error ? '!border-red-500 focus:!border-red-500 focus:!ring-red-500/20' : buyerFieldStates.full_name.valid ? '!border-emerald-500 focus:!border-emerald-500 focus:!ring-emerald-500/20' : ''}`} placeholder="Contoh: Budi Santoso" autoComplete="name" />
                {buyerFieldStates.full_name.error
                  ? <CircleAlert aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-500" />
                  : buyerFieldStates.full_name.valid && <CheckCircle2 aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-600" />}
              </div>
              {buyerFieldStates.full_name.error && <p id="ticket-order-name-error" role="alert" className="mt-1 text-xs font-medium text-red-600">{buyerFieldStates.full_name.error}</p>}
            </div>
            <div>
              <label className="label-field mb-0" htmlFor="ticket-order-email">Email</label>
              <p className="mb-2 text-xs text-slate-500">(Gunakan email aktif)</p>
              <div className="relative">
                <input id="ticket-order-email" name="email" required disabled={Boolean(savedOrder)} type="email" value={form.email} onChange={(e) => updateBuyerField('email', e.target.value)} onBlur={(e) => { updateBuyerField('email', e.currentTarget.value); touchBuyerField('email'); }} aria-invalid={Boolean(buyerFieldStates.email.error)} aria-describedby={buyerFieldStates.email.error ? 'ticket-order-email-error' : undefined} className={`input-field pr-11 ${buyerFieldStates.email.error ? '!border-red-500 focus:!border-red-500 focus:!ring-red-500/20' : buyerFieldStates.email.valid ? '!border-emerald-500 focus:!border-emerald-500 focus:!ring-emerald-500/20' : ''}`} placeholder="Contoh: budi@email.com" autoComplete="email" />
                {buyerFieldStates.email.error
                  ? <CircleAlert aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-500" />
                  : buyerFieldStates.email.valid && <CheckCircle2 aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-600" />}
              </div>
              {buyerFieldStates.email.error && <p id="ticket-order-email-error" role="alert" className="mt-1 text-xs font-medium text-red-600">{buyerFieldStates.email.error}</p>}
            </div>
            <div>
              <label className="label-field mb-0" htmlFor="ticket-order-whatsapp">Nomor WhatsApp</label>
              <p className="mb-2 text-xs text-slate-500">(Gunakan nomor WhatsApp aktif)</p>
              <div className="relative">
                <input id="ticket-order-whatsapp" name="tel" required disabled={Boolean(savedOrder)} type="tel" inputMode="tel" value={form.whatsapp} onChange={(e) => setWhatsapp(e.target.value)} onBlur={(e) => { setWhatsapp(e.currentTarget.value); touchBuyerField('whatsapp'); }} aria-invalid={Boolean(buyerFieldStates.whatsapp.error)} aria-describedby={buyerFieldStates.whatsapp.error ? 'ticket-order-whatsapp-error' : undefined} className={`input-field pr-11 ${buyerFieldStates.whatsapp.error ? '!border-red-500 focus:!border-red-500 focus:!ring-red-500/20' : buyerFieldStates.whatsapp.valid ? '!border-emerald-500 focus:!border-emerald-500 focus:!ring-emerald-500/20' : ''}`} placeholder="08xxxxxxxxxx" autoComplete="tel" />
                {buyerFieldStates.whatsapp.error
                  ? <CircleAlert aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-500" />
                  : buyerFieldStates.whatsapp.valid && <CheckCircle2 aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-600" />}
              </div>
              {buyerFieldStates.whatsapp.error && <p id="ticket-order-whatsapp-error" role="alert" className="mt-1 text-xs font-medium text-red-600">{buyerFieldStates.whatsapp.error}</p>}
            </div>
            <div>
              <label className="label-field" htmlFor="ticket-order-quantity">Jumlah Tiket</label>
              <div className="inline-flex h-11 items-center overflow-hidden rounded-xl border border-slate-300 bg-white">
                <button type="button" aria-label="Kurangi jumlah tiket" disabled={Boolean(savedOrder) || quantity <= 1} onClick={() => adjustQuantity(-1)} className="flex h-full w-11 items-center justify-center text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <input id="ticket-order-quantity" required disabled={Boolean(savedOrder)} type="text" inputMode="numeric" pattern="[1-9]|10" maxLength={2} value={form.quantity} onChange={(e) => setQuantity(e.target.value)} className="h-full w-10 border-x border-slate-200 bg-transparent p-0 text-center text-base font-semibold text-slate-900 outline-none disabled:opacity-60" aria-label="Jumlah tiket" />
                <button type="button" aria-label="Tambah jumlah tiket" disabled={Boolean(savedOrder) || quantity >= 10} onClick={() => adjustQuantity(1)} className="flex h-full w-11 items-center justify-center text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">Maksimal 10 tiket per pesanan.</p>
            </div>

            <div>
              <label className="label-field" htmlFor="ticket-voucher-code">Kode Voucher (Opsional)</label>
              <div className="flex min-w-0 items-stretch gap-2">
                <input id="ticket-voucher-code" disabled={Boolean(savedOrder)} value={voucherCode} onChange={(input) => updateVoucherCode(input.target.value)} onKeyDown={(input) => { if (input.key === 'Enter') { input.preventDefault(); void applyVoucher(); } }} className="input-field min-w-0 flex-1 font-mono font-semibold uppercase" autoComplete="off" placeholder="Masukkan Kode Voucher" />
                <button type="button" onClick={() => void applyVoucher()} disabled={Boolean(savedOrder) || voucherLoading || !buyerInfoReady} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#1028ff] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 sm:px-5">
                  {voucherLoading ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Memeriksa</> : <>Pakai <ArrowRight className="h-4 w-4" /></>}
                </button>
              </div>
              {!buyerInfoReady && <p className="mt-1 text-xs text-slate-500">Lengkapi nama, email, WhatsApp, dan jumlah tiket untuk memakai voucher.</p>}
              {voucherCode.trim() && voucherCode.trim() !== appliedVoucherCode && !quoteError && <p className="mt-1 text-xs text-slate-500">Voucher baru diperiksa setelah tombol Pakai ditekan.</p>}
              {priceQuote?.voucher_code && !quoteError && <p role="status" className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Voucher {priceQuote.voucher_code} berhasil digunakan.</p>}
              {quoteError && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{quoteError}</p>}
            </div>
            {quoteLoading && !priceQuote && <p className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Memeriksa Rincian Harga...</p>}
            {priceQuote && <PriceBreakdown quote={priceQuote} />}
            {!buyerInfoReady && !priceQuote && <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">Rincian pembayaran akan muncul setelah data pembeli dan jumlah tiket diisi dengan benar.</p>}
            {buyerInfoReady && !quoteLoading && !priceQuote && quoteError && <button type="button" onClick={() => setQuoteRefresh((current) => current + 1)} className="text-sm font-semibold text-blue-700 underline underline-offset-2">Coba muat rincian harga lagi</button>}
            {paymentMethod && priceQuote && <PaymentInstructions method={paymentMethod} totalPrice={displayedTotal} />}
            {paymentMethodError && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{paymentMethodError}</p>}
            <div>
              <label className="label-field" htmlFor="ticket-payment-proof">Upload Bukti Transfer</label>
              <input id="ticket-payment-proof" type="file" accept="image/jpeg,image/png,image/webp" onChange={(input) => setProofFile(input.target.files?.[0] ?? null)} className="input-field" required />
              <p className="mt-1 text-xs text-slate-500">JPG, PNG, WEBP · Maks. 5 MB</p>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <input
                id="ticket-legal-consent"
                type="checkbox"
                required
                checked={legalAccepted}
                onChange={(input) => setLegalAccepted(input.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor="ticket-legal-consent" className="text-sm leading-6 text-slate-700">
                Saya telah membaca dan menyetujui{' '}
                <a href={`/syarat-ketentuan?backTo=${encodeURIComponent(`/event/${slug}/tiket/${ticketId}`)}`} target="_blank" rel="noopener noreferrer" onClick={(click) => click.stopPropagation()} className="font-bold text-blue-800 underline underline-offset-2 hover:text-blue-900">Syarat &amp; Ketentuan</a>
                {' '}serta{' '}
                <a href={`/kebijakan-privasi?backTo=${encodeURIComponent(`/event/${slug}/tiket/${ticketId}`)}`} target="_blank" rel="noopener noreferrer" onClick={(click) => click.stopPropagation()} className="font-bold text-blue-800 underline underline-offset-2 hover:text-blue-900">Kebijakan Privasi</a>.
              </label>
            </div>
            {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
            <button type="submit" disabled={uploadingProof || quoteLoading || !paymentMethod || !legalAccepted} className="btn-primary w-full !py-3.5 text-base">
              {uploadingProof || quoteLoading ? 'Memeriksa harga...' : <><ArrowRight className="h-4 w-4" /> Konfirmasi &amp; Kirim Orderan</>}
            </button>
          </form>
          <Modal open={paymentConfirmationOpen} onClose={() => !uploadingProof && setPaymentConfirmationOpen(false)} title="Konfirmasi Order" size="md">
            <div className="space-y-4">
              <p className="text-sm font-medium text-slate-700">Pastikan seluruh data pesanan dan bukti transfer sudah benar. Order akan dikirim ke Admin setelah bukti berhasil diunggah.</p>
              <div className="review-summary">
                <div className="review-row"><span className="review-label">Nama</span><span className="review-value">{form.full_name}</span></div>
                <div className="review-row"><span className="review-label">Email</span><span className="review-value">{form.email}</span></div>
                <div className="review-row"><span className="review-label">WhatsApp</span><span className="review-value">{form.whatsapp}</span></div>
                <div className="review-row"><span className="review-label">Tiket</span><span className="review-value">{ticket.name}</span></div>
                <div className="review-row"><span className="review-label">Jumlah Tiket</span><span className="review-value">{quantity}</span></div>
                <PriceBreakdown quote={priceQuote} />
                <div className="review-row"><span className="review-label">Bukti transfer</span><span className="review-value">{proofFile?.name}</span></div>
              </div>
              {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button type="button" onClick={() => setPaymentConfirmationOpen(false)} disabled={uploadingProof} className="btn-secondary flex-1">Periksa Lagi</button>
                <button type="button" onClick={() => void confirmPaymentProof()} disabled={uploadingProof || !legalAccepted} className="btn-primary flex-1">
                  {uploadingProof ? 'Mengirim order...' : <><ArrowRight className="h-4 w-4" /> Konfirmasi &amp; Kirim Orderan</>}
                </button>
              </div>
            </div>
          </Modal>
        </div>
      </div>
    </div>
  );
}
