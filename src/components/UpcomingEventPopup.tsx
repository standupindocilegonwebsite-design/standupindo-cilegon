import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Clock3, MapPin, Mic, Ticket, Users } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { EventItem, OpenMic } from '@/lib/types';
import { formatDate, getEventStatus, getOpenMicStatus, formatPrice } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { fetchPublicTicketOfferings } from '@/lib/public-ticket-availability';
import { useAuth } from '@/lib/auth-context';
import { claimPublicPromoPopup, hasPublicPromoPopupShown } from '@/lib/public-promo-popup';
import { Modal } from '@/components/ui/Modal';

type UpcomingPromo =
  | { kind: 'event'; event: Pick<EventItem, 'id' | 'title' | 'slug' | 'poster' | 'date' | 'time' | 'venue' | 'location' | 'status'>; cheapestTicketPrice: number }
  | { kind: 'open-mic'; mic: Pick<OpenMic, 'id' | 'title' | 'slug' | 'poster' | 'date' | 'time' | 'venue' | 'location' | 'capacity' | 'status' | 'registration_status'>; confirmedCount: number | null };

type EventCandidate = Pick<EventItem, 'id' | 'title' | 'slug' | 'poster' | 'date' | 'time' | 'venue' | 'location' | 'status'>;
type OpenMicCandidate = Pick<OpenMic, 'id' | 'title' | 'slug' | 'poster' | 'date' | 'time' | 'venue' | 'location' | 'capacity' | 'status' | 'registration_status'>;

const SESSION_DELAY_MS = 4000;
const EVENT_CANDIDATE_LIMIT = 20;
const AVAILABILITY_BATCH_SIZE = 5;

function isPurchaseRoute(path: string) {
  return path === '/tiket'
    || /^\/event\/[^/]+\/tiket(?:\/[^/]+)?$/.test(path)
    || /^\/event\/[^/]+\/daftar$/.test(path)
    || /^\/open-mic\/[^/]+\/daftar$/.test(path);
}

function getTodayLocalDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function findUpcomingPaidEvent(): Promise<UpcomingPromo | null> {
  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select('id, title, slug, poster, date, time, venue, location, status')
    .eq('published', true)
    .eq('status', 'upcoming')
    .eq('ticket_sales_mode', 'paid')
    .gte('date', getTodayLocalDate())
    .order('date', { ascending: true })
    .order('time', { ascending: true })
    .limit(EVENT_CANDIDATE_LIMIT);

  if (eventError) {
    console.error('Event berbayar terdekat untuk pop-up gagal dimuat.', eventError);
    return null;
  }

  const events = ((eventData as EventCandidate[] | null) ?? [])
    .filter((event) => getEventStatus(event.status, event.date) === 'upcoming');
  if (!events.length) return null;

  const { data: ticketData, error: ticketError } = await supabase
    .from('event_tickets')
    .select('event_id, price')
    .in('event_id', events.map((event) => event.id))
    .eq('status', 'active')
    .eq('available_public', true)
    .gt('price', 0)
    .order('price', { ascending: true });

  if (ticketError) {
    console.error('Tiket publik untuk pop-up event gagal dimuat.', ticketError);
    return null;
  }

  const candidateIds = new Set(
    ((ticketData as { event_id: string; price: number }[] | null) ?? []).map((ticket) => ticket.event_id),
  );
  const candidates = events.filter((event) => candidateIds.has(event.id));

  for (let index = 0; index < candidates.length; index += AVAILABILITY_BATCH_SIZE) {
    const batch = candidates.slice(index, index + AVAILABILITY_BATCH_SIZE);
    const availableEvents = await Promise.all(batch.map(async (event) => {
      try {
        const tickets = await fetchPublicTicketOfferings(event.id);
        const availablePaidTickets = tickets.filter((ticket) =>
          ticket.available_public && ticket.price > 0 && !ticket.sold_out && !ticket.temporarily_unavailable,
        );
        if (!availablePaidTickets.length) return null;
        const cheapestTicketPrice = Math.min(...availablePaidTickets.map((ticket) => ticket.price));
        return { event, cheapestTicketPrice };
      } catch (error) {
        console.error(`Ketersediaan tiket untuk event "${event.title}" gagal diperiksa.`, error);
        return null;
      }
    }));

    const nextEvent = availableEvents.find((result) => result !== null);
    if (nextEvent) return { kind: 'event', ...nextEvent };
  }

  return null;
}

async function findUpcomingOpenMic(): Promise<UpcomingPromo | null> {
  const { data: micData, error: micError } = await supabase
    .from('open_mics')
    .select('id, title, slug, poster, date, time, venue, location, capacity, status, registration_status')
    .eq('published', true)
    .eq('status', 'upcoming')
    .gte('date', getTodayLocalDate())
    .order('date', { ascending: true })
    .order('time', { ascending: true })
    .limit(20);

  if (micError) {
    console.error('Open Mic terdekat untuk pop-up gagal dimuat.', micError);
    return null;
  }

  const mics = ((micData as OpenMicCandidate[] | null) ?? [])
    .filter((mic) => getOpenMicStatus(mic.status, mic.date) === 'upcoming');
  if (!mics.length) return null;

  const { data: registrationData, error: registrationError } = await supabase
    .from('open_mic_registrations')
    .select('open_mic_id')
    .in('open_mic_id', mics.map((mic) => mic.id))
    .eq('status', 'confirmed')
    .neq('attendance_status', 'absent');

  if (registrationError) {
    console.error('Jumlah pendaftar Open Mic untuk pop-up gagal dimuat.', registrationError);
    return { kind: 'open-mic', mic: mics[0], confirmedCount: null };
  }

  const confirmedCounts = new Map<string, number>();
  (registrationData as { open_mic_id: string }[] | null)?.forEach(({ open_mic_id }) => {
    confirmedCounts.set(open_mic_id, (confirmedCounts.get(open_mic_id) ?? 0) + 1);
  });

  return { kind: 'open-mic', mic: mics[0], confirmedCount: confirmedCounts.get(mics[0].id) ?? 0 };
}

export function UpcomingEventPopup({ router }: { router: Router }) {
  const { session, loading } = useAuth();
  const [upcomingPromo, setUpcomingPromo] = useState<UpcomingPromo | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const initialPath = useRef(router.path);
  const attempted = useRef(false);
  const canShowOnRoute = !isPurchaseRoute(router.path);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), SESSION_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadUpcomingPromo() {
      const eventPromo = await findUpcomingPaidEvent();
      if (!active) return;
      if (eventPromo) {
        setUpcomingPromo(eventPromo);
        return;
      }
      const openMicPromo = await findUpcomingOpenMic();
      if (active && openMicPromo) setUpcomingPromo(openMicPromo);
    }

    void loadUpcomingPromo();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready || !upcomingPromo || open || attempted.current || loading || session
      || !canShowOnRoute || router.path !== initialPath.current
      || document.visibilityState !== 'visible' || hasPublicPromoPopupShown()) return;

    let observer: MutationObserver | null = null;
    const stopObserving = () => {
      observer?.disconnect();
      observer = null;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        attempted.current = true;
        stopObserving();
      }
    };
    const attemptToShow = () => {
      if (attempted.current || document.visibilityState !== 'visible' || router.path !== initialPath.current
        || loading || session || !canShowOnRoute || hasPublicPromoPopupShown()) {
        if (attempted.current || router.path !== initialPath.current || !canShowOnRoute || hasPublicPromoPopupShown()) stopObserving();
        return;
      }
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        if (!observer) {
          observer = new MutationObserver(attemptToShow);
          observer.observe(document.body, { childList: true, subtree: true });
        }
        return;
      }
      attempted.current = true;
      stopObserving();
      if (claimPublicPromoPopup()) setOpen(true);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    attemptToShow();
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopObserving();
    };
  }, [canShowOnRoute, loading, open, ready, router.path, session, upcomingPromo]);

  const close = () => setOpen(false);
  if (!upcomingPromo) return null;

  const isEvent = upcomingPromo.kind === 'event';
  const title = isEvent ? 'Event Terdekat' : 'Open Mic Terdekat';
  const item = isEvent ? upcomingPromo.event : upcomingPromo.mic;
  const registrationOpen = !isEvent
    && upcomingPromo.mic.registration_status === 'open'
    && upcomingPromo.confirmedCount !== null
    && upcomingPromo.confirmedCount < upcomingPromo.mic.capacity;
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      titleEyebrow="Jangan Sampai Ketinggalan"
      titleClassName="!text-lg sm:!text-2xl"
      titleEyebrowClassName="!text-[9px] sm:!text-[10px]"
      size="lg"
      panelClassName="!rounded-2xl sm:!rounded-[1.75rem]"
    >
      <div className="space-y-4 sm:space-y-5">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:rounded-2xl">
          {item.poster
            ? <img src={item.poster} alt={`Poster ${item.title}`} className="mx-auto max-h-[min(42dvh,360px)] w-full object-contain sm:max-h-[min(54dvh,560px)]" />
            : <div className="flex aspect-[4/3] items-center justify-center bg-slate-100 text-blue-700">{isEvent ? <Ticket className="h-12 w-12" /> : <Mic className="h-12 w-12" />}</div>}
        </div>
        <div className="space-y-3">
          <h2 className="text-lg font-extrabold leading-snug tracking-tight text-slate-950 sm:text-2xl">{item.title}</h2>
          <div className="grid gap-2 rounded-xl bg-slate-50 p-3 text-[13px] font-medium text-slate-600 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-2.5 sm:p-4 sm:text-sm">
            <p className="flex min-w-0 items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-blue-600" /><span className="truncate">{formatDate(item.date)}</span></p>
            <p className="flex min-w-0 items-center gap-2"><Clock3 className="h-4 w-4 shrink-0 text-blue-600" /><span>{item.time} WIB</span></p>
            <p className="flex min-w-0 items-start gap-2 sm:col-span-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /><span className="min-w-0">{item.venue}{item.location ? ` · ${item.location}` : ''}</span></p>
            {!isEvent && upcomingPromo.confirmedCount !== null && (
              <p className="flex min-w-0 items-center gap-2 sm:col-span-2">
                <Users className="h-4 w-4 shrink-0 text-blue-600" />
                <span>{upcomingPromo.confirmedCount} Komika</span>
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            close();
            if (isEvent) router.navigate(`/event/${encodeURIComponent(upcomingPromo.event.slug)}/tiket`);
            else if (registrationOpen) router.navigate(`/open-mic/${encodeURIComponent(upcomingPromo.mic.slug)}/daftar`);
            else router.navigate(`/open-mic/${encodeURIComponent(upcomingPromo.mic.slug)}`);
          }}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-blue-700 px-4 py-3 text-left text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:px-5"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            {isEvent ? <Ticket className="h-4 w-4 shrink-0" /> : <Mic className="h-4 w-4 shrink-0" />}
            <span>{isEvent ? 'Beli Sekarang' : registrationOpen ? 'Daftar Open Mic' : 'Lihat Open Mic'}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-blue-100">
            {isEvent ? `Mulai ${formatPrice(upcomingPromo.cheapestTicketPrice)}` : registrationOpen ? 'DAFTAR SEKARANG' : 'Info lengkap'}
            <ArrowRight className="ml-1 h-4 w-4" />
          </span>
        </button>
      </div>
    </Modal>
  );
}
