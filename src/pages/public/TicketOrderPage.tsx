import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, MessageCircle, Ticket } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { EventItem, EventTicket, SiteSettings } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { createOrderNumber, formatDate, formatPrice, getEventStatus, normalizeWhatsappNumber } from '@/lib/format';
import { generateTicketPurchaseWhatsAppMessage } from '@/lib/whatsapp';

interface Props {
  router: Router;
  slug: string;
  ticketId: string;
  settings: SiteSettings;
}

export function TicketOrderPage({ router, slug, ticketId, settings }: Props) {
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<EventItem | null>(null);
  const [ticket, setTicket] = useState<EventTicket | null>(null);
  const [form, setForm] = useState({ full_name: '', email: '', whatsapp: '', quantity: '1', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

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
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [slug, ticketId]);

  const quantity = Math.max(1, Math.min(20, Number.parseInt(form.quantity, 10) || 1));
  const totalPrice = ticket ? ticket.price * quantity : 0;
  const buyTicketNumber = event?.whatsapp_number || settings.whatsapp_ticket || settings.whatsapp_admin;
  const currentStatus = event ? getEventStatus(event.status, event.date) : 'completed';

  function setWhatsapp(value: string) {
    setForm((current) => ({ ...current, whatsapp: value.replace(/\D/g, '') }));
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
    setReviewOpen(true);
  }

  async function confirmSubmit() {
    if (!event || !ticket) return;
    setError('');
    setSaving(true);
    const orderId = crypto.randomUUID();
    const orderNumber = createOrderNumber(event.title);
    const { error: insertError } = await supabase
      .from('ticket_orders')
      .insert({
        id: orderId,
        order_number: orderNumber,
        event_id: event.id,
        ticket_id: ticket.id,
        ticket_category: ticket.name,
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        whatsapp: form.whatsapp,
        quantity,
        unit_price: ticket.price,
        total_price: totalPrice,
        notes: form.notes.trim() || null,
        status: 'Menunggu Pembayaran',
      });

    if (insertError) {
      setSaving(false);
      setError('Pesanan belum tersimpan. Pastikan migration ticket_orders sudah dijalankan di Supabase, lalu coba lagi.');
      return;
    }

    const message = generateTicketPurchaseWhatsAppMessage({
      order_number: orderNumber,
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase(),
      whatsapp: form.whatsapp,
      ticket_category: ticket.name,
      quantity,
      total_price: totalPrice,
      notes: form.notes.trim() || null,
      status: 'Menunggu Pembayaran',
    }, event.title);

    setReviewOpen(false);
    setSubmitted(true);
    window.location.assign(`https://wa.me/${normalizeWhatsappNumber(buyTicketNumber)}?text=${encodeURIComponent(message)}`);
  }

  if (loading) {
    return <><PageHeader router={router} title="Pesan Tiket" /><div className="container-app py-8"><LoadingSkeleton count={1} /></div></>;
  }

  if (!event || !ticket || currentStatus !== 'upcoming') {
    return <><PageHeader router={router} title="Tiket tidak tersedia" /><div className="container-app py-8"><div className="card p-8 text-center text-sm text-slate-500">Tiket ini tidak tersedia atau event sudah selesai.</div></div></>;
  }

  if (submitted) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title="Pesanan Tersimpan" subtitle={event.title} />
        <div className="container-app py-8">
          <div className="card mx-auto max-w-xl p-8 text-center sm:p-12">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
            <h2 className="mt-4 text-2xl font-extrabold text-slate-900">Pesanan berhasil disimpan</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">WhatsApp admin sedang dibuka dengan detail pesanan kamu.</p>
            <button type="button" onClick={() => router.navigate(`/event/${event.slug}`)} className="btn-primary mt-6">Kembali ke Event</button>
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
          <form data-scroll-reveal onSubmit={submit} className="scroll-reveal card space-y-5 p-5 sm:p-7">
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
              <label className="label-field" htmlFor="ticket-order-name">Nama lengkap</label>
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
              <label className="label-field" htmlFor="ticket-order-quantity">Jumlah tiket</label>
              <input id="ticket-order-quantity" required type="number" min="1" max="20" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="label-field" htmlFor="ticket-order-notes">Catatan <span className="font-normal text-slate-400">(opsional)</span></label>
              <textarea id="ticket-order-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field min-h-[88px]" placeholder="Contoh: Mohon info rekening pembayaran" />
            </div>

            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3 text-slate-500"><span>Total pesanan</span><strong className="text-lg text-slate-900">{formatPrice(totalPrice)}</strong></div>
            </div>
            {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
            <button type="submit" disabled={saving} className="btn-primary w-full !py-3.5 text-base">
              {saving ? 'Memeriksa data...' : <><ArrowRight className="h-4 w-4" /> Kirim Pesanan</>}
            </button>
          </form>
        </div>
      </div>
      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="Periksa Data Pesanan" size="md">
        <div className="space-y-4">
          <p className="text-sm font-medium text-slate-700">Pastikan data berikut sudah benar.</p>
          <div className="review-summary">
            <div className="review-row"><span className="review-label">Nama</span><span className="review-value">{form.full_name}</span></div>
            <div className="review-row"><span className="review-label">Email</span><span className="review-value">{form.email}</span></div>
            <div className="review-row"><span className="review-label">WhatsApp</span><span className="review-value">{form.whatsapp}</span></div>
            <div className="review-row"><span className="review-label">Tiket</span><span className="review-value">{ticket.name}</span></div>
            <div className="review-row"><span className="review-label">Jumlah</span><span className="review-value">{quantity}</span></div>
            <div className="review-row"><span className="review-label">Total</span><span className="review-value">{formatPrice(totalPrice)}</span></div>
            {form.notes.trim() && <div className="review-row"><span className="review-label">Catatan</span><span className="review-value">{form.notes}</span></div>}
          </div>
          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" onClick={() => setReviewOpen(false)} className="btn-secondary flex-1">Periksa Lagi</button>
            <button type="button" onClick={() => void confirmSubmit()} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Mengirim...' : <><MessageCircle className="h-4 w-4" /> Konfirmasi & Kirim</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
