import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, Send, Users } from 'lucide-react';
import type { EventItem } from '@/lib/types';
import { formatDate, normalizeWhatsappNumber } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type ActivityType = 'thanks' | 'upcoming_event' | 'promo';
interface AudienceEvent { event_id: string; title: string; date: string; order_numbers: string[]; }
interface AudienceGuest { whatsapp: string; full_name: string; events: AudienceEvent[]; }
interface SendRecord { sent_at: string; sent_by: string; }
interface MaintenanceActivity {
  id: string;
  event_id: string;
  activity_type: ActivityType;
  recipient_name: string;
  whatsapp_normalized: string;
  message: string;
  delivery_status: 'pending' | 'sent';
  sent_at: string | null;
  sent_by: string | null;
  sends?: SendRecord[];
  created_at: string;
}

async function maintenanceAction<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('ticketing-admin', { body });
  if (!error) return { data: data as T, error: null as string | null };
  const context = (error as Error & { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try { const response = await context.json() as { error?: string }; return { data: response as T, error: response.error ?? error.message }; }
    catch { return { data: null as T, error: error.message }; }
  }
  return { data: null as T, error: error.message };
}

function templateMessage(type: ActivityType, guest: AudienceGuest, target: EventItem) {
  const eventLink = `https://standupindocilegon.id/event/${target.slug}`;
  if (type === 'thanks') return `Halo ${guest.full_name}, terima kasih sudah hadir di ${target.title}!\n\nSampai bertemu di acara berikutnya.\n${eventLink}`;
  if (type === 'upcoming_event') return `Halo ${guest.full_name}, ada Event mendatang dari Standupindo Cilegon!\n\n${target.title}\n${formatDate(target.date)} · ${target.time}\n${target.venue}\n${target.location}\n${eventLink}`;
  return `Halo ${guest.full_name}, kami ingin mengajak kamu hadir di ${target.title}!\n\n${formatDate(target.date)} · ${target.time}\n${target.venue}\n${eventLink}`;
}

export function TicketMaintenancePage({ events }: { events: EventItem[] }) {
  const [activities, setActivities] = useState<MaintenanceActivity[]>([]);
  const [guests, setGuests] = useState<AudienceGuest[]>([]);
  const [activityType, setActivityType] = useState<ActivityType>('thanks');
  const [audienceEventId, setAudienceEventId] = useState('all');
  const [targetEventId, setTargetEventId] = useState('');
  const [guestWhatsapp, setGuestWhatsapp] = useState('');
  const [message, setMessage] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | ActivityType>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadActivities = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await maintenanceAction<{ activities: MaintenanceActivity[] }>({ action: 'maintenance-list', event_filter: audienceEventId });
    setLoading(false);
    if (loadError || !data) { setError(loadError ?? 'Aktivitas gagal dimuat.'); return; }
    setActivities(data.activities ?? []);
  }, [audienceEventId]);

  useEffect(() => { void loadActivities(); }, [loadActivities]);
  useEffect(() => {
    if (!targetEventId && events.length) setTargetEventId(events[0].id);
  }, [events, targetEventId]);

  useEffect(() => {
    let active = true;
    void maintenanceAction<{ guests: AudienceGuest[] }>({ action: 'audience', event_filter: audienceEventId }).then(({ data }) => {
      if (active) setGuests(data?.guests ?? []);
    });
    return () => { active = false; };
  }, [audienceEventId]);

  const selectedGuest = useMemo(() => guests.find((guest) => guest.whatsapp === guestWhatsapp) ?? null, [guestWhatsapp, guests]);
  const targetEvent = events.find((event) => event.id === targetEventId) ?? null;
  const visibleActivities = activities.filter((activity) => activityFilter === 'all' || activity.activity_type === activityFilter);

  function loadTemplate() {
    if (!selectedGuest || !targetEvent) { setError('Pilih pembeli dan Event untuk membuat template.'); return; }
    setError('');
    setMessage(templateMessage(activityType, selectedGuest, targetEvent));
  }

  async function saveActivity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGuest || !targetEvent || !message.trim()) { setError('Pilih pembeli, Event, dan isi pesan.'); return; }
    setSaving(true);
    setError('');
    const { error: saveError } = await maintenanceAction({
      action: 'maintenance-create',
      event_id: targetEvent.id,
      activity_type: activityType,
      recipient_name: selectedGuest.full_name,
      recipient_whatsapp: selectedGuest.whatsapp,
      message,
    });
    setSaving(false);
    if (saveError) { setError(saveError); return; }
    setMessage('');
    await loadActivities();
  }

  async function markSent(activity: MaintenanceActivity) {
    setSaving(true);
    setError('');
    const { error: sendError } = await maintenanceAction({ action: 'maintenance-mark-sent', maintenance_log_id: activity.id });
    setSaving(false);
    if (sendError) { setError(sendError); return; }
    await loadActivities();
  }

  function openWhatsApp(activity: MaintenanceActivity) {
    const normalized = normalizeWhatsappNumber(activity.whatsapp_normalized);
    if (!normalized) { setError('Nomor WhatsApp tidak valid.'); return; }
    window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(activity.message)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="space-y-5">
      <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Event Workspace</p><h1 className="text-2xl font-black text-slate-950">Maintenance Penonton</h1><p className="mt-1 text-sm text-slate-500">WhatsApp dibuka manual. Status berubah hanya setelah dikonfirmasi admin.</p></div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      <form onSubmit={saveActivity} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Database audience</span><select className="input-field" value={audienceEventId} onChange={(event) => { setAudienceEventId(event.target.value); setGuestWhatsapp(''); setMessage(''); }}><option value="all">Semua Event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Pembeli lunas</span><select required className="input-field" value={guestWhatsapp} onChange={(event) => { setGuestWhatsapp(event.target.value); setMessage(''); }}><option value="">Pilih pembeli</option>{guests.map((guest) => <option key={guest.whatsapp} value={guest.whatsapp}>{guest.full_name} · {guest.whatsapp}</option>)}</select></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Jenis aktivitas</span><select className="input-field" value={activityType} onChange={(event) => { setActivityType(event.target.value as ActivityType); setMessage(''); }}><option value="thanks">Thanks</option><option value="upcoming_event">Event Mendatang</option><option value="promo">Promo</option></select></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Event untuk pesan</span><select required className="input-field" value={targetEventId} onChange={(event) => { setTargetEventId(event.target.value); setMessage(''); }}><option value="">Pilih Event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>
        </div>
        <button type="button" onClick={loadTemplate} className="btn-secondary !min-h-10 !px-3 !py-2 text-xs"><Users className="h-4 w-4" /> Isi Template Event</button>
        <label className="block space-y-1 text-xs font-semibold text-slate-600"><span>Pesan WhatsApp</span><textarea required className="input-field min-h-36" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Isi template, lalu edit pesan sebelum disimpan." /></label>
        <button type="submit" disabled={saving} className="btn-primary"><Send className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan Aktivitas'}</button>
      </form>
      <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-extrabold text-slate-900">Aktivitas</h2><select className="input-field !min-h-10 !w-auto !py-2 text-xs" value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as typeof activityFilter)}><option value="all">Semua Jenis</option><option value="thanks">Thanks</option><option value="upcoming_event">Event Mendatang</option><option value="promo">Promo</option></select></div>
        {loading ? <div className="h-20 skeleton rounded-2xl" /> : !visibleActivities.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">Belum ada aktivitas.</div> : <div className="space-y-2">{visibleActivities.map((activity) => <article key={activity.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase text-blue-700">{activity.activity_type.replace('_', ' ')}</p><p className="mt-0.5 font-extrabold text-slate-900">{activity.recipient_name} · {activity.whatsapp_normalized}</p><p className="text-xs text-slate-500">{events.find((event) => event.id === activity.event_id)?.title ?? 'Event'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${activity.delivery_status === 'sent' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{activity.delivery_status === 'sent' ? 'Sudah dikirim' : 'Belum dikirim'}</span></div><p className="line-clamp-3 whitespace-pre-line text-sm leading-6 text-slate-600">{activity.message}</p><div className="flex flex-wrap gap-2"><button type="button" onClick={() => openWhatsApp(activity)} className="btn-secondary !min-h-10 !px-3 !py-2 text-xs"><MessageCircle className="h-4 w-4" />{activity.delivery_status === 'sent' ? 'Kirim Lagi' : 'Buka WhatsApp'}</button><button type="button" onClick={() => void markSent(activity)} disabled={saving} className="btn-primary !min-h-10 !px-3 !py-2 text-xs"><Send className="h-4 w-4" />Tandai Sudah Dikirim</button></div>{activity.sends?.length ? <div className="border-t border-slate-100 pt-2 text-[11px] text-slate-500">{activity.sends.length} pengiriman tercatat · terakhir {new Date(activity.sends[0].sent_at).toLocaleString('id-ID')}</div> : <p className="text-[11px] text-slate-500">WhatsApp dibuka tidak otomatis mengubah status pengiriman.</p>}</article>)}</div>}
      </section>
    </div>
  );
}