import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Clock3, MapPin, Ticket } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { EventItem } from '@/lib/types';
import { formatDate, getEventStatus, formatPrice } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { claimPublicPromoPopup, hasPublicPromoPopupShown } from '@/lib/public-promo-popup';
import { Modal } from '@/components/ui/Modal';

interface UpcomingTicketEvent {
  event: EventItem;
  cheapestTicketPrice: number;
}

const SESSION_DELAY_MS = 4000;

function isPurchaseRoute(path: string) {
  return path === '/tiket'
    || /^\/event\/[^/]+\/tiket(?:\/[^/]+)?$/.test(path)
    || /^\/event\/[^/]+\/daftar$/.test(path)
    || /^\/open-mic\/[^/]+\/daftar$/.test(path);
}

export function UpcomingEventPopup({ router }: { router: Router }) {
  const { session, loading } = useAuth();
  const [upcomingTicketEvent, setUpcomingTicketEvent] = useState<UpcomingTicketEvent | null>(null);
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
    async function loadUpcomingTicketEvent() {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('published', true)
        .eq('status', 'upcoming')
        .gte('date', today)
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .limit(20);

      if (eventError) {
        console.error('Event terdekat untuk pop-up gagal dimuat.', eventError);
        return;
      }
      const events = ((eventData as EventItem[] | null) ?? [])
        .filter((event) => getEventStatus(event.status, event.date) === 'upcoming');
      if (!events.length) return;

      const { data: ticketData, error: ticketError } = await supabase
        .from('event_tickets')
        .select('event_id, price')
        .in('event_id', events.map((event) => event.id))
        .eq('status', 'active')
        .eq('available_public', true)
        .order('price', { ascending: true });

      if (ticketError) {
        console.error('Tiket publik untuk pop-up event gagal dimuat.', ticketError);
        return;
      }

      const cheapestPrices = new Map<string, number>();
      (ticketData as { event_id: string; price: number }[] | null)?.forEach((ticket) => {
        if (!cheapestPrices.has(ticket.event_id)) cheapestPrices.set(ticket.event_id, ticket.price);
      });
      const nextEvent = events.find((event) => cheapestPrices.has(event.id));
      if (!active || !nextEvent) return;
      setUpcomingTicketEvent({ event: nextEvent, cheapestTicketPrice: cheapestPrices.get(nextEvent.id)! });
    }

    void loadUpcomingTicketEvent();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready || !upcomingTicketEvent || open || attempted.current || loading || session
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
  }, [canShowOnRoute, loading, open, ready, router.path, session, upcomingTicketEvent]);

  const close = () => setOpen(false);
  if (!upcomingTicketEvent) return null;
  const { event, cheapestTicketPrice } = upcomingTicketEvent;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Event Terdekat"
      titleEyebrow="Jangan Sampai Ketinggalan"
      titleClassName="!text-lg sm:!text-2xl"
      titleEyebrowClassName="!text-[9px] sm:!text-[10px]"
      size="lg"
      panelClassName="!rounded-2xl sm:!rounded-[1.75rem]"
    >
      <div className="space-y-4 sm:space-y-5">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:rounded-2xl">
          {event.poster
            ? <img src={event.poster} alt={`Poster ${event.title}`} className="mx-auto max-h-[min(42dvh,360px)] w-full object-contain sm:max-h-[min(54dvh,560px)]" />
            : <div className="flex aspect-[4/3] items-center justify-center bg-slate-100 text-blue-700"><Ticket className="h-12 w-12" /></div>}
        </div>
        <div className="space-y-3">
          <h2 className="text-lg font-extrabold leading-snug tracking-tight text-slate-950 sm:text-2xl">{event.title}</h2>
          <div className="grid gap-2 rounded-xl bg-slate-50 p-3 text-[13px] font-medium text-slate-600 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-2.5 sm:p-4 sm:text-sm">
            <p className="flex min-w-0 items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-blue-600" /><span className="truncate">{formatDate(event.date)}</span></p>
            <p className="flex min-w-0 items-center gap-2"><Clock3 className="h-4 w-4 shrink-0 text-blue-600" /><span>{event.time} WIB</span></p>
            <p className="flex min-w-0 items-start gap-2 sm:col-span-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /><span className="min-w-0">{event.venue}{event.location ? ` · ${event.location}` : ''}</span></p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { close(); router.navigate(`/event/${encodeURIComponent(event.slug)}/tiket`); }}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-blue-700 px-4 py-3 text-left text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:px-5"
        >
          <span className="inline-flex min-w-0 items-center gap-2"><Ticket className="h-4 w-4 shrink-0" /><span>Beli Sekarang</span></span>
          <span className="inline-flex shrink-0 items-center gap-1 text-blue-100">Mulai {formatPrice(cheapestTicketPrice)}<ArrowRight className="ml-1 h-4 w-4" /></span>
        </button>
      </div>
    </Modal>
  );
}
