import { useEffect, useMemo, useState } from 'react';
import { ArrowDownWideNarrow, Building2, CalendarDays, Download, Globe2, MapPin, Mic, Search, Send, Share2, Trophy } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { MemberOpenMicHistorySubmission, OpenMic, OpenMicRegistration } from '@/lib/types';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';
import { useSiteSettings } from '@/lib/useSiteSettings';

type PerformanceHistoryItem = {
  id: string;
  source: 'internal' | 'external';
  title: string;
  date: string;
  venue: string;
  city: string | null;
  appearanceNumber?: number;
};

type ShareSummaryType = 'all' | 'total' | 'internal' | 'external';

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function instagramHandle(value: string) {
  return value.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/.*$/, '');
}

function getShareDomain() {
  return typeof window === 'undefined' ? '' : window.location.hostname.toUpperCase();
}

function loadCanvasImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    if (!src.startsWith('/')) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawContainedImage(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  const imageWidth = image.width * scale;
  const imageHeight = image.height * scale;
  context.drawImage(image, x + (width - imageWidth) / 2, y + (height - imageHeight) / 2, imageWidth, imageHeight);
}

async function createSummaryImage(
  summary: { total: number; internal: number; external: number },
  identity: { stageName: string; community: string; instagram: string; photo: string },
  type: ShareSummaryType,
  branding: { siteLogo: string | null; affiliationName: string | null | undefined; affiliationLogo: string | null | undefined },
  domain: string,
): Promise<Blob> {
  const [communityLogo, standupindoLogo, profilePhoto] = await Promise.all([
    loadCanvasImage(branding.siteLogo || '/assets/images/Standupindo_CIlegon_Logo.jpeg'),
    loadCanvasImage(branding.affiliationLogo || '/assets/images/image.png'),
    identity.photo ? loadCanvasImage(identity.photo) : Promise.resolve(null),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Kartu ringkasan tidak dapat dibuat di perangkat ini.');

  context.fillStyle = '#f7fbff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ade1fb';
  context.beginPath();
  context.arc(0, 0, 220, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(canvas.width, canvas.height, 270, 0, Math.PI * 2);
  context.fill();

  if (communityLogo) drawContainedImage(context, communityLogo, 82, 60, 120, 120);
  context.fillStyle = '#041d56';
  context.font = '800 31px Arial, sans-serif';
  context.fillText('STANDUPINDO', 222, 105, 500);
  context.fillText('CILEGON', 222, 148, 500);
  if (standupindoLogo) drawContainedImage(context, standupindoLogo, 790, 68, 210, 110);
  else {
    context.textAlign = 'right';
    context.font = '800 26px Arial, sans-serif';
    context.fillText((branding.affiliationName || 'Standupindo').toUpperCase(), 1000, 128, 210);
    context.textAlign = 'start';
  }
  context.strokeStyle = '#ade1fb';
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(76, 202);
  context.lineTo(1004, 202);
  context.stroke();

  const photoX = 86;
  const photoY = 272;
  const photoSize = 330;
  context.fillStyle = '#266ca9';
  roundedRect(context, photoX, photoY, photoSize, photoSize, 34);
  context.fill();
  context.fillStyle = '#ade1fb';
  roundedRect(context, photoX + 12, photoY + 12, photoSize - 24, photoSize - 24, 30);
  context.fill();
  context.save();
  roundedRect(context, photoX + 23, photoY + 23, photoSize - 46, photoSize - 46, 26);
  context.clip();
  if (profilePhoto) {
    const scale = Math.max((photoSize - 46) / profilePhoto.width, (photoSize - 46) / profilePhoto.height);
    const imageWidth = profilePhoto.width * scale;
    const imageHeight = profilePhoto.height * scale;
    context.drawImage(profilePhoto, photoX + 23 + ((photoSize - 46) - imageWidth) / 2, photoY + 23 + ((photoSize - 46) - imageHeight) / 2, imageWidth, imageHeight);
  } else {
    context.fillStyle = '#ade1fb';
    context.fillRect(photoX + 23, photoY + 23, photoSize - 46, photoSize - 46);
    context.fillStyle = '#0f2573';
    context.font = '800 118px Arial, sans-serif';
    context.textAlign = 'center';
    context.fillText((identity.stageName || 'OM').slice(0, 1).toUpperCase(), photoX + photoSize / 2, photoY + 218);
    context.textAlign = 'start';
  }
  context.restore();

  context.fillStyle = '#ade1fb';
  roundedRect(context, 462, 286, 530, 64, 32);
  context.fill();
  context.fillStyle = '#266ca9';
  context.textAlign = 'center';
  context.font = '700 25px Arial, sans-serif';
  context.fillText(type === 'all' ? 'PERJALANAN PANGGUNG OPEN MIC' : 'RIWAYAT OPEN MIC', 727, 327, 490);
  context.textAlign = 'start';
  context.fillStyle = '#041d56';
  context.font = '800 66px Arial, sans-serif';
  context.fillText(identity.stageName || 'Perjalanan Panggung', 462, 438, 530);
  if (identity.instagram) {
    context.fillStyle = '#266ca9';
    context.font = '600 34px Arial, sans-serif';
    context.fillText(`@${instagramHandle(identity.instagram)}`, 462, 494, 530);
  }
  if (identity.community) {
    context.fillStyle = '#475569';
    context.font = '500 26px Arial, sans-serif';
    context.fillText(identity.community, 462, identity.instagram ? 546 : 500, 530);
  }
  context.fillStyle = '#266ca9';
  context.fillRect(462, 575, 140, 5);

  const metricData: Array<{ label: string; value: number; color: string; accent: string }> = type === 'all'
    ? [
        { label: 'TOTAL OPEN MIC', value: summary.total, color: '#041d56', accent: '#ade1fb' },
        { label: 'INTERNAL', value: summary.internal, color: '#0f2573', accent: '#ade1fb' },
        { label: 'EKSTERNAL', value: summary.external, color: '#266ca9', accent: '#ade1fb' },
      ]
    : type === 'internal'
      ? [{ label: 'OPEN MIC INTERNAL', value: summary.internal, color: '#0f2573', accent: '#ade1fb' }]
      : type === 'external'
        ? [{ label: 'OPEN MIC EKSTERNAL', value: summary.external, color: '#266ca9', accent: '#ade1fb' }]
        : [{ label: 'TOTAL OPEN MIC', value: summary.total, color: '#041d56', accent: '#ade1fb' }];

  const cardTop = 650;
  const cardHeight = 270;
  const gap = 22;
  const cardWidth = (968 - gap * (metricData.length - 1)) / metricData.length;
  metricData.forEach((metric, index) => {
    const x = metricData.length === 1 ? (canvas.width - cardWidth) / 2 : 56 + index * (cardWidth + gap);
    const cardGradient = context.createLinearGradient(x, cardTop, x + cardWidth, cardTop + cardHeight);
    cardGradient.addColorStop(0, metric.color);
    cardGradient.addColorStop(1, metric.color === '#041d56' ? '#0f2573' : metric.color === '#0f2573' ? '#266ca9' : '#0f2573');
    context.fillStyle = cardGradient;
    roundedRect(context, x, cardTop, cardWidth, cardHeight, 36);
    context.fill();
    context.fillStyle = metric.accent;
    context.beginPath();
    context.arc(x + cardWidth / 2, cardTop + 72, 23, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.font = '800 108px Arial, sans-serif';
    context.fillText(String(metric.value), x + cardWidth / 2, cardTop + 190);
    context.fillStyle = '#ade1fb';
    context.font = '700 24px Arial, sans-serif';
    context.fillText(metric.label, x + cardWidth / 2, cardTop + 232, cardWidth - 36);
    context.textAlign = 'start';
  });

  context.fillStyle = '#041d56';
  roundedRect(context, 56, 964, 968, 310, 34);
  context.fill();
  context.fillStyle = '#266ca9';
  context.beginPath();
  context.arc(1024, 1274, 230, Math.PI, Math.PI * 1.5);
  context.lineTo(1024, 1274);
  context.fill();
  context.fillStyle = '#ade1fb';
  context.font = '800 48px Georgia, serif';
  context.fillText('“', 112, 1038);
  context.strokeStyle = '#266ca9';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(166, 1014);
  context.lineTo(970, 1014);
  context.stroke();
  context.fillStyle = '#ffffff';
  context.font = '500 30px Arial, sans-serif';
  context.textAlign = 'left';
  context.fillText('Jejak langkah di atas panggung adalah', 166, 1080);
  context.fillText('bukti keberanian untuk berbagi tawa', 166, 1120);
  context.fillText('dan cerita.', 166, 1160);
  context.fillStyle = '#ade1fb';
  context.fillRect(166, 1190, 100, 4);
  context.fillStyle = '#ade1fb';
  context.font = '700 18px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText(domain, canvas.width / 2, 1238);
  context.textAlign = 'start';

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Gambar ringkasan gagal dibuat.'));
    }, 'image/png');
  });
}

export function MemberPerformanceHistoryPage({ router, embedded = false }: { router: Router; embedded?: boolean }) {
  const { user } = useAuth();
  const { settings } = useSiteSettings();
  const [items, setItems] = useState<PerformanceHistoryItem[]>([]);
  const [memberIdentity, setMemberIdentity] = useState({ stageName: '', community: '', instagram: '', photo: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | PerformanceHistoryItem['source']>('all');
  const [shareType, setShareType] = useState<ShareSummaryType | null>(null);
  const [shareFeedback, setShareFeedback] = useState('');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError('');
      setMemberIdentity({ stageName: '', community: '', instagram: '', photo: '' });
      const { data: komikaRow } = await supabase
        .from('komika')
        .select('id, full_name, stage_name, instagram_url, photo')
        .or(`user_id.eq.${user.id},id.eq.${user.id}`)
        .maybeSingle();

      const komikaId = komikaRow?.id ?? null;
      if (!komikaId) {
        setItems([]);
        setLoading(false);
        return;
      }

      const [{ data: registrationData, error: registrationError }, { data: externalData, error: externalError }] = await Promise.all([
        supabase.from('open_mic_registrations').select('*').eq('komika_id', komikaId).eq('attendance_status', 'attended'),
        supabase.from('member_open_mic_history_submissions').select('*').eq('komika_id', komikaId).eq('status', 'approved'),
      ]);

      if (registrationError || externalError) {
        setError('Riwayat tampil belum dapat dimuat. Coba lagi beberapa saat.');
        setItems([]);
        setLoading(false);
        return;
      }

      const registrations = (registrationData as OpenMicRegistration[]) ?? [];
      const externalSubmissions = (externalData as MemberOpenMicHistorySubmission[]) ?? [];
      setMemberIdentity({
        stageName: komikaRow?.stage_name?.trim() || komikaRow?.full_name?.trim() || '',
        community: registrations.find((registration) => registration.community?.trim())?.community?.trim() ?? '',
        instagram: instagramHandle(komikaRow?.instagram_url?.trim() || registrations.find((registration) => registration.instagram?.trim())?.instagram?.trim() || ''),
        photo: komikaRow?.photo?.trim() ?? '',
      });
      const openMicIds = registrations.map((registration) => registration.open_mic_id);
      const { data: openMicData, error: openMicError } = openMicIds.length > 0
        ? await supabase.from('open_mics').select('*').in('id', openMicIds)
        : { data: [], error: null };

      if (openMicError) {
        setError('Detail Open Mic belum dapat dimuat. Coba lagi beberapa saat.');
        setItems([]);
        setLoading(false);
        return;
      }

      const openMics = (openMicData as OpenMic[]) ?? [];
      const openMicById = new Map(openMics.map((openMic) => [openMic.id, openMic]));
      const chronologicalRegistrations = [...registrations].sort((first, second) => {
        const firstMic = openMicById.get(first.open_mic_id);
        const secondMic = openMicById.get(second.open_mic_id);
        return (firstMic?.date ?? first.created_at).localeCompare(secondMic?.date ?? second.created_at)
          || (firstMic?.time ?? '').localeCompare(secondMic?.time ?? '')
          || first.created_at.localeCompare(second.created_at)
          || first.id.localeCompare(second.id);
      });
      const appearanceNumberByRegistrationId = new Map(
        chronologicalRegistrations.map((registration, index) => [registration.id, index + 1]),
      );
      const internalItems = registrations.map((registration) => {
        const openMic = openMicById.get(registration.open_mic_id);
        return {
          id: `internal-${registration.id}`,
          source: 'internal' as const,
          title: openMic?.title ?? 'Open Mic Internal',
          date: openMic?.date ?? registration.created_at,
          venue: openMic?.venue ?? 'Lokasi tidak tersedia',
          city: openMic?.location ?? null,
          appearanceNumber: appearanceNumberByRegistrationId.get(registration.id),
        };
      });
      const externalItems = externalSubmissions.map((submission) => ({
        id: `external-${submission.id}`,
        source: 'external' as const,
        title: submission.title,
        date: submission.event_date,
        venue: submission.venue,
        city: submission.city,
      }));

      setItems([...internalItems, ...externalItems]);
      setLoading(false);
    })();
  }, [user?.id]);

  const sortedItems = useMemo(() => [...items].sort((first, second) => second.date.localeCompare(first.date)), [items]);
  const summary = useMemo(() => ({
    total: items.length,
    internal: items.filter((item) => item.source === 'internal').length,
    external: items.filter((item) => item.source === 'external').length,
  }), [items]);
  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sortedItems.filter((item) => {
      const matchesSource = sourceFilter === 'all' || item.source === sourceFilter;
      const matchesSearch = !query || `${item.title} ${item.venue} ${item.city ?? ''} ${item.source}`.toLowerCase().includes(query);
      return matchesSource && matchesSearch;
    });
  }, [search, sourceFilter, sortedItems]);

  const shareMetrics = useMemo(() => {
    if (shareType === 'internal') return [{ label: 'OPEN MIC INTERNAL', value: summary.internal }];
    if (shareType === 'external') return [{ label: 'OPEN MIC EKSTERNAL', value: summary.external }];
    if (shareType === 'total') return [{ label: 'TOTAL OPEN MIC', value: summary.total }];
    return [
      { label: 'TOTAL OPEN MIC', value: summary.total },
      { label: 'INTERNAL', value: summary.internal },
      { label: 'EKSTERNAL', value: summary.external },
    ];
  }, [shareType, summary]);

  function getShareText() {
    const identity = [
      memberIdentity.stageName,
      memberIdentity.community,
      memberIdentity.instagram ? `@${instagramHandle(memberIdentity.instagram)}` : '',
    ].filter(Boolean);
    const counts = shareMetrics.map((metric) => `${metric.label}: ${metric.value}`).join('\n');
    return `${identity.join(' · ')}${identity.length ? '\n\n' : ''}${counts}\n\nTerus berkarya, terus naik panggung.`;
  }

  async function handleShareSummary() {
    if (!shareType || sharing) return;
    if (typeof navigator.share !== 'function') {
      setShareFeedback('Fitur berbagi sistem tidak didukung browser ini. Coba buka halaman dari browser/perangkat yang mendukung berbagi, atau pilih Unduh Gambar.');
      return;
    }
    setSharing(true);
    setShareFeedback('');
    try {
      const blob = await createSummaryImage(
        summary,
        memberIdentity,
        shareType,
        {
          siteLogo: settings.logo_url,
          affiliationName: settings.affiliation_name,
          affiliationLogo: settings.affiliation_logo_url ?? '/assets/images/image.png',
        },
        getShareDomain(),
      );
      const file = new File([blob], 'ringkasan-open-mic.png', { type: 'image/png' });
      const title = 'Ringkasan Open Mic';
      const text = getShareText();
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ title, text, files: [file] });
      } else {
        await navigator.share({ title, text });
        setShareFeedback('Browser ini membuka menu berbagi dengan teks. Untuk membagikan kartu gambar, gunakan Unduh Gambar.');
      }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      setShareFeedback(shareError instanceof Error ? `Menu berbagi gagal dibuka: ${shareError.message}` : 'Menu berbagi gagal dibuka. Coba lagi atau pilih Unduh Gambar.');
    } finally {
      setSharing(false);
    }
  }

  async function handleDownloadSummary() {
    if (!shareType || sharing) return;
    setSharing(true);
    setShareFeedback('');
    try {
      const blob = await createSummaryImage(
        summary,
        memberIdentity,
        shareType,
        {
          siteLogo: settings.logo_url,
          affiliationName: settings.affiliation_name,
          affiliationLogo: settings.affiliation_logo_url ?? '/assets/images/image.png',
        },
        getShareDomain(),
      );
      const imageUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = 'ringkasan-open-mic.png';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
      setShareFeedback('Kartu ringkasan berhasil diunduh.');
    } catch (downloadError) {
      setShareFeedback(downloadError instanceof Error ? downloadError.message : 'Kartu ringkasan gagal diunduh.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="animate-fade-in">
      {!embedded && <PageHeader router={router} title="Riwayat Open Mic Ku" subtitle="Catatan penampilan kamu di internal maupun eksternal." />}
      <div className="container-app py-6 sm:py-8">
        {error && <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
        {!loading && <section className="mb-4" aria-label="Ringkasan riwayat Open Mic">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-blue-600" />
              <h2 className="text-xs font-extrabold uppercase tracking-wide text-slate-700">Ringkasan</h2>
            </div>
            <button
              type="button"
              onClick={() => { setShareType('all'); setShareFeedback(''); }}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 active:scale-95"
              aria-label="Bagikan ringkasan Open Mic"
              title="Bagikan ringkasan"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-white px-1 py-2 shadow-sm">
            {[
              { label: 'Total Open Mic', value: summary.total, icon: Mic, color: 'text-blue-700' },
              { label: 'Internal', value: summary.internal, icon: Building2, color: 'text-indigo-700' },
              { label: 'Eksternal', value: summary.external, icon: Globe2, color: 'text-emerald-700' },
            ].map(({ label, value, icon: Icon, color }) => (
              <article key={label} className="flex min-w-0 flex-col items-center px-1.5 text-center sm:flex-row sm:justify-center sm:gap-2 sm:px-3 sm:text-left">
                <Icon className={`h-4 w-4 shrink-0 ${color}`} aria-hidden="true" />
                <div className="mt-1 min-w-0 sm:mt-0">
                  <p className="text-lg font-black leading-none text-slate-950">{value}</p>
                  <p className="mt-1 truncate text-[9px] font-bold leading-tight text-slate-600 sm:text-[11px]">{label}</p>
                </div>
              </article>
            ))}
          </div>
        </section>}
        {loading ? (
          <div className="h-48 animate-pulse rounded-[28px] bg-slate-100" />
        ) : items.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <Trophy className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 font-bold text-slate-700">Belum ada riwayat tampil</p>
            <p className="mt-1 text-sm text-slate-500">Penampilan yang sudah hadir atau disetujui akan muncul di sini.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-field pl-10 text-sm font-medium text-slate-800 placeholder:text-slate-500" placeholder="Cari judul, venue, atau kota..." aria-label="Cari riwayat Open Mic" />
            </div>
            <div className="grid grid-cols-3 rounded-xl border border-slate-300 bg-white p-1" aria-label="Filter sumber riwayat">
              {(['all', 'internal', 'external'] as const).map((source) => <button key={source} type="button" onClick={() => setSourceFilter(source)} className={`rounded-lg px-2 py-2 text-xs font-bold transition ${sourceFilter === source ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>{source === 'all' ? 'Semua' : source === 'internal' ? 'Internal' : 'Eksternal'}</button>)}
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs font-bold text-slate-700">
                <span className="text-sm font-black text-slate-950">{visibleItems.length}</span>
                <span className="mx-1 text-slate-400">dari</span>
                <span>{sortedItems.length} penampilan</span>
              </p>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                <ArrowDownWideNarrow className="h-3.5 w-3.5 text-blue-600" />
                TERBARU
              </span>
            </div>
            {visibleItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-medium text-slate-600">Riwayat yang kamu cari tidak ditemukan.</div>
            ) : (['internal', 'external'] as const).map((source) => {
              const groupItems = visibleItems.filter((item) => item.source === source);
              if (groupItems.length === 0) return null;
              const isInternal = source === 'internal';
              return <section key={source} className="space-y-2.5">
                <div className="flex items-center justify-between gap-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-4 w-1 rounded-full ${isInternal ? 'bg-blue-600' : 'bg-emerald-500'}`} />
                    <h2 className="text-xs font-extrabold uppercase tracking-wide text-slate-800">{isInternal ? 'Internal' : 'Eksternal'}</h2>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${isInternal ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>{groupItems.length} penampilan</span>
                </div>
                {groupItems.map((item) => <article key={item.id} className="rounded-2xl border border-slate-300 bg-white p-3.5 shadow-[0_6px_16px_rgba(15,23,42,0.05)] sm:p-4">
                  <div className="flex items-start justify-between gap-3"><h3 className="min-w-0 break-words text-sm font-black text-slate-950 sm:text-base">{item.title}</h3><Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /></div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-semibold text-slate-600"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-slate-500" />{formatDate(item.date)}</span><span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-500" />{item.venue}{item.city ? `, ${item.city}` : ''}</span>{item.source === 'internal' && item.appearanceNumber && <span className="font-bold text-blue-700">Open Mic ke-{item.appearanceNumber} di Standupindo Cilegon</span>}</div>
                </article>)}
              </section>;
            })}
          </div>
        )}
      </div>
      <Modal open={shareType !== null} onClose={() => { if (!sharing) { setShareType(null); setShareFeedback(''); } }} title="Bagikan Ringkasan" size="md">
        {shareType && <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-bold text-slate-700">Pilih ringkasan</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['all', 'Lengkap'],
                ['total', 'Total Open Mic'],
                ['internal', 'Open Mic Internal'],
                ['external', 'Open Mic Eksternal'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setShareType(value); setShareFeedback(''); }}
                  aria-pressed={shareType === value}
                  className={`rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition ${shareType === value ? 'border-blue-600 bg-blue-50 text-blue-800 ring-1 ring-blue-200' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-blue-200 bg-[#f8fbff] shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-blue-200 px-3 py-2.5 sm:px-4">
              <div className="flex min-w-0 items-center gap-2">
                <img src={settings.logo_url ?? '/assets/images/Standupindo_CIlegon_Logo.jpeg'} alt="" className="h-8 w-8 shrink-0 object-contain" />
                  <p className="text-[10px] font-black leading-[1.15] tracking-[0.08em] text-[#041d56] sm:text-xs">STANDUPINDO<br />CILEGON</p>
              </div>
              <img src={settings.affiliation_logo_url ?? '/assets/images/image.png'} alt={settings.affiliation_name ?? 'Standupindo'} className="h-8 w-16 shrink-0 object-contain sm:h-9 sm:w-20" />
            </div>
            <div className="flex items-center gap-3 px-3 py-4 sm:gap-4 sm:px-4">
              {memberIdentity.photo
                ? <img src={memberIdentity.photo} alt={`Foto ${memberIdentity.stageName || 'Member'}`} className="h-24 w-24 shrink-0 rounded-xl object-cover shadow-md sm:h-28 sm:w-28" />
                : <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#ade1fb] to-[#266ca9] text-3xl font-black text-[#041d56] shadow-md ring-4 ring-[#ade1fb] sm:h-28 sm:w-28">{(memberIdentity.stageName || 'OM').slice(0, 1).toUpperCase()}</div>}
              <div className="min-w-0">
                <p className="inline-block max-w-full truncate rounded-full bg-[#ade1fb]/60 px-2.5 py-1 text-[9px] font-extrabold tracking-wide text-[#0f2573] sm:text-[10px]">{shareType === 'all' ? 'PERJALANAN PANGGUNG OPEN MIC' : 'RIWAYAT OPEN MIC'}</p>
                <h3 className="mt-2 truncate text-xl font-black leading-tight text-[#041d56] sm:text-2xl">{memberIdentity.stageName || 'Perjalanan Panggung'}</h3>
                {memberIdentity.instagram && <p className="mt-1 truncate text-xs font-semibold text-[#266ca9]">@{instagramHandle(memberIdentity.instagram)}</p>}
                {memberIdentity.community && <p className="mt-1 truncate text-[10px] text-slate-600">{memberIdentity.community}</p>}
              </div>
            </div>
            <div className={`mx-3 grid gap-1.5 rounded-xl bg-[#041d56] p-2 sm:mx-4 sm:gap-2 sm:p-3 ${shareMetrics.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
              {shareMetrics.map((metric) => <div key={metric.label} className="min-w-0 border-r border-[#266ca9] px-1 text-center last:border-r-0">
                <p className="text-xl font-black leading-none text-white sm:text-2xl">{metric.value}</p>
                <p className="mt-1 truncate text-[8px] font-extrabold leading-tight text-[#ade1fb] sm:text-[9px]">{metric.label}</p>
              </div>)}
            </div>
            <div className="mx-3 mb-3 mt-3 rounded-xl bg-[#041d56] px-3 py-2.5 sm:mx-4 sm:mb-4">
              <div className="flex items-start gap-2">
                <span className="text-xl font-black leading-none text-[#ade1fb]">“</span>
                <p className="border-t border-[#266ca9] pt-1.5 text-left text-[10px] font-medium leading-4 text-white sm:text-[11px]">Jejak langkah di atas panggung adalah bukti keberanian untuk berbagi tawa dan cerita.</p>
              </div>
              <p className="mt-2 text-center text-[8px] font-extrabold tracking-[0.12em] text-[#ade1fb]">{getShareDomain()}</p>
            </div>
          </div>
          {shareFeedback && <p role="status" className="rounded-xl bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-800">{shareFeedback}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleDownloadSummary()} disabled={sharing} className="btn-secondary flex-1 !min-h-11 !px-3 !py-2.5 text-sm disabled:opacity-60">
              <Download className="h-4 w-4" /> Unduh Gambar
            </button>
            <button type="button" onClick={() => void handleShareSummary()} disabled={sharing} className="btn-primary flex-1 !min-h-11 !px-3 !py-2.5 text-sm disabled:opacity-60">
              <Share2 className="h-4 w-4" /> {sharing ? 'Menyiapkan...' : 'Bagikan'}
            </button>
          </div>
        </div>}
      </Modal>
    </div>
  );
}
