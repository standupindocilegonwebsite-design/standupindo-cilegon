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
  alsoMc?: boolean;
};

type McHistoryItem = {
  id: string;
  source: 'internal' | 'external';
  title: string;
  date: string;
  venue: string;
  city: string | null;
};

function normalizeHistoryValue(value: string | null | undefined) {
  return (value ?? '').trim().toLocaleLowerCase('id-ID').replace(/\s+/g, ' ');
}

type ShareSummaryType = 'all' | 'total' | 'internal' | 'external' | 'mc' | 'mc-total' | 'mc-internal' | 'mc-external';
type HistoryCategory = 'open-mic' | 'mc';

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
    loadCanvasImage(branding.siteLogo || '/assets/images/Logo%20Standupindo%20Cilegon%20Biru.png'),
    loadCanvasImage(branding.affiliationLogo || '/assets/images/image.png'),
    identity.photo ? loadCanvasImage(identity.photo) : Promise.resolve(null),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Kartu ringkasan tidak dapat dibuat di perangkat ini.');

  const isMcSummary = type.startsWith('mc');
  const theme = isMcSummary
    ? { background: '#faf7ff', accent: '#c4b5fd', primary: '#4c1d95', secondary: '#7c3aed', light: '#ede9fe' }
    : { background: '#f7fbff', accent: '#ade1fb', primary: '#041d56', secondary: '#266ca9', light: '#dbeafe' };
  context.fillStyle = theme.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = theme.accent;
  context.beginPath();
  context.arc(0, 0, 220, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(canvas.width, canvas.height, 270, 0, Math.PI * 2);
  context.fill();

  if (communityLogo) drawContainedImage(context, communityLogo, 82, 60, 120, 120);
  context.fillStyle = theme.primary;
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
  context.strokeStyle = theme.accent;
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(76, 202);
  context.lineTo(1004, 202);
  context.stroke();

  const photoX = 86;
  const photoY = 272;
  const photoSize = 330;
  context.fillStyle = theme.secondary;
  roundedRect(context, photoX, photoY, photoSize, photoSize, 34);
  context.fill();
  context.fillStyle = theme.light;
  roundedRect(context, photoX + 12, photoY + 12, photoSize - 24, photoSize - 24, 30);
  context.fill();
  context.save();
  roundedRect(context, photoX + 23, photoY + 23, photoSize - 46, photoSize - 46, 26);
  context.clip();
  if (profilePhoto) {
    context.fillStyle = '#ffffff';
    context.fillRect(photoX + 23, photoY + 23, photoSize - 46, photoSize - 46);
    drawContainedImage(context, profilePhoto, photoX + 23, photoY + 23, photoSize - 46, photoSize - 46);
  } else {
    context.fillStyle = theme.light;
    context.fillRect(photoX + 23, photoY + 23, photoSize - 46, photoSize - 46);
    context.fillStyle = theme.primary;
    context.font = '800 118px Arial, sans-serif';
    context.textAlign = 'center';
    context.fillText((identity.stageName || 'OM').slice(0, 1).toUpperCase(), photoX + photoSize / 2, photoY + 218);
    context.textAlign = 'start';
  }
  context.restore();

  context.fillStyle = theme.light;
  roundedRect(context, 462, 286, 530, 64, 32);
  context.fill();
  context.fillStyle = theme.secondary;
  context.textAlign = 'center';
  context.font = '700 25px Arial, sans-serif';
  context.fillText(isMcSummary ? 'RIWAYAT MC' : type === 'all' ? 'PERJALANAN PANGGUNG OPEN MIC' : 'RIWAYAT OPEN MIC', 727, 327, 490);
  context.textAlign = 'start';
  context.fillStyle = theme.primary;
  context.font = '800 66px Arial, sans-serif';
  context.fillText(identity.stageName || 'Perjalanan Panggung', 462, 438, 530);
  if (identity.instagram) {
    context.fillStyle = theme.secondary;
    context.font = '600 34px Arial, sans-serif';
    context.fillText(`@${instagramHandle(identity.instagram)}`, 462, 494, 530);
  }
  if (identity.community) {
    context.fillStyle = '#475569';
    context.font = '500 26px Arial, sans-serif';
    context.fillText(identity.community, 462, identity.instagram ? 546 : 500, 530);
  }
  context.fillStyle = theme.secondary;
  context.fillRect(462, 575, 140, 5);

  const metricData: Array<{ label: string; value: number; color: string; accent: string }> = type === 'mc'
    ? [
        { label: 'TOTAL MC', value: summary.total, color: '#4c1d95', accent: '#c4b5fd' },
        { label: 'INTERNAL', value: summary.internal, color: '#5b21b6', accent: '#ddd6fe' },
        { label: 'EKSTERNAL', value: summary.external, color: '#7c3aed', accent: '#ede9fe' },
      ]
    : type === 'mc-internal'
      ? [{ label: 'MC INTERNAL', value: summary.internal, color: '#5b21b6', accent: '#ddd6fe' }]
      : type === 'mc-external'
        ? [{ label: 'MC EKSTERNAL', value: summary.external, color: '#7c3aed', accent: '#ede9fe' }]
        : type === 'mc-total'
          ? [{ label: 'TOTAL MC', value: summary.total, color: '#4c1d95', accent: '#c4b5fd' }]
    : type === 'all'
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
    cardGradient.addColorStop(1, isMcSummary ? '#7c3aed' : metric.color === '#041d56' ? '#0f2573' : metric.color === '#0f2573' ? '#266ca9' : '#0f2573');
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
    context.fillStyle = theme.accent;
    context.font = '700 24px Arial, sans-serif';
    context.fillText(metric.label, x + cardWidth / 2, cardTop + 232, cardWidth - 36);
    context.textAlign = 'start';
  });

  context.fillStyle = theme.primary;
  roundedRect(context, 56, 964, 968, 310, 34);
  context.fill();
  context.fillStyle = theme.secondary;
  context.beginPath();
  context.arc(1024, 1274, 230, Math.PI, Math.PI * 1.5);
  context.lineTo(1024, 1274);
  context.fill();
  context.fillStyle = theme.accent;
  context.font = '800 48px Georgia, serif';
  context.fillText('“', 112, 1038);
  context.strokeStyle = theme.secondary;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(166, 1014);
  context.lineTo(970, 1014);
  context.stroke();
  context.fillStyle = '#ffffff';
  context.font = '500 30px Arial, sans-serif';
  context.textAlign = 'left';
  context.fillText(isMcSummary ? 'Memandu cerita, menjaga tawa,' : 'Jejak langkah di atas panggung adalah', 166, 1080);
  context.fillText(isMcSummary ? 'dan merangkai pengalaman di' : 'bukti keberanian untuk berbagi tawa', 166, 1120);
  context.fillText(isMcSummary ? 'setiap panggung.' : 'dan cerita.', 166, 1160);
  context.fillStyle = theme.accent;
  context.fillRect(166, 1190, 100, 4);
  context.fillStyle = theme.accent;
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
  const [mcItems, setMcItems] = useState<McHistoryItem[]>([]);
  const [memberIdentity, setMemberIdentity] = useState({ stageName: '', community: '', instagram: '', photo: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [historyCategory, setHistoryCategory] = useState<HistoryCategory>('open-mic');
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
        supabase.from('member_open_mic_history_submissions').select('*').eq('komika_id', komikaId).eq('status', 'approved').eq('activity_type', 'performance'),
      ]);

      if (registrationError || externalError) {
        setError('Riwayat tampil belum dapat dimuat. Coba lagi beberapa saat.');
        setItems([]);
        setLoading(false);
        return;
      }

      const registrations = (registrationData as OpenMicRegistration[]) ?? [];
      const externalSubmissions = (externalData as MemberOpenMicHistorySubmission[]) ?? [];
      const { data: mcData, error: mcError } = await supabase.from('member_open_mic_history_submissions')
        .select('*')
        .eq('komika_id', komikaId)
        .eq('status', 'approved')
        .in('activity_type', ['mc_internal', 'mc_external']);
      if (mcError) {
        setError('Riwayat MC belum dapat dimuat. Coba lagi beberapa saat.');
        setItems([]);
        setMcItems([]);
        setLoading(false);
        return;
      }
      const mcSubmissions = (mcData as MemberOpenMicHistorySubmission[]) ?? [];
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
      const internalItems: PerformanceHistoryItem[] = registrations.map((registration) => {
        const openMic = openMicById.get(registration.open_mic_id);
        const isMc = mcSubmissions.some((submission) => submission.activity_type === 'mc_internal'
          && submission.internal_open_mic_id === registration.open_mic_id);
        return {
          id: `internal-${registration.id}`,
          source: 'internal' as const,
          title: openMic?.title ?? 'Open Mic Internal',
          date: openMic?.date ?? registration.created_at,
          venue: openMic?.venue ?? 'Lokasi tidak tersedia',
          city: openMic?.location ?? null,
          appearanceNumber: appearanceNumberByRegistrationId.get(registration.id),
          alsoMc: isMc,
        };
      });
      const mcExternalEventKeys = new Set(mcSubmissions
        .filter((submission) => submission.activity_type === 'mc_external')
        .map((submission) => [submission.event_date, normalizeHistoryValue(submission.title), normalizeHistoryValue(submission.venue)].join('|')));
      const externalItems: PerformanceHistoryItem[] = externalSubmissions.map((submission) => ({
        id: `external-${submission.id}`,
        source: 'external' as const,
        title: submission.title,
        date: submission.event_date,
        venue: submission.venue,
        city: submission.city,
        alsoMc: mcExternalEventKeys.has([submission.event_date, normalizeHistoryValue(submission.title), normalizeHistoryValue(submission.venue)].join('|')),
      }));

      setItems([...internalItems, ...externalItems]);
      setMcItems(mcSubmissions.map((submission) => ({
        id: submission.id,
        source: submission.activity_type === 'mc_internal' ? 'internal' : 'external',
        title: submission.title,
        date: submission.event_date,
        venue: submission.venue,
        city: submission.city,
      })));
      setLoading(false);
    })();
  }, [user?.id]);

  const sortedItems = useMemo(() => [...items].sort((first, second) => second.date.localeCompare(first.date)), [items]);
  const summary = useMemo(() => ({
    total: items.length,
    internal: items.filter((item) => item.source === 'internal').length,
    external: items.filter((item) => item.source === 'external').length,
  }), [items]);
  const mcSummary = useMemo(() => ({
    total: mcItems.length,
    internal: mcItems.filter((item) => item.source === 'internal').length,
    external: mcItems.filter((item) => item.source === 'external').length,
  }), [mcItems]);
  const sortedMcItems = useMemo(() => [...mcItems].sort((first, second) => second.date.localeCompare(first.date)), [mcItems]);
  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sortedItems.filter((item) => {
      const matchesSource = sourceFilter === 'all' || item.source === sourceFilter;
      const matchesSearch = !query || `${item.title} ${item.venue} ${item.city ?? ''} ${item.source}`.toLowerCase().includes(query);
      return matchesSource && matchesSearch;
    });
  }, [search, sourceFilter, sortedItems]);
  const visibleMcItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID');
    return sortedMcItems.filter((item) => {
      const matchesSource = sourceFilter === 'all' || item.source === sourceFilter;
      const matchesSearch = !query || `${item.title} ${item.venue} ${item.city ?? ''} ${item.source}`.toLocaleLowerCase('id-ID').includes(query);
      return matchesSource && matchesSearch;
    });
  }, [search, sourceFilter, sortedMcItems]);

  const shareMetrics = useMemo(() => {
    if (shareType === 'mc') return [
      { label: 'TOTAL MC', value: mcSummary.total },
      { label: 'INTERNAL', value: mcSummary.internal },
      { label: 'EKSTERNAL', value: mcSummary.external },
    ];
    if (shareType === 'mc-total') return [{ label: 'TOTAL MC', value: mcSummary.total }];
    if (shareType === 'mc-internal') return [{ label: 'MC INTERNAL', value: mcSummary.internal }];
    if (shareType === 'mc-external') return [{ label: 'MC EKSTERNAL', value: mcSummary.external }];
    if (shareType === 'internal') return [{ label: 'OPEN MIC INTERNAL', value: summary.internal }];
    if (shareType === 'external') return [{ label: 'OPEN MIC EKSTERNAL', value: summary.external }];
    if (shareType === 'total') return [{ label: 'TOTAL OPEN MIC', value: summary.total }];
    return [
      { label: 'TOTAL OPEN MIC', value: summary.total },
      { label: 'INTERNAL', value: summary.internal },
      { label: 'EKSTERNAL', value: summary.external },
    ];
  }, [mcSummary, shareType, summary]);

  function getShareText() {
    const identity = [
      memberIdentity.stageName,
      memberIdentity.community,
      memberIdentity.instagram ? `@${instagramHandle(memberIdentity.instagram)}` : '',
    ].filter(Boolean);
    const counts = shareMetrics.map((metric) => `${metric.label}: ${metric.value}`).join('\n');
    return `${identity.join(' · ')}${identity.length ? '\n\n' : ''}${counts}\n\n${shareType?.startsWith('mc') ? 'Terus berkarya di balik panggung.' : 'Terus berkarya, terus naik panggung.'}`;
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
        shareType.startsWith('mc') ? mcSummary : summary,
        memberIdentity,
        shareType,
        {
          siteLogo: settings.logo_url,
          affiliationName: settings.affiliation_name,
          affiliationLogo: settings.affiliation_logo_url ?? '/assets/images/image.png',
        },
        getShareDomain(),
      );
      const title = shareType.startsWith('mc') ? 'Ringkasan MC' : 'Ringkasan Open Mic';
      const file = new File([blob], `ringkasan-${shareType.startsWith('mc') ? 'mc' : 'open-mic'}.png`, { type: 'image/png' });
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
        shareType.startsWith('mc') ? mcSummary : summary,
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
      link.download = `ringkasan-${shareType.startsWith('mc') ? 'mc' : 'open-mic'}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
      setShareFeedback('Kartu ringkasan berhasil diunduh.');
    } catch (downloadError) {
      setShareFeedback(downloadError instanceof Error ? downloadError.message : 'Kartu ringkasan gagal diunduh.');
    } finally {
      setSharing(false);
    }
  }

  const isMcShare = shareType?.startsWith('mc') ?? false;

  return (
    <div className="animate-fade-in">
      {!embedded && <PageHeader router={router} title="Riwayat Pengalamanku" subtitle="Catatan penampilan Open Mic dan pengalaman MC kamu." />}
      <div className={`container-app rounded-2xl py-6 transition-colors sm:py-8 ${historyCategory === 'mc' ? 'bg-violet-50/50' : 'bg-blue-50/50'}`}>
        {error && <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
        <div className="mb-4 grid grid-cols-2 rounded-xl border border-slate-300 bg-white p-1" aria-label="Kategori riwayat pengalaman">
          {([
            ['open-mic', 'OPEN MIC'],
            ['mc', 'MC'],
          ] as const).map(([category, label]) => (
            <button
              key={category}
              type="button"
              onClick={() => { setHistoryCategory(category); setSearch(''); setSourceFilter('all'); }}
              aria-pressed={historyCategory === category}
              className={`rounded-lg px-2 py-2.5 text-xs font-extrabold transition sm:text-sm ${historyCategory === category ? category === 'mc' ? 'bg-violet-600 text-white shadow-sm' : 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <section className={`mb-4 flex items-center gap-3 rounded-2xl border p-3.5 shadow-sm sm:p-4 ${historyCategory === 'mc' ? 'border-violet-200 bg-gradient-to-r from-violet-100 to-white' : 'border-blue-200 bg-gradient-to-r from-blue-100 to-white'}`}>
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${historyCategory === 'mc' ? 'bg-violet-600' : 'bg-blue-600'}`}>
            {historyCategory === 'mc' ? <Mic className="h-5 w-5" /> : <Trophy className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className={`text-[11px] font-extrabold uppercase tracking-[0.12em] ${historyCategory === 'mc' ? 'text-violet-700' : 'text-blue-700'}`}>Riwayat Pengalamanku</p>
            <h1 className="mt-0.5 text-base font-black leading-5 text-slate-950 sm:text-lg">{historyCategory === 'mc' ? 'Pengalaman sebagai MC' : 'Penampilan Open Mic'}</h1>
            <p className="mt-1 text-xs leading-5 text-slate-600">{historyCategory === 'mc' ? 'Daftar acara yang kamu pandu sebagai MC.' : 'Daftar acara Open Mic tempat kamu tampil sebagai komika.'}</p>
          </div>
        </section>
        {!loading && historyCategory === 'open-mic' && <section className="mb-4" aria-label="Ringkasan Open Mic">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-blue-600" />
              <h2 className="text-sm font-extrabold tracking-wide text-slate-800">Ringkasan Open Mic</h2>
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
          <div className="grid grid-cols-3 divide-x divide-blue-100 rounded-2xl border border-blue-200 bg-white px-1 py-3 shadow-sm">
            {[
              { label: 'Total Open Mic', value: summary.total, icon: Mic, color: 'text-blue-700' },
              { label: 'Internal', value: summary.internal, icon: Building2, color: 'text-indigo-700' },
              { label: 'Eksternal', value: summary.external, icon: Globe2, color: 'text-emerald-700' },
            ].map(({ label, value, icon: Icon, color }) => (
              <article key={label} className="flex min-w-0 flex-col items-center px-1.5 text-center sm:flex-row sm:justify-center sm:gap-2 sm:px-3 sm:text-left">
                <Icon className={`h-4 w-4 shrink-0 ${color}`} aria-hidden="true" />
                <div className="mt-1 min-w-0 sm:mt-0">
                  <p className="text-xl font-black leading-none text-slate-950">{value}</p>
                  <p className="mt-1 truncate text-[11px] font-bold leading-tight text-slate-700 sm:text-xs">{label}</p>
                </div>
              </article>
            ))}
          </div>
        </section>}
        {!loading && historyCategory === 'mc' && <section className="mb-4" aria-label="Ringkasan MC">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2"><span className="h-4 w-1 rounded-full bg-violet-600" /><h2 className="text-sm font-extrabold tracking-wide text-slate-800">Ringkasan MC</h2></div>
            <button
              type="button"
              onClick={() => { setShareType('mc'); setShareFeedback(''); }}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-white text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 active:scale-95"
              aria-label="Bagikan ringkasan MC"
              title="Bagikan ringkasan MC"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 divide-x divide-violet-100 rounded-2xl border border-violet-200 bg-white px-1 py-3 shadow-sm">
            {[
              { label: 'Total MC', value: mcSummary.total, icon: Mic, color: 'text-violet-700' },
              { label: 'Internal', value: mcSummary.internal, icon: Building2, color: 'text-purple-700' },
              { label: 'Eksternal', value: mcSummary.external, icon: Globe2, color: 'text-fuchsia-700' },
            ].map(({ label, value, icon: Icon, color }) => (
              <article key={label} className="flex min-w-0 flex-col items-center px-1.5 text-center sm:flex-row sm:justify-center sm:gap-2 sm:px-3 sm:text-left">
                <Icon className={`h-4 w-4 shrink-0 ${color}`} aria-hidden="true" />
                <div className="mt-1 min-w-0 sm:mt-0">
                  <p className="text-xl font-black leading-none text-slate-950">{value}</p>
                  <p className="mt-1 truncate text-[11px] font-bold leading-tight text-violet-800 sm:text-xs">{label}</p>
                </div>
              </article>
            ))}
          </div>
        </section>}
        {loading ? (
          <div className="h-48 animate-pulse rounded-[28px] bg-slate-100" />
        ) : historyCategory === 'mc' ? mcItems.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-violet-200 bg-violet-50/50 p-8 text-center">
            <Mic className="mx-auto h-8 w-8 text-violet-400" />
            <p className="mt-3 font-bold text-slate-700">Belum ada riwayat MC</p>
            <p className="mt-1 text-sm text-slate-500">Pengalaman MC yang sudah disetujui akan muncul di sini.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-field pl-10 text-sm font-medium text-slate-800 placeholder:text-slate-500" placeholder="Cari judul, venue, atau kota..." aria-label="Cari riwayat MC" />
            </div>
            <div className="grid grid-cols-3 rounded-xl border border-violet-200 bg-white p-1" aria-label="Filter sumber riwayat MC">
              {(['all', 'internal', 'external'] as const).map((source) => <button key={source} type="button" onClick={() => setSourceFilter(source)} className={`rounded-lg px-2 py-2 text-xs font-bold transition ${sourceFilter === source ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 hover:bg-violet-50'}`}>{source === 'all' ? 'Semua' : source === 'internal' ? 'Internal' : 'Eksternal'}</button>)}
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-violet-100 bg-white px-3 py-2">
              <p className="text-sm font-semibold text-slate-700"><span className="font-black text-violet-900">{visibleMcItems.length}</span><span className="mx-1 text-slate-400">dari</span><span>{sortedMcItems.length} acara MC</span></p>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1.5 text-xs font-bold text-violet-800"><ArrowDownWideNarrow className="h-4 w-4" />Terbaru</span>
            </div>
            {visibleMcItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/50 p-6 text-center text-sm font-medium text-slate-600">Riwayat MC yang kamu cari tidak ditemukan.</div>
            ) : (['internal', 'external'] as const).map((source) => {
              const groupItems = visibleMcItems.filter((item) => item.source === source);
              if (groupItems.length === 0) return null;
              return <section key={source} className="space-y-2.5">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-100/70 px-3 py-2">
                  <div className="flex items-center gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-lg text-white ${source === 'internal' ? 'bg-blue-600' : 'bg-violet-600'}`}>{source === 'internal' ? <Building2 className="h-4 w-4" /> : <Globe2 className="h-4 w-4" />}</span><h2 className="text-sm font-extrabold text-violet-950">MC {source === 'internal' ? 'Internal' : 'Eksternal'}</h2></div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-violet-800">{groupItems.length} acara</span>
                </div>
                {groupItems.map((item) => <article key={item.id} className="rounded-2xl border border-violet-200 border-l-4 border-l-violet-500 bg-white p-4 shadow-[0_4px_14px_rgba(76,29,149,0.08)] sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-base font-black leading-6 text-slate-950">{item.title}</h3>
                      <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${item.source === 'internal' ? 'bg-blue-100 text-blue-800' : 'bg-violet-100 text-violet-800'}`}>
                        {item.source === 'internal' ? <Building2 className="h-3.5 w-3.5" /> : <Globe2 className="h-3.5 w-3.5" />}
                        MC {item.source === 'internal' ? 'Internal' : 'Eksternal'}
                      </span>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1.5 text-xs font-bold text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />Disetujui</span>
                  </div>
                  <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-sm font-medium text-slate-700">
                    <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-violet-600" />{formatDate(item.date)}</span>
                    <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-violet-600" />{item.venue}{item.city ? `, ${item.city}` : ''}</span>
                  </div>
                </article>)}
              </section>;
            })}
          </div>
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
            <div className="flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2.5">
              <p className="text-sm font-semibold text-slate-700">
                <span className="font-black text-slate-950">{visibleItems.length}</span>
                <span className="mx-1 text-slate-400">dari</span>
                <span>{sortedItems.length} acara tampil</span>
              </p>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1.5 text-xs font-bold text-blue-800">
                <ArrowDownWideNarrow className="h-4 w-4 text-blue-700" />
                Terbaru
              </span>
            </div>
            {visibleItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-medium text-slate-600">Riwayat yang kamu cari tidak ditemukan.</div>
            ) : (['internal', 'external'] as const).map((source) => {
              const groupItems = visibleItems.filter((item) => item.source === source);
              if (groupItems.length === 0) return null;
              const isInternal = source === 'internal';
              return <section key={source} className="space-y-2.5">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-100/70 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-white ${isInternal ? 'bg-blue-600' : 'bg-emerald-600'}`}>{isInternal ? <Building2 className="h-4 w-4" /> : <Globe2 className="h-4 w-4" />}</span>
                    <h2 className="text-sm font-extrabold text-blue-950">Open Mic {isInternal ? 'Internal' : 'Eksternal'}</h2>
                  </div>
                  <span className={`rounded-full bg-white px-2.5 py-1 text-xs font-bold ${isInternal ? 'text-blue-800' : 'text-emerald-800'}`}>{groupItems.length} acara</span>
                </div>
                {groupItems.map((item) => <article key={item.id} className={`rounded-2xl border bg-white p-4 shadow-[0_4px_14px_rgba(15,23,42,0.07)] sm:p-5 ${isInternal ? 'border-blue-200 border-l-4 border-l-blue-500' : 'border-emerald-200 border-l-4 border-l-emerald-500'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-base font-black leading-6 text-slate-950">{item.title}</h3>
                      {item.alsoMc && <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-800"><Mic className="h-3.5 w-3.5" />MC</span>}
                    </div>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50"><Trophy className="h-4 w-4 text-amber-600" /></span>
                  </div>
                  <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-sm font-medium text-slate-700">
                    <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-blue-600" />{formatDate(item.date)}</span>
                    <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-blue-600" />{item.venue}{item.city ? `, ${item.city}` : ''}</span>
                    {item.source === 'internal' && item.appearanceNumber && <span className="rounded-lg bg-blue-50 px-2.5 py-2 text-xs font-bold text-blue-800">Penampilan ke-{item.appearanceNumber} di Standupindo Cilegon</span>}
                  </div>
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
              {(isMcShare ? [
                ['mc', 'Lengkap'],
                ['mc-total', 'Total MC'],
                ['mc-internal', 'MC Internal'],
                ['mc-external', 'MC Eksternal'],
              ] as const : [
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
                  className={`rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition ${shareType === value ? isMcShare ? 'border-violet-600 bg-violet-50 text-violet-800 ring-1 ring-violet-200' : 'border-blue-600 bg-blue-50 text-blue-800 ring-1 ring-blue-200' : `border-slate-200 bg-white text-slate-600 ${isMcShare ? 'hover:border-violet-300' : 'hover:border-blue-300'}`}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className={`overflow-hidden rounded-2xl border shadow-sm ${isMcShare ? 'border-violet-200 bg-[#faf7ff]' : 'border-blue-200 bg-[#f8fbff]'}`}>
            <div className={`flex items-center justify-between gap-2 border-b px-3 py-2.5 sm:px-4 ${isMcShare ? 'border-violet-200' : 'border-blue-200'}`}>
              <div className="flex min-w-0 items-center gap-2">
                <img src={settings.logo_url ?? '/assets/images/Logo%20Standupindo%20Cilegon%20Biru.png'} alt="" className="h-8 w-8 shrink-0 object-contain" />
                  <p className="text-[10px] font-black leading-[1.15] tracking-[0.08em] text-[#041d56] sm:text-xs">STANDUPINDO<br />CILEGON</p>
              </div>
              <img src={settings.affiliation_logo_url ?? '/assets/images/image.png'} alt={settings.affiliation_name ?? 'Standupindo'} className="h-8 w-16 shrink-0 object-contain sm:h-9 sm:w-20" />
            </div>
            <div className="flex items-center gap-3 px-3 py-4 sm:gap-4 sm:px-4">
              {memberIdentity.photo
                ? <img src={memberIdentity.photo} alt={`Foto ${memberIdentity.stageName || 'Member'}`} className="h-24 w-24 shrink-0 rounded-xl bg-white object-contain p-1 shadow-md sm:h-28 sm:w-28" />
                : <div className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-xl text-3xl font-black shadow-md ring-4 sm:h-28 sm:w-28 ${isMcShare ? 'bg-gradient-to-br from-violet-200 to-violet-500 text-violet-950 ring-violet-200' : 'bg-gradient-to-br from-[#ade1fb] to-[#266ca9] text-[#041d56] ring-[#ade1fb]'}`}>{(memberIdentity.stageName || 'OM').slice(0, 1).toUpperCase()}</div>}
              <div className="min-w-0">
                <p className={`inline-block max-w-full truncate rounded-full px-2.5 py-1 text-[9px] font-extrabold tracking-wide sm:text-[10px] ${isMcShare ? 'bg-violet-100 text-violet-900' : 'bg-[#ade1fb]/60 text-[#0f2573]'}`}>{isMcShare ? 'RIWAYAT MC' : shareType === 'all' ? 'PERJALANAN PANGGUNG OPEN MIC' : 'RIWAYAT OPEN MIC'}</p>
                <h3 className={`mt-2 truncate text-xl font-black leading-tight sm:text-2xl ${isMcShare ? 'text-violet-950' : 'text-[#041d56]'}`}>{memberIdentity.stageName || 'Perjalanan Panggung'}</h3>
                {memberIdentity.instagram && <p className={`mt-1 truncate text-xs font-semibold ${isMcShare ? 'text-violet-700' : 'text-[#266ca9]'}`}>@{instagramHandle(memberIdentity.instagram)}</p>}
                {memberIdentity.community && <p className="mt-1 truncate text-[10px] text-slate-600">{memberIdentity.community}</p>}
              </div>
            </div>
            <div className={`mx-3 grid gap-1.5 rounded-xl p-2 sm:mx-4 sm:gap-2 sm:p-3 ${isMcShare ? 'bg-violet-950' : 'bg-[#041d56]'} ${shareMetrics.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
              {shareMetrics.map((metric) => <div key={metric.label} className={`min-w-0 border-r px-1 text-center last:border-r-0 ${isMcShare ? 'border-violet-700' : 'border-[#266ca9]'}`}>
                <p className="text-xl font-black leading-none text-white sm:text-2xl">{metric.value}</p>
                <p className={`mt-1 truncate text-[8px] font-extrabold leading-tight sm:text-[9px] ${isMcShare ? 'text-violet-200' : 'text-[#ade1fb]'}`}>{metric.label}</p>
              </div>)}
            </div>
            <div className={`mx-3 mb-3 mt-3 rounded-xl px-3 py-2.5 sm:mx-4 sm:mb-4 ${isMcShare ? 'bg-violet-950' : 'bg-[#041d56]'}`}>
              <div className="flex items-start gap-2">
                <span className={`text-xl font-black leading-none ${isMcShare ? 'text-violet-300' : 'text-[#ade1fb]'}`}>“</span>
                <p className={`border-t pt-1.5 text-left text-[10px] font-medium leading-4 text-white sm:text-[11px] ${isMcShare ? 'border-violet-700' : 'border-[#266ca9]'}`}>{isMcShare ? 'Memandu cerita, menjaga tawa, dan merangkai pengalaman di setiap panggung.' : 'Jejak langkah di atas panggung adalah bukti keberanian untuk berbagi tawa dan cerita.'}</p>
              </div>
              <p className={`mt-2 text-center text-[8px] font-extrabold tracking-[0.12em] ${isMcShare ? 'text-violet-300' : 'text-[#ade1fb]'}`}>{getShareDomain()}</p>
            </div>
          </div>
          {shareFeedback && <p role="status" className={`rounded-xl p-3 text-xs font-semibold leading-5 ${isMcShare ? 'bg-violet-50 text-violet-800' : 'bg-blue-50 text-blue-800'}`}>{shareFeedback}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleDownloadSummary()} disabled={sharing} className="btn-secondary flex-1 !min-h-11 !px-3 !py-2.5 text-sm disabled:opacity-60">
              <Download className="h-4 w-4" /> Unduh Gambar
            </button>
            <button type="button" onClick={() => void handleShareSummary()} disabled={sharing} className={`flex-1 !min-h-11 !px-3 !py-2.5 text-sm disabled:opacity-60 ${isMcShare ? 'rounded-xl bg-violet-700 px-4 py-3 font-bold text-white transition hover:bg-violet-800' : 'btn-primary'}`}>
              <Share2 className="h-4 w-4" /> {sharing ? 'Menyiapkan...' : 'Bagikan'}
            </button>
          </div>
        </div>}
      </Modal>
    </div>
  );
}
