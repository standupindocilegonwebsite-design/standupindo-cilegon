import { formatDate, getOpenMicStatus } from '@/lib/format';
import { useEffect, useState } from 'react';
import { Calendar, Check, CheckCircle2, Clock, Copy, Info, Instagram, Mic, Send, Ticket } from 'lucide-react';
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
              <div className="max-h-[18rem] overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200 sm:max-h-none">
                {mic.poster ? (
                  <button onClick={() => setLightbox(true)} aria-label={`Lihat poster ${mic.title}`} className="block w-full">
                    <img src={mic.poster} alt={`${mic.title} poster`} className="aspect-[4/3] max-h-[18rem] w-full object-contain transition-transform duration-500 hover:scale-105 sm:max-h-none" />
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
          <section data-scroll-reveal className="scroll-reveal is-visible">
            <div className="overflow-hidden rounded-2xl border border-slate-200 border-l-4 border-l-blue-600 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-[0_5px_12px_rgba(37,99,235,0.2)]"><Info className="h-4 w-4" /></span>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Informasi panggung</p>
                  <h2 className="text-lg font-extrabold text-slate-950 sm:text-xl">Tentang Open Mic</h2>
                </div>
              </div>
              <p className="px-4 py-4 text-sm font-medium leading-7 text-slate-800 whitespace-pre-line sm:px-5 sm:text-base">{mic.description}</p>
            </div>
          </section>
        )}

        {/* Lineup */}
        <section data-scroll-reveal className="scroll-reveal is-visible">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 sm:text-xl">{currentStatus === 'completed' ? 'Arsip Lineup' : 'Lineup'}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-800">{confirmed.length} Komika {currentStatus === 'completed' ? 'tampil' : 'terdaftar'}</p>
            </div>
            <button onClick={() => void shareLineup()} aria-label="Bagikan lineup" title="Bagikan lineup" className="inline-flex shrink-0 items-center justify-center rounded-full bg-blue-50 p-2.5 text-blue-700 transition hover:bg-blue-100 active:scale-[0.98]">
              <Send className="h-4 w-4" />
            </button>
          </div>
          {confirmed.length === 0 ? (
            <EmptyState title={currentStatus === 'completed' ? 'Belum ada lineup yang ditandai tampil.' : 'Belum ada lineup yang terkonfirmasi.'} description={currentStatus === 'completed' ? 'Lineup arsip akan muncul setelah penampilan ditandai admin.' : 'Lineup akan muncul setelah pendaftar dikonfirmasi admin.'} />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              <table className="w-full min-w-[500px] table-fixed text-left">
                <thead className="border-b border-slate-200/80 bg-slate-50/70 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="w-[38%] px-3 py-2.5 sm:px-4">Komika</th>
                    <th className="w-[37%] px-3 py-2.5 sm:px-4">Instagram</th>
                    <th className="w-[25%] px-3 py-2.5 text-center sm:px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {confirmed.map((r) => {
                    const ig = normalizeInstagram(r.instagram);
                    return (
                      <tr key={r.id} className="text-sm transition-colors hover:bg-slate-50/60">
                        <td className="px-3 py-3 sm:px-4">
                          <p className="truncate font-bold text-slate-900">{r.stage_name}</p>
                          {r.community && <p className="truncate text-xs text-slate-500">{r.community}</p>}
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          {ig ? (
                            <a href={ig.url} target="_blank" rel="noopener noreferrer" className="group/instagram inline-flex max-w-full items-center gap-2 text-xs font-semibold text-slate-700 transition-colors hover:text-[#9f1857]">
                              <Instagram className="h-4 w-4 shrink-0 text-[#c13584] transition-transform group-hover/instagram:scale-110" />
                              <span className="truncate">{ig.label}</span>
                            </a>
                          ) : <span className="text-xs text-slate-400">-</span>}
                        </td>
                        <td className="px-3 py-3 text-center sm:px-4">
                          <span className={`inline-flex ${currentStatus === 'completed' ? 'text-green-600' : 'text-blue-600'}`} title={currentStatus === 'completed' ? 'Tampil' : 'Terdaftar'} aria-label={currentStatus === 'completed' ? 'Tampil' : 'Terdaftar'}>
                            {currentStatus === 'completed' ? <CheckCircle2 className="h-5 w-5" /> : <Ticket className="h-5 w-5" />}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Other open mics */}
        {otherMics.length > 0 && (
          <section data-scroll-reveal className="scroll-reveal is-visible border-t border-slate-200 pt-6 sm:pt-8">
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
