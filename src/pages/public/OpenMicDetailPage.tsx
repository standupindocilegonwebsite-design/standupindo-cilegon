import { formatDate, getOpenMicStatus } from '@/lib/format';
import { useEffect, useState } from 'react';
import { Calendar, Check, Clock, Copy, Instagram, Mic, Send } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { OpenMic, OpenMicRegistration } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { OpenMicCard } from '@/components/cards/OpenMicCard';
import { LocationLink } from '@/components/ui/LocationLink';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { Modal } from '@/components/ui/Modal';
import { ShareButton } from '@/components/ui/ShareButton';

interface Props {
  router: Router;
  slug: string;
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

export function OpenMicDetailPage({ router, slug }: Props) {
  const [loading, setLoading] = useState(true);
  const [mic, setMic] = useState<OpenMic | null>(null);
  const [confirmed, setConfirmed] = useState<OpenMicRegistration[]>([]);
  const [otherMics, setOtherMics] = useState<OpenMic[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [lightbox, setLightbox] = useState(false);
  const [shareFallbackOpen, setShareFallbackOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('open_mics').select('*').eq('slug', slug).eq('published', true).maybeSingle();
      const m = data as OpenMic | null;
      setMic(m);

      if (m) {
        const isArchive = getOpenMicStatus(m.status, m.date) === 'completed';
        const [regRes, otherRes] = await Promise.all([
          publicLineupQuery(m.id, isArchive),
          supabase.from('open_mics').select('*').eq('published', true).eq('status', 'upcoming').neq('id', m.id).order('date', { ascending: true }).limit(2),
        ]);

        const regs = (regRes.data as OpenMicRegistration[]) ?? [];
        setConfirmed(regs);

        const others = (otherRes.data as OpenMic[]) ?? [];
        setOtherMics(others);
        if (others.length > 0) {
          const ids = others.map((o) => o.id);
          const { data: otherRegs } = await supabase.from('open_mic_registrations').select('open_mic_id').in('open_mic_id', ids).eq('status', 'confirmed').neq('attendance_status', 'absent');
          const c: Record<string, number> = {};
          (otherRegs ?? []).forEach((r: { open_mic_id: string }) => { c[r.open_mic_id] = (c[r.open_mic_id] ?? 0) + 1; });
          setCounts(c);
        }

        const pageUrl = `${window.location.origin}/open-mic/${m.slug}`;
        setOgTags(
          `${m.title} — Standupindo Cilegon`,
          `Yuk ikut ${m.title} bersama Standupindo Cilegon. Lihat detail dan daftar sekarang.`,
          m.poster ?? `${window.location.origin}/assets/images/Standupindo_CIlegon_Logo.jpeg`,
          pageUrl,
        );
      }
      setLoading(false);
    })();
  }, [slug]);

  useEffect(() => {
    if (!mic) return;
    const channel = supabase.channel(`lineup-${mic.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'open_mic_registrations', filter: `open_mic_id=eq.${mic.id}` }, async () => {
        const { data } = await publicLineupQuery(mic.id, getOpenMicStatus(mic.status, mic.date) === 'completed');
        setConfirmed((data as OpenMicRegistration[]) ?? []);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'open_mic_registrations', filter: `open_mic_id=eq.${mic.id}` }, async () => {
        const { data } = await publicLineupQuery(mic.id, getOpenMicStatus(mic.status, mic.date) === 'completed');
        setConfirmed((data as OpenMicRegistration[]) ?? []);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'open_mic_registrations', filter: `open_mic_id=eq.${mic.id}` }, async () => {
        const { data } = await publicLineupQuery(mic.id, getOpenMicStatus(mic.status, mic.date) === 'completed');
        setConfirmed((data as OpenMicRegistration[]) ?? []);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [mic]);

  if (loading) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} />
        <div className="container-app py-8"><LoadingSkeleton count={1} /></div>
      </div>
    );
  }

  if (!mic) {
    return (
      <div className="animate-fade-in">
        <PageHeader router={router} title="Open Mic tidak ditemukan" />
        <div className="container-app py-8">
          <EmptyState title="Open Mic tidak ditemukan" description="Mungkin halaman telah dihapus atau belum dipublikasikan." />
        </div>
      </div>
    );
  }

  const filled = confirmed.length;
  const total = mic.capacity;
  const isFull = filled >= total;
  const currentStatus = getOpenMicStatus(mic.status, mic.date);
  const closed = mic.registration_status === 'closed' || currentStatus !== 'upcoming';
  const pageUrl = `${window.location.origin}/open-mic/${mic.slug}`;
  const lineupText = confirmed.map((r) => `• ${r.stage_name}`).join('\n');
  const shareTitle = `${mic.title} — Standupindo Cilegon`;
  const shareImage = mic.poster;
  const shareText = [`Lineup ${mic.title}`, 'Standupindo Cilegon', '', 'Komika:', lineupText || 'Belum ada komika yang dikonfirmasi.', '', `📍 ${mic.venue}${mic.location ? `, ${mic.location}` : ''}`, `📅 ${formatDate(mic.date)}`, '', 'Lihat lineup lengkap:'].join('\n');

  async function shareLineup() {
    if (typeof navigator.share === 'function') {
      try {
        if (shareImage && typeof navigator.canShare === 'function' && typeof File !== 'undefined') {
          const response = await fetch(shareImage);
          const blob = await response.blob();
          const file = new File([blob], 'open-mic-lineup.jpg', { type: blob.type || 'image/jpeg' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ title: shareTitle, text: `${shareText}\n${pageUrl}`, url: pageUrl, files: [file] });
            return;
          }
        }
        await navigator.share({ title: shareTitle, text: `${shareText}\n${pageUrl}`, url: pageUrl });
        return;
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') return;
      }
    }
    setShareFallbackOpen(true);
  }

  async function copyLineupLink() {
    await navigator.clipboard.writeText(pageUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title={mic.title} />

      <div className="container-app py-6 space-y-6 sm:py-8 sm:space-y-8">
        <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_10px_28px_rgba(11,60,93,0.04)] sm:p-4">
          {/* Poster + metadata */}
          <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
            <div className="lg:col-span-2">
              <div className="overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
                {mic.poster ? (
                  <button onClick={() => setLightbox(true)} aria-label={`Lihat poster ${mic.title}`} className="block w-full">
                    <img src={mic.poster} alt={`${mic.title} poster`} className="aspect-[4/3] w-full object-contain transition-transform duration-500 hover:scale-105" />
                  </button>
                ) : (
                  <div className="aspect-[4/3] w-full" />
                )}
              </div>
            </div>
            <div className="lg:col-span-3 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={currentStatus} />
                  <StatusBadge status={mic.registration_status === 'open' ? 'open' : 'closed'} />
                </div>
                <ShareButton
                  title={`${mic.title} — Standupindo Cilegon`}
                  text={`Yuk ikut ${mic.title} bersama Standupindo Cilegon.\nLihat detail dan daftar sekarang.`}
                  url={pageUrl}
                  image={mic.poster}
                />
              </div>
              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex items-center gap-2.5"><Calendar className="h-4 w-4 text-blue-600" /> {formatDate(mic.date)}</div>
                <div className="flex items-center gap-2.5"><Clock className="h-4 w-4 text-blue-600" /> {mic.time} WIB</div>
                <LocationLink venue={mic.venue} location={mic.location} mapsUrl={mic.maps_url} className="items-center gap-2.5" />
              </div>

              <p className="text-sm font-bold text-slate-900 sm:text-base">{filled} Komika</p>

              {currentStatus === 'upcoming' && !closed && !isFull && (
                <button onClick={() => router.navigate(`/open-mic/${mic.slug}/daftar`)} className="btn-primary w-full !py-2.75 text-sm sm:!py-3 sm:text-base">
                  <Mic className="h-4 w-4 sm:h-5 sm:w-5" /> Daftar Open Mic
                </button>
              )}
              {currentStatus === 'upcoming' && isFull && !closed && (
                <button disabled className="btn-secondary w-full !py-2.75 !text-red-600 !border-red-200 !bg-red-50 text-sm sm:!py-3 sm:text-base">
                  SLOT PENUH
                </button>
              )}
              {closed && currentStatus === 'upcoming' && (
                <button disabled className="btn-secondary w-full !py-2.75 !text-slate-400 text-sm sm:!py-3 sm:text-base">
                  PENDAFTARAN DITUTUP
                </button>
              )}
            </div>
          </div>
        </div>

        {/* About */}
        {mic.description && (
          <section>
            <h2 className="mb-2 text-lg font-bold text-slate-900 sm:text-xl">Tentang Open Mic</h2>
            <p className="text-sm leading-relaxed text-slate-600 sm:text-base whitespace-pre-line">{mic.description}</p>
          </section>
        )}

        {/* Lineup */}
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 sm:text-xl">{currentStatus === 'completed' ? 'Arsip Lineup' : 'Lineup'}</h2>
              <p className="mt-1 text-sm text-slate-500">{confirmed.length} Komika{currentStatus === 'completed' ? ' hadir' : ''}</p>
            </div>
            <button onClick={() => void shareLineup()} aria-label="Bagikan lineup" title="Bagikan lineup" className="inline-flex shrink-0 items-center justify-center rounded-full bg-blue-50 p-2.5 text-blue-700 transition hover:bg-blue-100 active:scale-[0.98]">
              <Send className="h-4 w-4" />
            </button>
          </div>
          {confirmed.length === 0 ? (
            <EmptyState title={currentStatus === 'completed' ? 'Belum ada lineup yang ditandai hadir.' : 'Belum ada lineup yang terkonfirmasi.'} description={currentStatus === 'completed' ? 'Lineup arsip akan muncul setelah kehadiran ditandai admin.' : 'Lineup akan muncul setelah pendaftar dikonfirmasi admin.'} />
          ) : (
            <div className="space-y-2">
              {confirmed.map((r) => {
                const ig = normalizeInstagram(r.instagram);
                return (
                  <div key={r.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:px-4">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-slate-900 sm:text-base">{r.stage_name}</h3>
                        {r.community && <p className="truncate text-xs text-slate-500">{r.community}</p>}
                        {ig && (
                          <a href={ig.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900">
                            <Instagram className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{ig.label}</span>
                          </a>
                        )}
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-700 ring-1 ring-inset ring-green-200">
                        <Check className="h-3 w-3" /> {currentStatus === 'completed' ? 'Hadir' : 'Terkonfirmasi'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Other open mics */}
        {otherMics.length > 0 && (
          <section className="border-t border-slate-200 pt-6 sm:pt-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Open Mic lainnya</h2>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-blue-700 sm:text-[11px]">
                Lainnya
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
              {otherMics.map((m) => <OpenMicCard key={m.id} mic={m} confirmedCount={counts[m.id] ?? 0} router={router} />)}
            </div>
          </section>
        )}
      </div>

      {mic.poster && (
        <ImageLightbox src={mic.poster} alt={`${mic.title} poster`} open={lightbox} onClose={() => setLightbox(false)} />
      )}

      <Modal open={shareFallbackOpen} onClose={() => setShareFallbackOpen(false)} title="Bagikan Lineup" size="sm">
        <div className="space-y-2">
          <button onClick={() => void copyLineupLink()} className="flex w-full items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-blue-600" />} {copied ? 'Link berhasil disalin' : 'Salin Link'}
          </button>
          <a href={`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${pageUrl}`)}`} target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">Bagikan ke WhatsApp</a>
          <a href={`https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">Bagikan ke Telegram</a>
        </div>
      </Modal>
    </div>
  );
}

function publicLineupQuery(openMicId: string, onlyAttended: boolean) {
  const query = supabase
    .from('open_mic_registrations')
    .select('id, open_mic_id, stage_name, community, instagram, status, created_at')
    .eq('open_mic_id', openMicId)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: true });
  return onlyAttended ? query.eq('attendance_status', 'attended') : query.neq('attendance_status', 'absent');
}

function normalizeInstagram(value: string | null): { label: string; url: string } | null {
  const input = value?.trim();
  if (!input) return null;
  if (/^https?:\/\//i.test(input)) {
    const username = input.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/?(?:\?.*)?$/, '');
    return { label: `@${username}`, url: input };
  }
  const username = input.replace(/^@/, '').replace(/^instagram\.com\//i, '').replace(/\/?(?:\?.*)?$/, '');
  if (!username) return null;
  return { label: `@${username}`, url: `https://instagram.com/${encodeURIComponent(username)}` };
}
