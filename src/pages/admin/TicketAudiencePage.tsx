import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Clock3, LoaderCircle, MessageCircle, Printer, Search, Users } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { EventItem } from '@/lib/types';
import { formatDate, normalizeWhatsappNumber } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { TicketPagination } from '@/components/TicketPagination';

const PAGE_SIZE = 30;

interface AudienceEvent {
  event_id: string;
  title: string;
  status: string;
  date: string;
  order_count: number;
  order_numbers: string[];
  ticket_count: number;
  checked_in: number;
  not_checked_in: number;
}

interface AudienceGuest {
  whatsapp: string;
  full_name: string;
  events: AudienceEvent[];
  event_count: number;
  total_tickets: number;
  total_checked_in: number;
  total_not_checked_in: number;
}

type MessageType = 'thanks' | 'upcoming_event' | 'promo';
interface MaintenanceSend { sent_at: string; }
interface MaintenanceActivity {
  id: string;
  event_id: string;
  activity_type: MessageType;
  recipient_name: string;
  whatsapp_normalized: string;
  message: string;
  delivery_status: 'pending' | 'sent';
  sends: MaintenanceSend[];
}

async function loadAudience(eventFilter: string) {
  const { data, error } = await supabase.functions.invoke('ticketing-admin', { body: { action: 'audience', event_filter: eventFilter } });
  if (!error) return { data: data as { guests: AudienceGuest[]; total_buyers: number; total_tickets: number; total_checked_in: number }, error: null as string | null };
  const context = (error as Error & { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try { const payload = await context.json() as { error?: string }; return { data: null, error: payload.error ?? error.message }; }
    catch { return { data: null, error: error.message }; }
  }
  return { data: null, error: error.message };
}

function csvCell(value: string | number) {
  const text = String(value);
  const safeText = typeof value === 'string' && /^[\s\u0000-\u001F]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export function TicketAudiencePage({ events }: { events: EventItem[] }) {
  const [guests, setGuests] = useState<AudienceGuest[]>([]);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'attended' | 'not-attended'>('all');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [messageTarget, setMessageTarget] = useState<{ guest: AudienceGuest; eventId: string } | null>(null);
  const [messageActivities, setMessageActivities] = useState<MaintenanceActivity[]>([]);
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageBusy, setMessageBusy] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<MessageType | null>(null);
  const [messageError, setMessageError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await loadAudience(eventFilter);
    setLoading(false);
    if (loadError || !data) {
      setError(loadError ?? 'Data Penonton gagal dimuat.');
      return;
    }
    setError('');
    setGuests(data.guests ?? []);
  }, [eventFilter]);

  useEffect(() => { void refresh(); }, [refresh]);

  const filteredGuests = useMemo(() => guests.filter((guest) => {
    const query = search.trim().toLowerCase();
    const matchesQuery = !query || `${guest.full_name} ${guest.whatsapp} ${guest.events.map((event) => event.title).join(' ')}`.toLowerCase().includes(query);
    const matchesAttendance = attendanceFilter === 'all' || (attendanceFilter === 'attended' ? guest.total_checked_in > 0 : guest.total_checked_in === 0);
    return matchesQuery && matchesAttendance;
  }), [attendanceFilter, guests, search]);
  const pageGuests = filteredGuests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [attendanceFilter, eventFilter, search]);
  useEffect(() => {
    if (page > Math.max(1, Math.ceil(filteredGuests.length / PAGE_SIZE))) setPage(1);
  }, [filteredGuests.length, page]);

  useEffect(() => {
    if (!messageTarget) return;
    let active = true;
    setMessageLoading(true);
    setMessageError('');
    void supabase.functions.invoke('ticketing-admin', {
      body: { action: 'maintenance-list', event_filter: messageTarget.eventId },
    }).then(({ data, error: requestError }) => {
      if (!active) return;
      setMessageLoading(false);
      if (requestError) {
        setMessageError(requestError.message);
        return;
      }
      setMessageActivities((data?.activities as MaintenanceActivity[] | undefined) ?? []);
    });
    return () => { active = false; };
  }, [messageTarget]);

  function exportCsv() {
    const rows: Array<Array<string | number>> = [['Nama', 'WhatsApp', 'Event', 'Jumlah Order', 'Jumlah Tiket', 'Check-in', 'Belum Check-in', 'Nomor Order']];
    filteredGuests.forEach((guest) => guest.events.forEach((event) => rows.push([guest.full_name, guest.whatsapp, event.title, event.order_count, event.ticket_count, event.checked_in, event.not_checked_in, event.order_numbers.join(' | ')])));
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `database-penonton-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function printGuests() {
    document.body.dataset.printMode = 'ticket-audience';
    window.setTimeout(() => { window.print(); delete document.body.dataset.printMode; }, 0);
  }

  const totalTickets = filteredGuests.reduce((sum, guest) => sum + guest.total_tickets, 0);
  const totalCheckIns = filteredGuests.reduce((sum, guest) => sum + guest.total_checked_in, 0);
  const totalUnscanned = filteredGuests.reduce((sum, guest) => sum + guest.total_not_checked_in, 0);
  const targetEvent = messageTarget ? events.find((event) => event.id === messageTarget.eventId) : null;

  function messageFor(type: MessageType, guest: AudienceGuest, event: EventItem) {
    const eventLink = `https://standupindocilegon.id/event/${event.slug}`;
    const guestName = `*${guest.full_name}*`;
    const eventTitle = `*${event.title}*`;
    const eventDateTime = `*${formatDate(event.date)} · ${event.time}*`;
    if (type === 'thanks') return `Halo ${guestName}, terima kasih sudah hadir di ${eventTitle}!\n\nSampai bertemu di acara berikutnya.\n${eventLink}`;
    if (type === 'upcoming_event') return `Halo ${guestName}, ada Event mendatang dari Standupindo Cilegon!\n\n${eventTitle}\n${eventDateTime}\n${event.venue}\n${event.location}\n${eventLink}`;
    return `Halo ${guestName}, kami ingin mengajak kamu hadir di ${eventTitle}!\n\n${eventDateTime}\n${event.venue}\n${eventLink}`;
  }

  function activityFor(type: MessageType) {
    if (!messageTarget) return undefined;
    const whatsapp = normalizeWhatsappNumber(messageTarget.guest.whatsapp);
    return messageActivities.find((activity) =>
      activity.event_id === messageTarget.eventId
      && activity.activity_type === type
      && normalizeWhatsappNumber(activity.whatsapp_normalized) === whatsapp,
    );
  }

  async function sendTemplate(type: MessageType) {
    if (!messageTarget || !targetEvent) return;
    const guest = messageTarget.guest;
    const existing = activityFor(type);
    const message = messageFor(type, guest, targetEvent);
    const phone = normalizeWhatsappNumber(guest.whatsapp);
    if (!phone) {
      setMessageError('Nomor WhatsApp tidak valid.');
      return;
    }

    const popup = window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
    if (!popup) {
      setMessageError('Izinkan pop-up browser untuk membuka WhatsApp.');
      return;
    }
    popup.opener = null;
    setMessageError('');
    setPendingConfirmation(type);
    if (existing) return;

    setMessageBusy(type);
    try {
      const { data, error: saveError } = await supabase.functions.invoke('ticketing-admin', {
        body: {
          action: 'maintenance-create',
          event_id: messageTarget.eventId,
          activity_type: type,
          recipient_name: guest.full_name,
          recipient_whatsapp: guest.whatsapp,
          message,
        },
      });
      if (saveError || !data?.activity) {
        setMessageError(saveError?.message ?? data?.error ?? 'WhatsApp terbuka, tetapi aktivitas pesan gagal disimpan.');
        return;
      }
      const created = data.activity as MaintenanceActivity;
      setMessageActivities((current) => [created, ...current]);
    } catch (saveError) {
      setMessageError(saveError instanceof Error ? `WhatsApp terbuka, tetapi aktivitas pesan gagal disimpan: ${saveError.message}` : 'WhatsApp terbuka, tetapi aktivitas pesan gagal disimpan.');
    } finally {
      setMessageBusy(null);
    }
  }

  async function markTemplateSent(type: MessageType) {
    const activity = activityFor(type);
    if (!activity) return;
    setMessageBusy(type);
    setMessageError('');
    const { data, error: markError } = await supabase.functions.invoke('ticketing-admin', {
      body: { action: 'maintenance-mark-sent', maintenance_log_id: activity.id },
    });
    setMessageBusy(null);
    if (markError || !data?.marked_sent) {
      setMessageError(markError?.message ?? data?.error ?? 'Status pengiriman gagal dicatat.');
      return;
    }
    setMessageActivities((current) => current.map((item) => item.id === activity.id
      ? { ...item, delivery_status: 'sent', sends: [{ sent_at: data.sent_at }, ...(item.sends ?? [])] }
      : item));
    setPendingConfirmation(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Event Workspace</p><h1 className="text-2xl font-black text-slate-950">Penonton</h1><p className="mt-1 text-sm text-slate-500">Pembeli dengan order lunas, dikelompokkan berdasarkan WhatsApp.</p></div><div className="flex gap-2"><button type="button" onClick={exportCsv} disabled={!filteredGuests.length} className="btn-secondary !min-h-10 !px-3 !py-2 text-xs">Unduh CSV</button><button type="button" onClick={printGuests} disabled={!filteredGuests.length} className="btn-secondary !h-10 !w-10 !p-0" aria-label="Cetak Penonton" title="Cetak Penonton"><Printer className="h-4 w-4" /></button></div></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Pembeli</p><p className="mt-1 text-xl font-black">{filteredGuests.length}</p></div><div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Tiket</p><p className="mt-1 text-xl font-black">{totalTickets}</p></div><div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Check-in</p><p className="mt-1 text-xl font-black text-emerald-700">{totalCheckIns}</p></div><div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Belum Check-in</p><p className="mt-1 text-xl font-black text-blue-700">{totalUnscanned}</p></div></div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_190px]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input-field pl-10" placeholder="Cari nama atau WhatsApp..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><select className="input-field" value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}><option value="all">Semua Event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select><select className="input-field" value={attendanceFilter} onChange={(event) => setAttendanceFilter(event.target.value as typeof attendanceFilter)}><option value="all">Semua Kehadiran</option><option value="attended">Hadir</option><option value="not-attended">Belum Hadir</option></select></div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {loading ? <div className="h-24 skeleton rounded-2xl" /> : !filteredGuests.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada pembeli lunas untuk filter ini.</div> : <div className="space-y-2">{pageGuests.map((guest) => {
        const isExpanded = expanded[guest.whatsapp];
        return <article key={guest.whatsapp} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><button type="button" onClick={() => setExpanded((current) => ({ ...current, [guest.whatsapp]: !current[guest.whatsapp] }))} className="flex w-full items-center gap-3 p-4 text-left"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Users className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate font-extrabold text-slate-900">{guest.full_name}</span><span className="mt-0.5 block text-xs text-slate-500">{guest.whatsapp} · {guest.event_count} Event</span></span><span className="hidden shrink-0 text-right text-xs sm:block"><span className="font-bold text-slate-800">{guest.total_tickets} tiket</span><span className="mt-0.5 block text-slate-500">{guest.total_checked_in} check-in · {guest.total_not_checked_in} belum</span></span>{isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}</button>{isExpanded && <div className="space-y-2 border-t border-slate-100 p-3 sm:p-4">{guest.events.map((event) => <div key={event.event_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{event.title}</p><p className="mt-0.5 text-xs text-slate-500">{formatDate(event.date)} · {event.order_count} order · {event.order_numbers.join(', ') || 'Order lama'}</p><div className="mt-1 flex gap-3 text-xs font-semibold text-slate-600"><span>{event.ticket_count} tiket</span><span className="text-emerald-700">{event.checked_in} hadir</span><span>{event.not_checked_in} belum</span></div></div><button type="button" onClick={() => setMessageTarget({ guest, eventId: event.event_id })} aria-label={`Kirim pesan WhatsApp ke ${guest.full_name} untuk ${event.title}`} title="Kirim pesan WhatsApp" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-white text-blue-700 transition hover:bg-blue-50"><MessageCircle className="h-4 w-4" /></button></div>)}</div>}</article>;
      })}</div>}
      <TicketPagination page={page} pageSize={PAGE_SIZE} total={filteredGuests.length} onPageChange={setPage} />
      <div className="hidden print:block"><div className="print-brand"><h1>DATABASE PENONTON</h1><p>Standupindo Cilegon</p></div><table><thead><tr><th>Nama</th><th>WhatsApp</th><th>Event</th><th>Order</th><th>Tiket</th><th>Check-in</th><th>Belum Check-in</th></tr></thead><tbody>{filteredGuests.flatMap((guest) => guest.events.map((event) => <tr key={`${guest.whatsapp}-${event.event_id}`}><td>{guest.full_name}</td><td>{guest.whatsapp}</td><td>{event.title}</td><td>{event.order_count}</td><td>{event.ticket_count}</td><td>{event.checked_in}</td><td>{event.not_checked_in}</td></tr>))}</tbody></table></div>
      <Modal open={Boolean(messageTarget)} onClose={() => { setMessageTarget(null); setMessageActivities([]); setMessageError(''); setPendingConfirmation(null); }} title="Pesan WhatsApp" size="sm">
        {messageTarget && <div className="space-y-3">
          <div className="truncate rounded-lg bg-blue-50 px-3 py-2 text-xs text-slate-700"><span className="font-bold">{messageTarget.guest.full_name}</span> · {targetEvent?.title ?? 'Event'}</div>
          <p className="text-xs text-slate-500">Pilih template. Setelah mengirim di WhatsApp, konfirmasi dengan ikon centang.</p>
          {messageError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{messageError}</p>}
          {messageLoading ? <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Memuat status pesan...</div> : ([
            { type: 'thanks' as const, title: 'Thanks' },
            { type: 'upcoming_event' as const, title: 'Event Mendatang' },
            { type: 'promo' as const, title: 'Promo' },
          ]).map(({ type, title }) => {
            const activity = activityFor(type);
            const sent = activity?.delivery_status === 'sent';
            const working = messageBusy === type;
            return <article key={type} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold text-slate-900">{title}</h3><span className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold ${sent ? 'text-emerald-700' : 'text-amber-700'}`}>{sent ? <><Check className="h-3 w-3" />Sudah dikirim</> : <><Clock3 className="h-3 w-3" />Belum dikirim</>}</span>{activity?.sends?.length ? <span className="ml-2 text-[10px] text-slate-500">· {activity.sends.length}×</span> : null}</div>
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => void sendTemplate(type)} disabled={working || messageLoading} aria-label={sent ? `Kirim ulang template ${title} via WhatsApp` : `Kirim template ${title} via WhatsApp`} title={sent ? 'Kirim lagi via WhatsApp' : 'Kirim via WhatsApp'} className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-50">{working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}</button>
                {activity && pendingConfirmation === type && <button type="button" onClick={() => void markTemplateSent(type)} disabled={working || messageLoading} aria-label={sent ? 'Konfirmasi pesan dikirim ulang' : 'Tandai pesan sudah dikirim'} title={sent ? 'Konfirmasi kirim ulang' : 'Tandai sudah dikirim'} className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-50">{working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</button>}
              </div>
            </article>;
          })}
        </div>}
      </Modal>
    </div>
  );
}