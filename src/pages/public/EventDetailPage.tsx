import { useCallback, useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, ClipboardList, Clock, ExternalLink, Info, MessageCircle, Ticket } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { EventItem, EventTicket, EventPartnership, Partner, SiteSettings } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SocialIconButton } from '@/components/ui/SocialIconButton';
import { LocationLink } from '@/components/ui/LocationLink';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { ShareButton } from '@/components/ui/ShareButton';
import { NoSmokeAreaNotice } from '@/components/ui/NoSmokeAreaNotice';
import { formatDate, formatPrice, getEventStatus, waLink } from '@/lib/format';

interface Props {
  router: Router;
  slug: string;
  settings: SiteSettings;
}

function setOgTags(title: string, description: string, image: string, url: string) {
  const set = (prop: string, val: string) => {
    let el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
    if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el); }
    el.setAttribute('content', val);
  };
  set('og:title', title);
  set('og:description', description);
  set('og:image', image);
  set('og:url', url);
}

function EventPartnerMarquee({ partners, logoSize, role }: { partners: Partner[]; logoSize: string; role: 'sponsor' | 'support' | 'media_partner' }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, scrollLeft: 0 });
  const [dragging, setDragging] = useState(false);

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    const shell = shellRef.current;
    if (!shell) return;
    shell.setPointerCapture(event.pointerId);
    dragStart.current = { x: event.clientX, scrollLeft: shell.scrollLeft };
    setDragging(true);
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const shell = shellRef.current;
    if (!shell || !dragging) return;
    shell.scrollLeft = dragStart.current.scrollLeft - (event.clientX - dragStart.current.x);
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  }

  return <div ref={shellRef} className={`event-partner-marquee-shell ${dragging ? 'is-dragging' : ''}`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
    <div className={`event-partner-marquee-track ${role === 'support' ? 'event-partner-marquee-track-right' : ''}`}>
      {[...partners, ...partners].map((partner, index) => <div key={`${partner.id}-${index}`} className="flex w-32 shrink-0 flex-col items-center justify-center px-3 text-center sm:w-40">
        <div className={`flex items-center justify-center overflow-visible ${logoSize}`}>
          {partner.logo_url ? <img src={partner.logo_url} alt={partner.name} draggable={false} className="h-full w-full select-none object-contain" /> : <span className="text-[10px] font-black text-slate-600 sm:text-xs">{partner.name.slice(0, 2).toUpperCase()}</span>}
        </div>
        <p className={`mt-2 font-bold text-slate-800 ${role === 'sponsor' ? 'text-base' : role === 'support' ? 'text-sm' : 'text-xs'}`}>{partner.name}</p>
      </div>)}
    </div>
  </div>;
}

function EventDocumentationGallery({ photos, eventTitle, eventDate, eventVenue, eventLocation, lightboxIndex, onLightboxIndexChange }: { photos: string[]; eventTitle: string; eventDate: string; eventVenue: string; eventLocation: string; lightboxIndex: number | null; onLightboxIndexChange: (index: number | null) => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [photoTransition, setPhotoTransition] = useState<{ from: string; to: string; visible: boolean } | null>(null);
  const [autoplayPaused, setAutoplayPaused] = useState(false);
  const thumbnailStripRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const didSwipe = useRef(false);
  const resumeTimer = useRef<number | null>(null);
  const transitionFrame = useRef<number | null>(null);
  const transitionTimer = useRef<number | null>(null);

  const changeActivePhoto = useCallback((index: number) => {
    const from = photos[activeIndex];
    const to = photos[index];
    if (from && to && from !== to) {
      if (transitionFrame.current !== null) window.cancelAnimationFrame(transitionFrame.current);
      if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
      setPhotoTransition({ from, to, visible: false });
      transitionFrame.current = window.requestAnimationFrame(() => {
        setPhotoTransition({ from, to, visible: true });
        transitionFrame.current = null;
      });
      transitionTimer.current = window.setTimeout(() => {
        setPhotoTransition(null);
        transitionTimer.current = null;
      }, 700);
    }
    setActiveIndex(index);
  }, [activeIndex, photos]);

  useEffect(() => {
    if (photos.length < 2 || autoplayPaused || lightboxIndex !== null || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      changeActivePhoto((activeIndex + 1) % photos.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [activeIndex, autoplayPaused, changeActivePhoto, lightboxIndex, photos.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    changeActivePhoto(lightboxIndex);
    setAutoplayPaused(true);
  }, [changeActivePhoto, lightboxIndex]);

  useEffect(() => {
    const strip = thumbnailStripRef.current;
    const activeThumbnail = thumbnailRefs.current[activeIndex];
    if (!strip || !activeThumbnail) return;
    const left = activeThumbnail.offsetLeft - strip.offsetLeft;
    const right = left + activeThumbnail.offsetWidth;
    if (left < strip.scrollLeft) {
      strip.scrollTo({ left, behavior: 'smooth' });
    } else if (right > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: right - strip.clientWidth, behavior: 'smooth' });
    }
  }, [activeIndex]);

  useEffect(() => () => {
    if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current);
    if (transitionFrame.current !== null) window.cancelAnimationFrame(transitionFrame.current);
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
  }, []);

  function pauseAutoplay() {
    if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current);
    setAutoplayPaused(true);
  }

  function resumeAutoplaySoon() {
    if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => {
      setAutoplayPaused(false);
      resumeTimer.current = null;
    }, 1600);
  }

  function selectPhoto(index: number) {
    changeActivePhoto(index);
    resumeAutoplaySoon();
  }

  function movePhoto(direction: -1 | 1) {
    const nextIndex = (activeIndex + direction + photos.length) % photos.length;
    changeActivePhoto(nextIndex);
    if (lightboxIndex !== null) onLightboxIndexChange(nextIndex);
  }

  function finishSwipe(deltaX: number, deltaY: number) {
    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    didSwipe.current = true;
    pauseAutoplay();
    movePhoto(deltaX < 0 ? 1 : -1);
    resumeAutoplaySoon();
  }

  const activePhoto = photos[activeIndex];

  return (
    <>
      <div className="space-y-3">
        <div
          className="group relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-100 sm:aspect-[16/9]"
          onTouchStart={(event) => {
          pauseAutoplay();
          const touch = event.touches[0];
          if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={(event) => {
          const start = touchStart.current;
          const touch = event.changedTouches[0];
          touchStart.current = null;
          if (start && touch) finishSwipe(touch.clientX - start.x, touch.clientY - start.y);
          resumeAutoplaySoon();
          }}
          onTouchCancel={() => {
          touchStart.current = null;
          resumeAutoplaySoon();
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (didSwipe.current) {
                didSwipe.current = false;
                return;
              }
              pauseAutoplay();
              onLightboxIndexChange(activeIndex);
            }}
            aria-label={`Perbesar foto dokumentasi ${activeIndex + 1}`}
            className="absolute inset-0 h-full w-full touch-pan-y focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-blue-500"
          >
            {photoTransition ? (
              <>
                <img
                  src={photoTransition.from}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <img
                  src={photoTransition.to}
                  alt={`${eventTitle} — dokumentasi ${activeIndex + 1}`}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-in-out motion-reduce:transition-none ${photoTransition.visible ? 'opacity-100' : 'opacity-0'}`}
                />
              </>
            ) : (
              <img
                src={activePhoto}
                alt={`${eventTitle} — dokumentasi ${activeIndex + 1}`}
                loading={activeIndex === 0 ? 'eager' : 'lazy'}
                className="h-full w-full object-cover"
              />
            )}
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-slate-950/90 via-slate-950/55 to-transparent px-4 pb-8 pt-20 sm:px-7 sm:pb-10 sm:pt-28">
            <p className="mb-2 w-fit rounded-sm bg-blue-600 px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white sm:text-xs">Dokumentasi</p>
            <h3 className="max-w-3xl text-xl font-extrabold leading-tight text-white drop-shadow sm:text-3xl">{eventTitle}</h3>
            <div className="mt-2 space-y-1 text-xs font-semibold leading-snug text-white/90 drop-shadow sm:text-sm">
              <p>{formatDate(eventDate)}</p>
              <p className="line-clamp-1">{eventVenue}{eventLocation ? `, ${eventLocation}` : ''}</p>
            </div>
          </div>
          {event.poster && (
            <ImageLightbox
              src={event.poster}
              alt={`${event.title} poster`}
              open={posterLightboxOpen}
              onClose={() => setPosterLightboxOpen(false)}
            />
          )}
        </div>

        {photos.length > 1 && (
          <div
            ref={thumbnailStripRef}
            className="flex gap-2 overflow-x-auto overscroll-x-contain scroll-smooth py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onPointerDown={pauseAutoplay}
            onPointerUp={resumeAutoplaySoon}
            onPointerCancel={resumeAutoplaySoon}
            onTouchStart={pauseAutoplay}
            onTouchEnd={resumeAutoplaySoon}
            onTouchCancel={resumeAutoplaySoon}
            onFocusCapture={pauseAutoplay}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) resumeAutoplaySoon();
            }}
          >
            {photos.map((photo, index) => (
              <button
                key={`${photo}-${index}`}
                ref={(element) => { thumbnailRefs.current[index] = element; }}
                type="button"
                onClick={() => selectPhoto(index)}
                aria-label={`Tampilkan foto dokumentasi ${index + 1}`}
                aria-current={activeIndex === index ? 'true' : undefined}
                className={`h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-lg border-2 bg-slate-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:h-16 sm:w-24 ${activeIndex === index ? 'border-blue-600 opacity-100' : 'border-transparent opacity-70 hover:opacity-100'}`}
              >
                <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <p className="text-xs font-medium text-slate-500">Pilih foto untuk memperbesar</p>
        </div>
      </div>

      {lightboxIndex !== null && photos[lightboxIndex] && (
        <ImageLightbox
          src={photos[lightboxIndex]}
          alt={`${eventTitle} — dokumentasi ${lightboxIndex + 1}`}
          open
          onClose={() => {
            onLightboxIndexChange(null);
            resumeAutoplaySoon();
          }}
          onPrevious={() => movePhoto(-1)}
          onNext={() => movePhoto(1)}
        />
      )}
    </>
  );
}

export function EventDetailPage({ router, slug, settings }: Props) {
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<EventItem | null>(null);
  const [documentationLightboxIndex, setDocumentationLightboxIndex] = useState<number | null>(null);
  const [posterLightboxOpen, setPosterLightboxOpen] = useState(false);
  const [tickets, setTickets] = useState<EventTicket[]>([]);
  const [lineup, setLineup] = useState<{ id: string; stage_name: string; community: string | null; instagram: string | null }[]>([]);
  const [partnersByRole, setPartnersByRole] = useState<Record<'sponsor' | 'support' | 'media_partner', Partner[]>>({ sponsor: [], support: [], media_partner: [] });
  const [infoTab, setInfoTab] = useState<'about' | 'rules'>('about');
  const [infoExpanded, setInfoExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('events').select('*').eq('slug', slug).eq('published', true).maybeSingle();
      const ev = data as EventItem | null;
      setEvent(ev);

      if (ev) {
        const { data: ticketData } = await supabase.from('event_tickets').select('*').eq('event_id', ev.id).order('sort_order', { ascending: true }).order('price', { ascending: true });
        setTickets((ticketData as EventTicket[]) ?? []);

        const { data: participantData } = await supabase
          .from('event_participants')
          .select('id, stage_name, community, instagram')
          .eq('event_id', ev.id)
          .eq('status', 'approved')
          .order('created_at', { ascending: true });
        setLineup((participantData as { id: string; stage_name: string; community: string | null; instagram: string | null }[]) ?? []);

        const { data: partnershipData } = await supabase
          .from('event_partnerships')
          .select('*')
          .eq('event_id', ev.id)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });

        const eventPartnerships = (partnershipData as EventPartnership[] | null) ?? [];
        if (eventPartnerships.length > 0) {
          const partnerIds = [...new Set(eventPartnerships.map((item) => item.partner_id))];
          const { data: partnerData } = await supabase
            .from('partners')
            .select('*')
            .in('id', partnerIds)
            .eq('is_published', true);

          const partners = (partnerData as Partner[] | null) ?? [];
          const partnerMap = new Map(partners.map((partner) => [partner.id, partner]));
          const groupedPartners: Record<'sponsor' | 'support' | 'media_partner', Partner[]> = { sponsor: [], support: [], media_partner: [] };

          eventPartnerships.forEach((entry) => {
            const partner = partnerMap.get(entry.partner_id);
            if (partner) {
              groupedPartners[entry.role].push(partner);
            }
          });

          setPartnersByRole(groupedPartners);
        } else {
          setPartnersByRole({ sponsor: [], support: [], media_partner: [] });
        }

        const pageUrl = `${window.location.origin}/event/${ev.slug}`;
        setOgTags(
          `${ev.title} — Standupindo Cilegon`,
          `Yuk hadir di ${ev.title} bersama Standupindo Cilegon.`,
          ev.poster ?? `${window.location.origin}/assets/images/Standupindo_CIlegon_Logo.jpeg`,
          pageUrl,
        );
      }
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} />
        <div className="container-app py-8"><LoadingSkeleton count={1} /></div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title="Event tidak ditemukan" />
        <div className="container-app py-8"><EmptyState title="Event tidak ditemukan" /></div>
      </div>
    );
  }

  const defaultWaMessage = `Halo Admin Standupindo Cilegon, saya ingin membeli tiket ${event.title}.`;
  const waMessage = event.whatsapp_message?.trim() ? event.whatsapp_message.trim() : defaultWaMessage;
  const buyTicketNumber = event.whatsapp_number || settings.whatsapp_ticket || settings.whatsapp_admin;
  const cheapestTicketPrice = tickets.length > 0 ? tickets.reduce((lowest, ticket) => ticket.price < lowest.price ? ticket : lowest, tickets[0]).price : (event.ticket_price ?? 0);
  const isFreeEvent = tickets.length === 0 && cheapestTicketPrice <= 0;
  const pageUrl = `${window.location.origin}/event/${event.slug}`;
  const currentStatus = getEventStatus(event.status, event.date);
  const documentationPhotos = [
    ...(event.poster ? [event.poster] : []),
    ...(event.documentation_photos ?? []),
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title={event.title} />

      <div className="container-app py-8 space-y-10">
        {/* Poster + meta */}
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="max-h-[18rem] overflow-hidden rounded-2xl bg-slate-100 shadow-soft sm:max-h-none">
              {event.poster ? (
                <button
                  onClick={() => currentStatus === 'completed' ? setDocumentationLightboxIndex(0) : setPosterLightboxOpen(true)}
                  aria-label={currentStatus === 'completed' ? `Lihat dokumentasi ${event.title}` : `Lihat poster ${event.title}`}
                  className="block w-full"
                >
                  <img src={event.poster} alt={`${event.title} poster`} className={`aspect-[4/3] max-h-[18rem] w-full object-contain transition-transform duration-500 hover:scale-105 sm:max-h-none ${currentStatus === 'completed' ? 'grayscale' : ''}`} />
                </button>
              ) : (
                <div className="aspect-[4/3] w-full" />
              )}
            </div>
          </div>
          <div className="lg:col-span-3 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge status={currentStatus} />
              <ShareButton
                title={`${event.title} — Standupindo Cilegon`}
                text={`🔥 SIAP-SIAP KETAWA!\n\n*${event.title}* bakal hadir di *${event.venue}${event.location ? `, ${event.location}` : ''}*!\n\n📅 ${formatDate(event.date)}\n⏰ *${event.time} WIB*\n\n🎟️ Tiket & info lengkap:\n${pageUrl}`}
                url={pageUrl}
                image={event.poster}
              />
            </div>
            <div className="space-y-0 overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm text-slate-600 shadow-[0_8px_22px_rgba(15,23,42,0.05)]">
              <div className="flex items-center gap-2.5 px-3.5 py-3"><Calendar className="h-5 w-5 shrink-0 text-blue-600" /> <span>{formatDate(event.date)}</span></div>
              <div className="flex items-center gap-2.5 border-t border-slate-100 px-3.5 py-3"><Clock className="h-5 w-5 shrink-0 text-blue-600" /> <span>{event.time} WIB</span></div>
              <div className="border-t border-slate-100"><LocationLink venue={event.venue} location={event.location} mapsUrl={event.maps_url} className="items-center gap-2.5 !rounded-none !border-0 !shadow-none !px-3.5 !py-3" /></div>
              <div className="flex items-center gap-2.5 border-t border-slate-100 px-3.5 py-3"><Ticket className="h-5 w-5 shrink-0 text-blue-600" /> <span className="font-bold text-slate-900">{formatPrice(cheapestTicketPrice)}</span></div>
            </div>
            {currentStatus !== 'completed' && <NoSmokeAreaNotice detail context="event" />}

            {currentStatus === 'upcoming' && (
              <div className="space-y-2">
                {tickets.length === 0 && !isFreeEvent && <a href={waLink(buyTicketNumber, waMessage)} target="_blank" rel="noopener noreferrer" className="btn-primary w-full !py-3.5 text-base">
                  <MessageCircle className="h-5 w-5" /> Beli Tiket via WhatsApp
                </a>}
                {event.registration_status === 'open' && <button onClick={() => router.navigate(`/event/${event.slug}/daftar`)} className="btn-secondary w-full !py-3.5 text-base">Daftar sebagai Peserta</button>}
              </div>
            )}
          </div>
        </div>

        <section data-scroll-reveal className="scroll-reveal">
          <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="flex gap-1 bg-slate-100 p-1" role="tablist" aria-label="Informasi event">
            <button
              type="button"
              role="tab"
              aria-selected={infoTab === 'about'}
              onClick={() => { if (infoTab === 'about') setInfoExpanded((current) => !current); else { setInfoTab('about'); setInfoExpanded(true); } }}
              className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-left transition-all sm:justify-start sm:px-4 ${infoTab === 'about' ? 'bg-blue-600 text-white shadow-[0_6px_14px_rgba(37,99,235,0.24)]' : 'text-slate-700 hover:bg-white'}`}
            >
              <Info className="h-4 w-4 shrink-0" />
              <span className="truncate text-xs font-extrabold sm:text-sm">About Event</span>
              <ChevronDown className={`ml-auto h-4 w-4 shrink-0 transition-transform ${infoTab === 'about' && infoExpanded ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={infoTab === 'rules'}
              onClick={() => { if (infoTab === 'rules') setInfoExpanded((current) => !current); else { setInfoTab('rules'); setInfoExpanded(true); } }}
              className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-left transition-all sm:justify-start sm:px-4 ${infoTab === 'rules' ? 'bg-blue-600 text-white shadow-[0_6px_14px_rgba(37,99,235,0.24)]' : 'text-slate-700 hover:bg-white'}`}
            >
              <ClipboardList className="h-4 w-4 shrink-0" />
              <span className="truncate text-xs font-extrabold sm:text-sm">Peraturan</span>
              <ChevronDown className={`ml-auto h-4 w-4 shrink-0 transition-transform ${infoTab === 'rules' && infoExpanded ? 'rotate-180' : ''}`} />
            </button>
            </div>

            {infoExpanded && <div role="tabpanel" className="border-t border-slate-200 bg-white p-4 sm:p-6">
                <h2 className="text-lg font-extrabold text-slate-900 sm:text-xl">{infoTab === 'about' ? 'About Event' : 'Peraturan'}</h2>
                <div className="mt-3 text-sm leading-relaxed text-slate-700 sm:text-base">
                  {infoTab === 'about' ? (
                    event.description ? <p className="whitespace-pre-line">{event.description}</p> : <EmptyState title="Informasi tentang event belum tersedia." />
                  ) : (
                    event.event_rules?.trim() ? <p className="whitespace-pre-line">{event.event_rules}</p> : <EmptyState title="Peraturan event belum tersedia." />
                  )}
                </div>
              </div>}
          </div>
        </section>

        {lineup.length > 0 && (
          <section data-scroll-reveal className="scroll-reveal">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Lineup</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {lineup.map((k) => (
                <div key={k.id} className="card flex items-center gap-3 p-4">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100">
                    <div className="flex h-full w-full items-center justify-center bg-blue-100 text-lg font-bold text-blue-700">{k.stage_name.charAt(0)}</div>
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-slate-900">{k.stage_name}</h3>
                    {k.community && <p className="mt-0.5 truncate text-xs text-slate-500">{k.community}</p>}
                    <div className="mt-1.5"><SocialIconButton instagram={k.instagram} size="sm" /></div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {currentStatus === 'completed' ? (
          <section data-scroll-reveal className="scroll-reveal border-t border-slate-200 pt-8 sm:pt-10">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Kenangan acara</p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-900 sm:text-2xl">Foto Dokumentasi</h2>
              </div>
            </div>
            {documentationPhotos.length > 0 ? (
              <EventDocumentationGallery
                photos={documentationPhotos}
                eventTitle={event.title}
                eventDate={event.date}
                eventVenue={event.venue}
                eventLocation={event.location}
                lightboxIndex={documentationLightboxIndex}
                onLightboxIndexChange={setDocumentationLightboxIndex}
              />
            ) : (
              <EmptyState title="Foto dokumentasi belum tersedia." />
            )}
          </section>
        ) : (
          <section data-scroll-reveal className="scroll-reveal border-t border-slate-200 pt-8 sm:pt-10">
            {/* Tickets */}
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Akses acara</p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-900 sm:text-2xl">{isFreeEvent ? 'Acara Gratis' : 'Pilih tiket'}</h2>
              </div>
              {tickets.length > 0 && <span className="text-right text-xs font-semibold text-slate-500">{tickets.length} pilihan tersedia</span>}
            </div>
            {tickets.length === 0 ? (
              <EmptyState title={isFreeEvent ? 'Tidak perlu membeli tiket untuk menghadiri acara ini.' : 'Informasi tiket segera hadir.'} />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                {tickets.map((t) => {
                  const hasUrl = t.ticket_url && /^https?:\/\//i.test(t.ticket_url);
                  return (
                    <div key={t.id} className="grid gap-4 border-b border-slate-100 p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6 sm:p-5">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Ticket className="h-4 w-4" /></div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900">{t.name}</h3>
                          {t.description && <p className="mt-1 text-xs leading-5 text-slate-500">{t.description}</p>}
                        </div>
                      </div>
                      <span className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-right">{formatPrice(t.price)}</span>
                      {currentStatus === 'upcoming' && (
                        hasUrl ? (
                          <a href={t.ticket_url!} target="_blank" rel="noopener noreferrer" aria-label={`Beli tiket ${t.name} melalui link ticketing`} title="Beli melalui link ticketing" className="btn-primary !min-h-10 !rounded-xl !px-4 !py-2.5 text-sm">
                            <ExternalLink className="h-4 w-4" /> <span>Beli</span>
                          </a>
                        ) : (
                          <button type="button" onClick={() => router.navigate(`/event/${event.slug}/tiket/${t.id}`)} aria-label={`Isi form pembelian tiket ${t.name}`} title="Isi form pembelian tiket" className="btn-primary !min-h-10 !rounded-xl !px-4 !py-2.5 text-sm">
                            <MessageCircle className="h-4 w-4" /> <span>Beli</span>
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Partnership */}
        {(['sponsor', 'support', 'media_partner'] as const).some((role) => partnersByRole[role].length > 0) && (
          <section data-scroll-reveal className="scroll-reveal space-y-4 border-t border-slate-200 pt-8 sm:pt-10">
            <h2 className="text-xl font-bold text-slate-900">Partner Event</h2>
            <div className="space-y-4">
              {(['sponsor', 'support', 'media_partner'] as const).map((role) => {
                const rolePartners = partnersByRole[role];
                if (rolePartners.length === 0) return null;

                const labels = {
                  sponsor: 'Sponsor',
                  support: 'Support',
                  media_partner: 'Media Partner',
                };

                const logoSize = {
                  sponsor: 'h-20 w-20 sm:h-24 sm:w-24',
                  support: 'h-14 w-14 sm:h-16 sm:w-16',
                  media_partner: 'h-12 w-12 sm:h-14 sm:w-14',
                };

                return (
                  <div key={role} className={`rounded-[26px] border p-3 shadow-[0_8px_22px_rgba(15,23,42,0.04)] sm:p-4 ${role === 'sponsor' ? 'border-blue-200 bg-blue-50/40' : role === 'support' ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}>
                    <div className="mb-3 flex items-center justify-center">
                      <span className={`rounded-full border bg-white px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] sm:text-[11px] ${role === 'sponsor' ? 'border-blue-200 text-blue-700' : role === 'support' ? 'border-emerald-200 text-emerald-700' : 'border-slate-300 text-slate-600'}`}>
                        {labels[role]}
                      </span>
                    </div>

                    <EventPartnerMarquee partners={rolePartners} logoSize={logoSize[role]} role={role} />
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
      {event.poster && (
        <ImageLightbox
          src={event.poster}
          alt={`${event.title} poster`}
          open={posterLightboxOpen}
          onClose={() => setPosterLightboxOpen(false)}
        />
      )}
    </div>
  );
}
