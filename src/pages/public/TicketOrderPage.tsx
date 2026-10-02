import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, CreditCard, Eye, Ticket, Upload } from 'lucide-react';
import type { Router } from '@/lib/router';
import { LOGO_URL, type EventItem, type EventTicket } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { createOrderNumber, formatDate, formatPrice, normalizeWhatsappNumber } from '@/lib/format';

interface PaymentSnapshot {
  recipient_name: string;
  bank_name: string | null;
  account_number: string | null;
  qris_storage_path: string | null;
  note: string | null;
}

function PaymentInstructions({ method, totalPrice }: { method: PaymentSnapshot; totalPrice: number }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');

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
      <div className="space-y-4 p-4 sm:p-5">
        {method.bank_name && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Transfer Bank</p>
            <p className="mt-1 font-extrabold text-slate-900">{method.bank_name}</p>
            {method.account_number && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <span className="min-w-0 break-all font-mono text-lg font-extrabold tracking-wide text-slate-900">{method.account_number}</span>
                <button type="button" onClick={() => void copyAccountNumber()} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2" aria-label={copied ? 'Nomor rekening tersalin' : 'Salin nomor rekening'} title={copied ? 'Nomor rekening tersalin' : 'Salin nomor rekening'}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">Nama penerima</p>
            <p className="text-sm font-semibold text-slate-800">{method.recipient_name}</p>
            {copyError && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{copyError}</p>}
          </div>
        )}
        {method.qris_storage_path && (
          <div className="rounded-xl border border-slate-200 p-3 sm:p-4">
            <p className="mb-3 text-sm font-bold text-slate-800">QRIS · {method.recipient_name}</p>
            <img src={supabase.storage.from('standupindo-media').getPublicUrl(method.qris_storage_path).data.publicUrl} alt="QRIS pembayaran Event" className="mx-auto max-h-72 rounded-xl border border-slate-200" />
          </div>
        )}
        {method.note && <p className="text-xs leading-5 text-slate-500">{method.note}</p>}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
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
        const { data: ticketData } = await supabase.from('event_tickets').select('*').eq('id', ticketId).eq('event_id', eventRow.id).eq('status', 'active').maybeSingle();
        if (active) setTicket((ticketData as EventTicket) ?? null);
        const { data: paymentData, error: paymentError } = await supabase.from('event_payment_methods')
          .select('recipient_name, bank_name, account_number, qris_storage_path, note')
          .eq('event_id', eventRow.id).eq('is_active', true).maybeSingle();
        if (active) {
          setPaymentMethod((paymentData as PaymentSnapshot | null) ?? null);
          if (paymentError) setPaymentMethodError('Informasi pembayaran Event gagal dimuat. Muat ulang halaman sebelum mengirim order.');
          else if (!paymentData) setPaymentMethodError('Informasi pembayaran untuk Event ini belum tersedia.');
        }
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [slug, ticketId]);

  const quantity = Math.max(1, Math.min(10, Number.parseInt(form.quantity, 10) || 1));
  const totalPrice = ticket ? ticket.price * quantity : 0;
  const currentStatus = event?.status ?? 'completed';

  function setWhatsapp(value: string) {
    setForm((current) => ({ ...current, whatsapp: value.replace(/\D/g, '') }));
  }

  function setQuantity(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 2);
    const parsedQuantity = Number.parseInt(digits, 10);
    const quantity = digits && parsedQuantity > 10 ? '10' : digits;
    setForm((current) => ({ ...current, quantity }));
  }

  function adjustQuantity(change: number) {
    const currentQuantity = Number.parseInt(form.quantity, 10) || 1;
    setQuantity(String(Math.max(1, Math.min(10, currentQuantity + change))));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!event || !ticket) return;
    setError('');

    if (!form.full_name.trim() || !form.email.trim() || !form.whatsapp.trim()) {
      setError('Lengkapi nama lengkap, email, dan nomor WhatsApp.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Masukkan alamat email yang valid.');
      return;
    }
    if (normalizeWhatsappNumber(form.whatsapp).length < 10) {
      setError('Nomor WhatsApp belum valid.');
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
      setError('Pilih bukti transfer sebelum mengirim order.');
      return;
    }
    if (proofFile.size > 5 * 1024 * 1024) {
      setError('Ukuran bukti pembayaran maksimal 5 MB.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(proofFile.type)) {
      setError('Gunakan bukti pembayaran JPG, PNG, atau WEBP.');
      return;
    }
    setError('');
    setPaymentConfirmationOpen(true);
  }

  async function uploadPaymentProof(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!savedOrder || !proofFile) {
      setError('Pilih bukti pembayaran terlebih dahulu.');
      return;
    }
    if (proofFile.size > 5 * 1024 * 1024) {
      setError('Ukuran bukti pembayaran maksimal 5 MB.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(proofFile.type)) {
      setError('Gunakan bukti pembayaran JPG, PNG, atau WEBP.');
      return;
    }
    setError('');
    setPaymentConfirmationOpen(true);
  }

  async function confirmPaymentProof() {
    if (!event || !ticket || !proofFile) return;
    setUploadingProof(true);
    setError('');
    let order = savedOrder;
    if (!order) {
      if (!paymentMethod) {
        setUploadingProof(false);
        setError(paymentMethodError || 'Informasi pembayaran Event belum tersedia.');
        return;
      }
      const orderNumber = createOrderNumber(event.title);
      const { data: orderId, error: orderError } = await supabase.rpc('create_ticket_order', {
        p_order_number: orderNumber,
        p_event_id: event.id,
        p_ticket_id: ticket.id,
        p_full_name: form.full_name.trim(),
        p_email: form.email.trim().toLowerCase(),
        p_whatsapp: form.whatsapp,
        p_quantity: quantity,
        p_notes: null,
      });
      if (orderError || !orderId) {
        setUploadingProof(false);
        setError(orderError?.message ?? 'Order belum berhasil dibuat. Periksa ketersediaan tiket dan informasi pembayaran Event.');
        return;
      }
      order = {
        id: orderId,
        order_number: orderNumber,
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        total_price: totalPrice,
        expires_at: null,
        ticket_category: ticket.name,
        quantity,
        status: 'Draft Pembayaran',
        payment_method_snapshot: paymentMethod,
      };
      setSavedOrder(order);
    }
    const { data: uploadData, error: uploadLinkError } = await supabase.functions.invoke('ticketing-public', {
      body: { action: 'create-proof-upload', order_id: order.id, whatsapp: form.whatsapp, file_name: proofFile.name, file_type: proofFile.type },
    });
    if (uploadLinkError || uploadData?.error) {
      setUploadingProof(false);
      setError(uploadLinkError?.message ?? uploadData?.error ?? 'Link upload bukti gagal dibuat.');
      return;
    }
    const { error: fileError } = await supabase.storage.from('ticket-payment-proofs').uploadToSignedUrl(uploadData.path, uploadData.token, proofFile, { contentType: proofFile.type, upsert: false });
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
                  <p className="mt-0.5 text-xl font-black text-slate-900">{formatPrice(savedOrder?.total_price ?? totalPrice)}</p>
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
                    <div><p className="text-xs font-semibold text-slate-500">Total bayar</p><p className="mt-0.5 font-extrabold text-slate-900">{formatPrice(savedOrder?.total_price ?? totalPrice)}</p></div>
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
                  <div className="review-row"><span className="review-label">Total</span><span className="review-value">{formatPrice(savedOrder?.total_price ?? totalPrice)}</span></div>
                  <div className="review-row"><span className="review-label">Bukti transfer</span><span className="review-value">{proofFile?.name}</span></div>
                  <div className="review-row"><span className="review-label">Bukti</span><span className="review-value">{proofFile?.name}</span></div>
                </div>
                {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <button type="button" onClick={() => setPaymentConfirmationOpen(false)} disabled={uploadingProof} className="btn-secondary flex-1">Periksa Lagi</button>
                  <button type="button" onClick={() => void confirmPaymentProof()} disabled={uploadingProof} className="btn-primary flex-1">
                    {uploadingProof ? 'Membuat order dan mengirim bukti...' : <><ArrowRight className="h-4 w-4" /> Konfirmasi & Kirim Order</>}
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
      <PageHeader router={router} title="Pesan Tiket" subtitle={event.title} />
      <div className="container-app py-8 sm:py-10">
        <div className="mx-auto max-w-xl">
          <form data-scroll-reveal onSubmit={submit} className="scroll-reveal card space-y-4 p-5 sm:p-7">
            <div className="flex items-start gap-3 border-b border-slate-100 pb-5">
              {event.poster ? (
                <img src={event.poster} alt={`Poster ${event.title}`} className="h-16 w-24 shrink-0 rounded-xl object-cover ring-1 ring-slate-200 sm:h-20 sm:w-28" />
              ) : (
                <span className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-blue-100 sm:h-20 sm:w-28">
                  <img src={LOGO_URL} alt="Logo Standupindo Cilegon" className="h-9 w-9 object-contain" />
                </span>
              )}
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Ticket className="h-5 w-5" /></span>
              <div className="min-w-0">
                <h2 className="font-extrabold text-slate-900">{ticket.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{formatDate(event.date)} · {event.venue}</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{formatPrice(ticket.price)} / tiket</p>
              </div>
            </div>

            <div>
              <label className="label-field" htmlFor="ticket-order-name">Nama Lengkap</label>
              <input id="ticket-order-name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="input-field" placeholder="Contoh: Budi Santoso" autoComplete="name" />
            </div>
            <div>
              <label className="label-field" htmlFor="ticket-order-email">Email</label>
              <input id="ticket-order-email" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-field" placeholder="Contoh: budi@email.com" autoComplete="email" />
            </div>
            <div>
              <label className="label-field" htmlFor="ticket-order-whatsapp">Nomor WhatsApp</label>
              <input id="ticket-order-whatsapp" required type="tel" inputMode="numeric" pattern="[0-9]+" value={form.whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="input-field" placeholder="Contoh: 082212345678" autoComplete="tel" />
            </div>
            <div>
              <label className="label-field" htmlFor="ticket-order-quantity">Jumlah Tiket</label>
              <div className="inline-flex h-11 items-center overflow-hidden rounded-xl border border-slate-300 bg-white">
                <button type="button" aria-label="Kurangi jumlah tiket" disabled={quantity <= 1} onClick={() => adjustQuantity(-1)} className="flex h-full w-11 items-center justify-center text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <input id="ticket-order-quantity" required type="text" inputMode="numeric" pattern="[1-9]|10" maxLength={2} value={form.quantity} onChange={(e) => setQuantity(e.target.value)} className="h-full w-10 border-x border-slate-200 bg-transparent p-0 text-center text-base font-semibold text-slate-900 outline-none" aria-label="Jumlah tiket" />
                <button type="button" aria-label="Tambah jumlah tiket" disabled={quantity >= 10} onClick={() => adjustQuantity(1)} className="flex h-full w-11 items-center justify-center text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">Maksimal 10 tiket per pesanan.</p>
            </div>

            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3 text-slate-500"><span>Total Pembayaran</span><strong className="text-lg text-slate-900">{formatPrice(totalPrice)}</strong></div>
            </div>
            {paymentMethod && <PaymentInstructions method={paymentMethod} totalPrice={totalPrice} />}
            {paymentMethodError && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{paymentMethodError}</p>}
            <div>
              <label className="label-field" htmlFor="ticket-payment-proof">Bukti transfer</label>
              <input id="ticket-payment-proof" type="file" accept="image/jpeg,image/png,image/webp" onChange={(input) => setProofFile(input.target.files?.[0] ?? null)} className="input-field" required />
              <p className="mt-1 text-xs text-slate-500">JPG, PNG, WEBP · Maks. 5 MB</p>
            </div>
            {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
            <button type="submit" disabled={uploadingProof || !paymentMethod} className="btn-primary w-full !py-3.5 text-base">
              {uploadingProof ? 'Mengirim order...' : <><ArrowRight className="h-4 w-4" /> Konfirmasi & Kirim Order</>}
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
                <div className="review-row"><span className="review-label">Total Pembayaran</span><span className="review-value">{formatPrice(totalPrice)}</span></div>
                <div className="review-row"><span className="review-label">Bukti transfer</span><span className="review-value">{proofFile?.name}</span></div>
              </div>
              {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button type="button" onClick={() => setPaymentConfirmationOpen(false)} disabled={uploadingProof} className="btn-secondary flex-1">Periksa Lagi</button>
                <button type="button" onClick={() => void confirmPaymentProof()} disabled={uploadingProof} className="btn-primary flex-1">
                  {uploadingProof ? 'Mengirim order...' : <><ArrowRight className="h-4 w-4" /> Kirim Order</>}
                </button>
              </div>
            </div>
          </Modal>
        </div>
      </div>
    </div>
  );
}
