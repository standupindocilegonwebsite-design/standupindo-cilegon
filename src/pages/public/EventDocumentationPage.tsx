import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, Images, MapPin } from 'lucide-react';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { formatDate } from '@/lib/format';
import type { Router } from '@/lib/router';
import type { EventItem, SiteSettings } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { seoDescription, setPageMetadata } from '@/lib/seo';

interface EventDocumentationPageProps {
  router: Router;
  slug: string;
  settings: SiteSettings;
}

const MAX_DOCUMENTATION_PHOTOS = 15;
const FALLBACK_LOGO = '/assets/images/Logo%20Standupindo%20Cilegon%20Biru.png';
const HERO_MOTION_TARGETS = [
  'scale(1.065) translate3d(-0.35%, 0.2%, 0)',
  'scale(1.025) translate3d(0.35%, 0, 0)',
  'scale(1.065) translate3d(0, -0.35%, 0)',
  'scale(1.025) translate3d(-0.3%, 0, 0)',
  'scale(1.06) translate3d(0.3%, -0.25%, 0)',
  'scale(1.03) translate3d(0, 0.3%, 0)',
] as const;
const HERO_MOTION_COUNT = HERO_MOTION_TARGETS.length;

export function EventDocumentationPage({ router, slug, settings }: EventDocumentationPageProps) {
  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const [heroImageIndex, setHeroImageIndex] = useState(0);
  const [heroMotion, setHeroMotion] = useState(() => Math.floor(Math.random() * HERO_MOTION_COUNT));
  const heroMotionRef = useRef(heroMotion);
  const [heroTransition, setHeroTransition] = useState<{ from: string; to: string; visible: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);

    void (async () => {
      try {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('slug', slug)
          .eq('published', true)
          .maybeSingle();

        if (!active) return;
        if (error) {
          console.error('Gagal memuat dokumentasi event.', error);
          setLoadError(true);
        } else {
          const publishedEvent = (data as EventItem | null) ?? null;
          setEvent(publishedEvent);
          if (publishedEvent) {
            setPageMetadata({
              path: `/event/${encodeURIComponent(publishedEvent.slug)}/dokumentasi`,
              title: `Dokumentasi ${publishedEvent.title} | Standupindo Cilegon`,
              description: seoDescription(publishedEvent.description, `Foto dan dokumentasi panggung ${publishedEvent.title} bersama Standupindo Cilegon.`),
              image: publishedEvent.poster,
            });
          }
          setFailedImages(new Set());
        }
      } catch (error) {
        if (!active) return;
        console.error('Permintaan dokumentasi event gagal.', error);
        setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [retryCount, slug]);

  const documentationPhotos = useMemo(() => {
    const poster = event?.poster?.trim() || null;
    const seen = new Set<string>();
    const storedPhotos = (event?.documentation_photos ?? []).filter((photo) => {
      const url = photo.trim();
      if (!url || url === poster || seen.has(url)) return false;
      seen.add(url);
      return true;
    });

    return {
      storedCount: storedPhotos.length,
      photos: storedPhotos.slice(0, MAX_DOCUMENTATION_PHOTOS),
    };
  }, [event]);

  const galleryPhotos = useMemo(
    () => [...(event?.poster?.trim() ? [event.poster.trim()] : []), ...documentationPhotos.photos],
    [documentationPhotos.photos, event?.poster],
  );
  const availablePhotos = useMemo(() => galleryPhotos.filter((photo) => !failedImages.has(photo)), [failedImages, galleryPhotos]);
  const heroImage = availablePhotos[heroImageIndex] ?? null;
  const location = [event?.venue, event?.location].filter((value) => value?.trim()).join(', ');

  function handleBack(fallbackPath: string) {
    const previousPath = window.history.state?.appPreviousPath;
    if (
      typeof previousPath === 'string'
      && previousPath.startsWith('/')
      && !previousPath.startsWith('//')
      && previousPath !== router.path
    ) {
      window.history.back();
      return;
    }
    router.navigate(fallbackPath);
  }

  useEffect(() => {
    if (availablePhotos.length < 2) {
      setHeroImageIndex(0);
      setHeroTransition(null);
      return;
    }

    setHeroImageIndex((current) => current % availablePhotos.length);
    let animationFrame: number | null = null;
    let transitionTimeout: number | null = null;
    const slideTimer = window.setInterval(() => {
      setHeroImageIndex((current) => {
        const next = (current + 1) % availablePhotos.length;
        const from = availablePhotos[current];
        const to = availablePhotos[next];
        if (!from || !to) return next;

        const currentMotion = heroMotionRef.current;
        const nextMotion = (currentMotion + 1 + Math.floor(Math.random() * (HERO_MOTION_COUNT - 1))) % HERO_MOTION_COUNT;
        heroMotionRef.current = nextMotion;
        setHeroMotion(nextMotion);
        setHeroTransition({ from, to, visible: false });
        animationFrame = window.requestAnimationFrame(() => {
          setHeroTransition((current) => current ? { ...current, visible: true } : current);
          animationFrame = null;
        });
        if (transitionTimeout !== null) window.clearTimeout(transitionTimeout);
        transitionTimeout = window.setTimeout(() => {
          setHeroTransition(null);
          transitionTimeout = null;
        }, 1800);
        return next;
      });
    }, 5500);

    return () => {
      window.clearInterval(slideTimer);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      if (transitionTimeout !== null) window.clearTimeout(transitionTimeout);
    };
  }, [availablePhotos]);

  function markImageFailed(url: string) {
    setFailedImages((current) => new Set(current).add(url));
  }

  function moveLightbox(direction: -1 | 1) {
    if (lightboxIndex === null || availablePhotos.length < 2) return;
    const currentPhoto = galleryPhotos[lightboxIndex];
    const currentIndex = availablePhotos.indexOf(currentPhoto);
    if (currentIndex < 0) {
      setLightboxIndex(null);
      return;
    }
    const nextIndex = (currentIndex + direction + availablePhotos.length) % availablePhotos.length;
    setLightboxIndex(galleryPhotos.indexOf(availablePhotos[nextIndex]));
  }

  if (loading) {
    return (
      <div className="min-h-[70vh] bg-slate-950 px-4 py-10 text-white sm:px-8">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="h-[28rem] animate-pulse rounded-2xl bg-white/[0.06]" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-lg bg-white/[0.06]" />)}
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-slate-950 px-4 text-white">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
          <h1 className="text-xl font-extrabold">Dokumentasi belum dapat dimuat</h1>
          <p className="mt-2 text-sm text-slate-300">Periksa koneksi internet, lalu coba lagi.</p>
          <div className="mt-5 flex justify-center gap-3">
            <button type="button" onClick={() => handleBack(`/event/${encodeURIComponent(slug)}`)} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/10">
              Kembali
            </button>
            <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-blue-500">
              Coba lagi
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-slate-950 px-4 text-white">
        <div className="max-w-md text-center">
          <Images className="mx-auto h-9 w-9 text-slate-500" />
          <h1 className="mt-3 text-xl font-extrabold">Event tidak ditemukan</h1>
          <p className="mt-2 text-sm text-slate-400">Event ini mungkin tidak tersedia untuk publik.</p>
          <button type="button" onClick={() => handleBack('/event')} className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-blue-500">
            Kembali ke Event
          </button>
        </div>
      </div>
    );
  }

  const selectedLightboxPhoto = lightboxIndex === null ? null : galleryPhotos[lightboxIndex];
  const lightboxPhoto = selectedLightboxPhoto && !failedImages.has(selectedLightboxPhoto) ? selectedLightboxPhoto : null;
  const lightboxPosition = lightboxPhoto ? availablePhotos.indexOf(lightboxPhoto) + 1 : 0;
  const lightboxPhotoIndex = lightboxPosition - 1;
  const peekPreviousPhoto = lightboxPhotoIndex >= 0 && availablePhotos.length > 1
    ? availablePhotos[(lightboxPhotoIndex - 1 + availablePhotos.length) % availablePhotos.length]
    : undefined;
  const peekNextPhoto = lightboxPhotoIndex >= 0 && availablePhotos.length > 1
    ? availablePhotos[(lightboxPhotoIndex + 1) % availablePhotos.length]
    : undefined;
  return (
    <div className="min-h-screen overflow-hidden bg-[#030712] text-white">
      <section className="relative isolate flex min-h-[min(780px,88svh)] flex-col justify-between overflow-hidden border-b border-white/10">
        {heroImage && (
          <div className="absolute inset-0 z-0 overflow-hidden bg-[#030712]">
            <div
              className="event-documentation-hero-motion absolute inset-[-5%]"
              style={{ transform: HERO_MOTION_TARGETS[heroMotion] }}
            >
              {heroTransition && (
                <img
                  src={heroTransition.from}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-[1800ms] ease-in-out"
                  style={{ opacity: heroTransition.visible ? 0 : 0.8 }}
                />
              )}
              <img
                key={heroTransition?.to ?? heroImage}
                src={heroTransition?.to ?? heroImage}
                alt=""
                aria-hidden="true"
                fetchPriority="high"
                onError={() => markImageFailed(heroTransition?.to ?? heroImage)}
                className="absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-[1800ms] ease-in-out"
                style={{ opacity: heroTransition && !heroTransition.visible ? 0 : 0.8 }}
              />
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(2,6,23,0.06)_0%,rgba(2,6,23,0.04)_42%,rgba(3,7,18,0.58)_100%)]" />
        <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-r from-[#030712]/25 via-[#030712]/10 to-transparent" />

        <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center gap-3 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-8 sm:pt-8">
          <button
            type="button"
            onClick={() => handleBack(`/event/${encodeURIComponent(event.slug)}`)}
            aria-label="Kembali ke halaman sebelumnya"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-slate-950/50 text-white backdrop-blur transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/20 bg-white p-1 shadow-lg">
              <img src={settings.logo_url ?? FALLBACK_LOGO} alt="" className="h-full w-full object-contain" />
            </span>
            <span className="flex min-w-0 flex-col text-left leading-tight">
              <span className="truncate text-xs font-black tracking-wide text-white sm:text-sm">{settings.site_short_name.replace(/\s+CILEGON$/i, '')}</span>
              <span className="text-xs font-extrabold tracking-wide text-blue-300">CILEGON</span>
            </span>
          </div>
        </header>

        <div className="relative z-20 mx-auto w-full max-w-7xl px-4 pb-10 pt-12 sm:px-8 sm:pb-14 sm:pt-16 lg:pb-16">
          <div className="max-w-2xl">
            <span className="inline-flex items-center rounded-full border border-blue-400/30 bg-blue-600/90 px-3 py-1.5 text-[10px] font-extrabold tracking-[0.14em] text-white shadow-lg shadow-blue-950/40 sm:text-xs">
              DOKUMENTASI EVENT
            </span>
            <h1 className="mt-4 max-w-xl text-3xl font-black leading-[1.05] tracking-tight text-white drop-shadow-lg sm:mt-5 sm:text-5xl lg:text-6xl">
              {event.title}
            </h1>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2.5 text-xs font-semibold text-slate-100 sm:text-sm">
              {event.date && <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-blue-300" />{formatDate(event.date)}</span>}
              {location && <span className="inline-flex max-w-full items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-blue-300" /><span className="break-words">{location}</span></span>}
            </div>
          </div>
        </div>
      </section>

      <section id="event-documentation-gallery" className="mx-auto max-w-7xl scroll-mt-6 px-4 py-8 sm:px-8 sm:py-12">
        <div className="mb-5 flex items-end justify-between gap-3 sm:mb-7">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-400">Momen pilihan</p>
            <h2 className="mt-1 text-xl font-extrabold text-white sm:text-2xl">Dokumentasi Event</h2>
          </div>
          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-slate-300">{galleryPhotos.length} Foto</span>
        </div>

        {documentationPhotos.storedCount > MAX_DOCUMENTATION_PHOTOS && (
          <p role="status" className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/[0.08] px-4 py-3 text-xs leading-5 text-amber-100">
            Album ini memiliki {documentationPhotos.storedCount} foto dokumentasi. Maksimal 15 foto ditampilkan; foto lama lainnya tetap tersimpan.
          </p>
        )}

        {galleryPhotos.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-12 text-center sm:py-16">
            <Images className="mx-auto h-9 w-9 text-slate-500" />
            <h3 className="mt-3 text-base font-bold text-white">Dokumentasi belum tersedia</h3>
            <p className="mt-1 text-sm text-slate-400">Foto untuk event ini akan ditampilkan di sini jika sudah tersedia.</p>
          </div>
        ) : (
          <div className="columns-2 gap-3 sm:columns-3 sm:gap-4 xl:columns-4">
            {galleryPhotos.map((photo, index) => (
              <div key={`${photo}-${index}`} className="mb-3 break-inside-avoid sm:mb-4">
                {failedImages.has(photo) ? (
                  <div className="flex min-h-28 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 text-center text-xs text-slate-400">
                    Foto tidak dapat dimuat
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(index)}
                    aria-label={`Buka ${index === 0 && event.poster === photo ? 'poster' : `foto dokumentasi ${index + 1}`} dalam layar penuh`}
                    className="group block w-full overflow-hidden rounded-lg border border-blue-300/20 bg-white/[0.03] shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition hover:border-blue-300/60 hover:shadow-[0_12px_30px_rgba(37,99,235,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    <img
                      src={photo}
                      alt={index === 0 && event.poster === photo ? `Poster ${event.title}` : `${event.title} — dokumentasi ${index + 1}`}
                      loading="lazy"
                      decoding="async"
                      onError={() => markImageFailed(photo)}
                      className="block h-auto w-full transition duration-300 group-hover:scale-[1.015]"
                    />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {lightboxPhoto && availablePhotos.length > 0 && (
        <ImageLightbox
          src={lightboxPhoto}
          alt={`${event.title} — foto ${lightboxPosition} dari ${availablePhotos.length}`}
          open
          hideNavigationControls
          edgeToEdge
          peekPreviousSrc={peekPreviousPhoto}
          peekNextSrc={peekNextPhoto}
          pagination={{
            currentIndex: lightboxPosition - 1,
            total: availablePhotos.length,
            onSelect: (index) => setLightboxIndex(galleryPhotos.indexOf(availablePhotos[index])),
          }}
          onClose={() => setLightboxIndex(null)}
          onPrevious={availablePhotos.length > 1 ? () => moveLightbox(-1) : undefined}
          onNext={availablePhotos.length > 1 ? () => moveLightbox(1) : undefined}
        />
      )}
    </div>
  );
}
