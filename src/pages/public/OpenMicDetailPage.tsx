import { formatDate, getOpenMicNumbers, getOpenMicStatus } from '@/lib/format';
import { useEffect, useState } from 'react';
import { Calendar, Check, CheckCircle2, ChevronDown, Clock, Info, Instagram, Mic, Search, Send, Ticket, X } from 'lucide-react';
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
import { ShareButton } from '@/components/ui/ShareButton';
import { NoSmokeAreaNotice } from '@/components/ui/NoSmokeAreaNotice';
import { ShareLineupModal } from '@/components/open-mic/ShareLineupModal';
import { useSiteSettings } from '@/lib/useSiteSettings';

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
  const { settings } = useSiteSettings();
  const [loading, setLoading] = useState(true);
  const [mic, setMic] = useState<OpenMic | null>(null);
  const [confirmed, setConfirmed] = useState<OpenMicRegistration[]>([]);
  const [otherMics, setOtherMics] = useState<OpenMic[]>([]);
  const [numberedMics, setNumberedMics] = useState<OpenMic[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [otherLineups, setOtherLineups] = useState<Record<string, string[]>>({});
  const [lightbox, setLightbox] = useState(false);
  const [copied, setCopied] = useState(false);
  const [posterShareFile, setPosterShareFile] = useState<File | null>(null);
  const [shareLineupOpen, setShareLineupOpen] = useState(false);
  const [stageInfoExpanded, setStageInfoExpanded] = useState(false);
  const [lineupSearch, setLineupSearch] = useState('');
  const [otherMicSearch, setOtherMicSearch] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('open_mics').select('*').eq('slug', slug).eq('published', true).maybeSingle();
      const m = data as OpenMic | null;
      setMic(m);

      if (m) {
        const isArchive = getOpenMicStatus(m.status, m.date) === 'completed';
        const [regRes, otherRes, allMicsRes] = await Promise.all([
          publicLineupQuery(m.id, isArchive),
          supabase
            .from('open_mics')
            .select('*')
            .eq('published', true)
            .eq('status', 'upcoming')
            .neq('id', m.id)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(2),
          supabase.from('open_mics').select('*').eq('published', true),
        ]);

        const regs = (regRes.data as OpenMicRegistration[]) ?? [];
        setConfirmed(regs);

        const others = (otherRes.data as OpenMic[]) ?? [];
        setOtherMics(others);
        setNumberedMics((allMicsRes.data as OpenMic[]) ?? [m]);
        if (others.length > 0) {
          const ids = others.map((o) => o.id);
          const c: Record<string, number> = {};
          const names: Record<string, string[]> = {};
          const otherResults = await Promise.all(others.map((other) => publicLineupQuery(other.id, getOpenMicStatus(other.status, other.date) === 'completed')));
          otherResults.forEach((result, index) => {
            const rows = (result.data as OpenMicRegistration[]) ?? [];
            const openMicId = others[index].id;
            c[openMicId] = rows.length;
            names[openMicId] = rows.map((row) => row.stage_name).filter(Boolean);
          });
          setCounts(c);
          setOtherLineups(names);
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
    setPosterShareFile(null);
    const posterUrl = mic?.poster;
    const openMicSlug = mic?.slug;
    if (!posterUrl || !openMicSlug || !mic || getOpenMicStatus(mic.status, mic.date) === 'completed' || typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return;

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(posterUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`Gagal mengambil poster Open Mic (${response.status}).`);
        const posterBlob = await response.blob();
        if (!posterBlob.type.startsWith('image/')) throw new Error('Poster Open Mic bukan file gambar yang dapat dibagikan.');

        const extension = posterBlob.type === 'image/png' ? 'png' : posterBlob.type === 'image/webp' ? 'webp' : 'jpg';
        const candidate = new File([posterBlob], `${openMicSlug}-poster.${extension}`, { type: posterBlob.type });
        if (!controller.signal.aborted && navigator.canShare({ files: [candidate] })) setPosterShareFile(candidate);
      } catch (error) {
        if (!controller.signal.aborted) console.error('Gagal menyiapkan poster Open Mic untuk dibagikan.', error);
      }
    })();

    return () => controller.abort();
  }, [mic?.poster, mic?.slug, mic?.status, mic?.date]);

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

  useEffect(() => {
    if (!loading && window.location.hash === '#lineup') {
      document.getElementById('lineup')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loading]);

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
  const registrationStatus = currentStatus === 'upcoming' && mic.registration_status === 'open' ? 'open' : 'closed';
  const pageUrl = `${window.location.origin}/open-mic/${mic.slug}`;
  const lineupText = confirmed.map((r) => `• ${r.stage_name}`).join('\n');
  const shareTitle = `${mic.title} — Standupindo Cilegon`;
  const openMicNumbers = getOpenMicNumbers(numberedMics.length > 0 ? numberedMics : [mic]);
  const normalizedLineupSearch = lineupSearch.trim().toLocaleLowerCase();
  const filteredLineup = normalizedLineupSearch
    ? confirmed.filter((registration) => [
      registration.stage_name,
      registration.instagram,
      registration.community,
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedLineupSearch)))
    : confirmed;
  const normalizedOtherMicSearch = otherMicSearch.trim().toLocaleLowerCase();
  const filteredOtherMics = normalizedOtherMicSearch
    ? otherMics.filter((otherMic) => [
      otherMic.title,
      otherMic.venue,
      otherMic.location,
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedOtherMicSearch)))
    : otherMics.slice(0, 3);
  const shareText = currentStatus === 'completed'
    ? [
      'Pecah banget! Terima kasih buat semua yang sudah hadir meramaikan dan para komika yang sudah sukses mengocok perut di acara kemarin! 🔥🎤',
      '',
      `Daftar Lineup Perform di *${mic.title}* (Selesai)`,
      'Standupindo Cilegon',
      '',
      'Komika:',
      lineupText || 'Belum ada komika yang dikonfirmasi hadir.',
      '',
      `📍 *${mic.venue}${mic.location ? `, ${mic.location}` : ''}*`,
      `📅 ${formatDate(mic.date)}`,
      `⏰ *${mic.time} WIB*`,
      '',
      'Mau lihat arsip lineup lengkap atau keseruan acaranya? Cek di sini ya:',
    ].join('\n')
    : [
      'Siapin mental buat ketawa bareng! Datang langsung yuk tonton keseruannya, atau kalau mau ikutan tampil juga bisa banget lho! 👇',
      '',
      `Daftar Lineup Sementara di *${mic.title}*`,
      'Standupindo Cilegon',
      '',
      'Komika:',
      lineupText || 'Belum ada komika yang dikonfirmasi.',
      '',
      `📍 *${mic.venue}${mic.location ? `, ${mic.location}` : ''}*`,
      `📅 ${formatDate(mic.date)}`,
      `⏰ *${mic.time} WIB*`,
      '',
      'Mau datang nonton atau mau daftar jadi penampil? Cek info lengkapnya di sini:',
    ].join('\n');

  async function shareLineup() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: shareTitle,
          text: `${shareText}\n${pageUrl}`,
          ...(posterShareFile && navigator.canShare?.({ files: [posterShareFile] }) ? { files: [posterShareFile] } : {}),
        });
        return;
      } catch (error) {
        if ((error as DOMException)?.name === 'AbortError') return;
        console.error('Gagal membuka native share sheet untuk lineup.', error);
        return;
      }
    }
    await copyLineupLink();
  }

  async function copyLineupLink() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Gagal menyalin link lineup.', error);
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title={`${mic.title} · Open Mic #${openMicNumbers.get(mic.id) ?? ''}`} />

      <div className="container-app py-6 space-y-6 sm:py-8 sm:space-y-8">
        <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_10px_28px_rgba(11,60,93,0.04)] sm:p-4">
          {/* Poster + metadata */}
          <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
            <div className="lg:col-span-2">
              <div className="max-h-[18rem] overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200 sm:max-h-none">
                {mic.poster ? (
                  <button onClick={() => setLightbox(true)} aria-label={`Lihat poster ${mic.title}`} className="block w-full">
                    <img src={mic.poster} alt={`${mic.title} poster`} className={`aspect-[4/3] max-h-[18rem] w-full object-contain transition-transform duration-500 hover:scale-105 sm:max-h-none ${currentStatus === 'completed' ? 'grayscale' : ''}`} />
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
                  <StatusBadge status={registrationStatus} />
                </div>
                <ShareButton
                  title={`${mic.title} — Standupindo Cilegon`}
                  text={`🎤 OPEN MIC STANDUP COMEDY\n\nMau coba naik panggung dan ngetes materi?\nYuk daftar Open Mic *${mic.title}* di Standupindo Cilegon!\n\n📅 ${formatDate(mic.date)}\n⏰ *${mic.time} WIB*\n📍 *${mic.venue}${mic.location ? `, ${mic.location}` : ''}*\n\n🎟️ Daftar & lihat detail:\n${pageUrl}`}
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
              {currentStatus !== 'completed' && <NoSmokeAreaNotice detail context="open-mic" />}

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
              <button
                type="button"
                aria-expanded={stageInfoExpanded}
                aria-controls="open-mic-stage-info"
                onClick={() => setStageInfoExpanded((expanded) => !expanded)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 sm:px-5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-[0_5px_12px_rgba(37,99,235,0.2)]"><Info className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">Informasi panggung</p>
                  <h2 className="text-lg font-extrabold text-slate-950 sm:text-xl">Tentang Open Mic</h2>
                </div>
                <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${stageInfoExpanded ? 'rotate-180' : ''}`} />
              </button>
              {stageInfoExpanded && (
                <div id="open-mic-stage-info" className="border-t border-slate-100 px-4 py-4 text-sm font-medium leading-7 text-slate-800 sm:px-5 sm:text-base">
                  <p className="whitespace-pre-line">{mic.description}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Lineup */}
        <section id="lineup" data-scroll-reveal className="scroll-reveal is-visible scroll-mt-24">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 sm:text-xl">{currentStatus === 'completed' ? 'DAFTAR LINEUP' : 'LINEUP SEMENTARA'}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-800">{currentStatus === 'completed' ? `${confirmed.length} KOMIKA PERFORM` : `${confirmed.length} KOMIKA TERDAFTAR`}</p>
            </div>
            <button onClick={() => currentStatus === 'completed' ? setShareLineupOpen(true) : void shareLineup()} aria-label={copied ? 'Link lineup berhasil disalin' : 'Bagikan lineup'} title={copied ? 'Link lineup berhasil disalin' : 'Bagikan lineup'} className="inline-flex shrink-0 items-center justify-center rounded-full bg-blue-50 p-2.5 text-blue-700 transition hover:bg-blue-100 active:scale-[0.98]">
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          {confirmed.length === 0 ? (
            <EmptyState title={currentStatus === 'completed' ? 'Belum ada lineup yang ditandai tampil.' : 'Belum ada lineup yang terkonfirmasi.'} description={currentStatus === 'completed' ? 'Lineup arsip akan muncul setelah penampilan ditandai admin.' : 'Lineup akan muncul setelah pendaftar dikonfirmasi admin.'} />
          ) : (
            <>
              <label className="relative mb-3 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={lineupSearch}
                  onChange={(event) => setLineupSearch(event.target.value)}
                  placeholder="Cari nama panggung, Instagram, atau komunitas"
                  aria-label="Cari komika di lineup ini"
                  className="input-field !pl-10"
                />
              </label>
              {filteredLineup.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">Tidak ada komika di lineup ini yang cocok dengan pencarian.</p>
              ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-300 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
              <table className="w-full min-w-[500px] table-fixed text-left">
                <thead className="border-b-2 border-blue-800 bg-blue-700 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">
                  <tr>
                    <th className="w-[38%] px-3 py-2.5 sm:px-4">Komika</th>
                    <th className="w-[37%] px-3 py-2.5 sm:px-4">Instagram</th>
                    <th className="w-[25%] px-3 py-2.5 text-center sm:px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {filteredLineup.map((r, index) => {
                    const ig = normalizeInstagram(r.instagram);
                    return (
                      <tr key={r.id} className={`text-sm transition-colors ${index % 2 === 0 ? 'bg-white hover:bg-blue-100' : 'bg-slate-100 hover:bg-blue-100'}`}>
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
            </>
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
            <label className="relative mb-3 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={otherMicSearch}
                onChange={(event) => setOtherMicSearch(event.target.value)}
                placeholder="Cari Open Mic lain"
                aria-label="Cari Open Mic lainnya"
                className="input-field !pl-10 !pr-10"
              />
              {otherMicSearch && (
                <button
                  type="button"
                  onClick={() => setOtherMicSearch('')}
                  aria-label="Hapus pencarian Open Mic"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </label>
            {filteredOtherMics.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">Tidak ada Open Mic yang cocok dengan pencarian.</p>
            ) : (
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              {filteredOtherMics.map((m) => <OpenMicCard key={m.id} mic={m} openMicNumber={openMicNumbers.get(m.id)} confirmedCount={counts[m.id] ?? 0} lineup={otherLineups[m.id]} router={router} compact />)}
            </div>
            )}
          </section>
        )}
      </div>

      {mic.poster && (
        <ImageLightbox src={mic.poster} alt={`${mic.title} poster`} open={lightbox} onClose={() => setLightbox(false)} />
      )}

      <ShareLineupModal
        open={shareLineupOpen && currentStatus === 'completed'}
        onClose={() => setShareLineupOpen(false)}
        mic={mic}
        performers={confirmed}
        shareText={`${shareText}\n${pageUrl}`}
        siteLogo={settings.logo_url}
        affiliationLogo={settings.affiliation_logo_url}
      />
    </div>
  );
}

function publicLineupQuery(openMicId: string, onlyAttended: boolean) {
  const query = supabase
    .from('open_mic_registrations')
    .select('id, open_mic_id, komika_id, stage_name, community, instagram, status, created_at')
    .eq('open_mic_id', openMicId)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: true });
  return onlyAttended ? query.eq('attendance_status', 'attended') : query.neq('attendance_status', 'absent');
}

function normalizeInstagram(value: string | null): { label: string; url: string } | null {
  const input = value?.trim();
  if (!input) return null;
  if (/^https?:\/\//i.test(input)) {
    const username = input.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/?(?:\?.*)?$/, '').toLowerCase();
    return { label: `@${username}`, url: `https://instagram.com/${encodeURIComponent(username)}` };
  }
  const username = input.replace(/^@/, '').replace(/^instagram\.com\//i, '').replace(/\/?(?:\?.*)?$/, '').toLowerCase();
  if (!username) return null;
  return { label: `@${username}`, url: `https://instagram.com/${encodeURIComponent(username)}` };
}
