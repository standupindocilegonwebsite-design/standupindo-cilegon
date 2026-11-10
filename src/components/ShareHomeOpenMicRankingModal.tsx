import { useEffect, useState } from 'react';
import { Download, Mic, Share2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useSiteSettings } from '@/lib/useSiteSettings';

type RankingCategory = 'member' | 'non-member';
type RankingShareEntry = {
  stageName: string;
  community: string | null;
  appearances: number;
  instagram?: string | null;
};
type GeneratedImage = { blob: Blob; url: string };

interface ShareHomeOpenMicRankingModalProps {
  open: boolean;
  onClose: () => void;
  rankings: Record<RankingCategory, RankingShareEntry[]>;
  year: number;
}

const IMAGE_WIDTH = 1080;
const IMAGE_HEIGHT = 1920;

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

function loadLogo(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function getInstagramHandle(value: string | null | undefined) {
  const raw = value?.trim() ?? '';
  if (!raw) return null;
  let username = raw.replace(/^@/, '');

  if (/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i.test(raw)) {
    try {
      const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
      if (!['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase())) return null;
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length !== 1 || url.search || url.hash) return null;
      username = decodeURIComponent(segments[0]).replace(/^@/, '');
    } catch {
      return null;
    }
  }

  return /^(?!.*\.\.)[a-z0-9_](?:[a-z0-9._]{0,28}[a-z0-9_])?$/i.test(username)
    ? `@${username}`
    : null;
}

function drawRankBadge(context: CanvasRenderingContext2D, rank: number, x: number, y: number) {
  if (rank <= 2 || rank >= 4) {
    const medalColor = rank === 1 ? '#f5bd32' : rank === 2 ? '#aabbd0' : '#bd8058';
    const ribbonColor = rank === 1 ? '#d97706' : rank === 2 ? '#64748b' : '#8a4b2d';
    context.fillStyle = ribbonColor;
    context.beginPath();
    context.moveTo(x - 15, y - 11);
    context.lineTo(x - 5, y + 9);
    context.lineTo(x - 17, y + 5);
    context.lineTo(x - 24, y + 14);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(x + 15, y - 11);
    context.lineTo(x + 5, y + 9);
    context.lineTo(x + 17, y + 5);
    context.lineTo(x + 24, y + 14);
    context.closePath();
    context.fill();
    context.fillStyle = medalColor;
    context.beginPath();
    context.arc(x, y - 3, 25, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#fff1c2';
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.font = '800 25px Arial, sans-serif';
    context.fillText(String(rank), x, y + 5);
    return;
  }

  context.fillStyle = '#8bc5ef';
  context.beginPath();
  context.arc(x, y, 25, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#eaf7ff';
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = '#0b2f58';
  context.textAlign = 'center';
  context.font = '800 25px Arial, sans-serif';
  context.fillText(String(rank), x, y + 9);
}

function drawRankingSection(
  context: CanvasRenderingContext2D,
  title: string,
  entries: RankingShareEntry[],
  y: number,
) {
  const x = 56;
  const width = IMAGE_WIDTH - x * 2;
  const sectionHeight = 690;
  roundedRect(context, x, y, width, sectionHeight, 28);
  context.fillStyle = '#062647';
  context.fill();
  context.strokeStyle = '#f6d184';
  context.lineWidth = 6;
  context.stroke();

  context.strokeStyle = '#39a9e8';
  context.lineWidth = 2;
  roundedRect(context, x + 10, y + 10, width - 20, sectionHeight - 20, 20);
  context.stroke();

  const headerX = x + 190;
  const headerY = y - 26;
  const headerWidth = width - 380;
  const headerGradient = context.createLinearGradient(headerX, headerY, headerX + headerWidth, headerY + 68);
  headerGradient.addColorStop(0, '#f2c46a');
  headerGradient.addColorStop(0.5, '#fff0bd');
  headerGradient.addColorStop(1, '#d69b3a');
  roundedRect(context, headerX, headerY, headerWidth, 68, 32);
  context.fillStyle = headerGradient;
  context.fill();
  context.strokeStyle = '#082947';
  context.lineWidth = 4;
  context.stroke();
  context.fillStyle = '#092b4d';
  context.font = '900 35px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText(title, IMAGE_WIDTH / 2, headerY + 45, headerWidth - 36);

  const rowTop = y + 68;
  const rowHeight = 108;
  const rowGap = 8;
  for (let index = 0; index < 5; index += 1) {
    const entry = entries[index];
    const rowY = rowTop + index * (rowHeight + rowGap);
    roundedRect(context, x + 25, rowY, width - 50, rowHeight, 17);
    const rowGradient = context.createLinearGradient(x, rowY, x + width, rowY + rowHeight);
    rowGradient.addColorStop(0, '#eaf6ff');
    rowGradient.addColorStop(1, '#cfe9f8');
    context.fillStyle = rowGradient;
    context.fill();
    context.strokeStyle = '#48a4d5';
    context.lineWidth = 2;
    context.stroke();

    drawRankBadge(context, index + 1, x + 62, rowY + rowHeight / 2);

    if (entry) {
      const textX = x + 112;
      const rightTextX = x + width - 34;
      context.textAlign = 'left';
      context.fillStyle = '#0f172a';
      context.font = '800 29px Arial, sans-serif';
      context.fillText(entry.stageName, textX, rowY + 33, width - 360);
      context.fillStyle = '#183653';
      context.font = '600 19px Arial, sans-serif';
      context.fillText(entry.community?.trim() || 'Komunitas tidak dicantumkan', textX, rowY + 57, width - 360);
      const instagramHandle = getInstagramHandle(entry.instagram);
      if (instagramHandle) {
        context.fillStyle = '#155e9a';
        context.font = '700 18px Arial, sans-serif';
        context.fillText(instagramHandle, textX, rowY + 82, width - 360);
      }
      context.textAlign = 'right';
      context.fillStyle = '#082b52';
      context.font = '900 36px Arial, sans-serif';
      context.fillText(`${entry.appearances}x`, rightTextX, rowY + 53);
      context.fillStyle = '#254867';
      context.font = '800 20px Arial, sans-serif';
      context.fillText('TAMPIL', rightTextX, rowY + 82);
    } else {
      context.textAlign = 'left';
      context.fillStyle = '#183653';
      context.font = '600 24px Arial, sans-serif';
      context.fillText('Belum ada data ranking', x + 112, rowY + 60);
    }
  }
}

async function createRankingImage(rankings: Record<RankingCategory, RankingShareEntry[]>, year: number, siteUrl: string, logoUrl: string) {
  const canvas = document.createElement('canvas');
  canvas.width = IMAGE_WIDTH;
  canvas.height = IMAGE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Gambar ringkasan tidak dapat dibuat di perangkat ini.');

  const gradient = context.createLinearGradient(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);
  gradient.addColorStop(0, '#172554');
  gradient.addColorStop(0.48, '#0b1f44');
  gradient.addColorStop(1, '#06142f');
  context.fillStyle = gradient;
  context.fillRect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);
  context.strokeStyle = 'rgba(139, 207, 240, 0.13)';
  context.lineWidth = 2;
  for (let x = -500; x < IMAGE_WIDTH + 500; x += 180) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + IMAGE_HEIGHT * 0.62, IMAGE_HEIGHT);
    context.stroke();
  }
  const glow = context.createRadialGradient(IMAGE_WIDTH / 2, 740, 120, IMAGE_WIDTH / 2, 740, 900);
  glow.addColorStop(0, 'rgba(37, 99, 235, 0.2)');
  glow.addColorStop(1, 'rgba(5, 28, 54, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);

  const logo = await loadLogo(logoUrl);
  if (logo) {
    const logoPadding = 12;
    const maxLogoSize = 124;
    const scale = Math.min(maxLogoSize / logo.width, maxLogoSize / logo.height);
    const logoWidth = logo.width * scale;
    const logoHeight = logo.height * scale;
    const cardWidth = logoWidth + logoPadding * 2;
    const cardHeight = logoHeight + logoPadding * 2;
    const cardX = (IMAGE_WIDTH - cardWidth) / 2;
    const cardY = 10;
    context.save();
    context.shadowColor = 'rgba(0, 0, 0, 0.3)';
    context.shadowBlur = 18;
    roundedRect(context, cardX, cardY, cardWidth, cardHeight, 20);
    context.fillStyle = '#f8fafc';
    context.fill();
    context.strokeStyle = '#f3c86f';
    context.lineWidth = 4;
    context.stroke();
    context.restore();
    context.save();
    context.shadowColor = 'rgba(0, 0, 0, 0.28)';
    context.shadowBlur = 20;
    context.drawImage(logo, cardX + logoPadding, cardY + logoPadding, logoWidth, logoHeight);
    context.restore();
  }

  context.textAlign = 'center';
  context.lineJoin = 'round';
  context.strokeStyle = '#061a2b';
  context.lineWidth = 12;
  context.font = '900 62px Arial, sans-serif';
  context.strokeText('KOMIKA TERAJIN', IMAGE_WIDTH / 2, 232, IMAGE_WIDTH - 70);
  context.fillStyle = '#f3f8ff';
  context.fillText('KOMIKA TERAJIN', IMAGE_WIDTH / 2, 232, IMAGE_WIDTH - 70);
  context.strokeStyle = '#351f0c';
  context.lineWidth = 13;
  context.font = '900 76px Arial, sans-serif';
  context.strokeText('OPEN MIC', IMAGE_WIDTH / 2, 306, IMAGE_WIDTH - 80);
  const titleGradient = context.createLinearGradient(0, 232, 0, 310);
  titleGradient.addColorStop(0, '#fff1b3');
  titleGradient.addColorStop(1, '#e9a83b');
  context.fillStyle = titleGradient;
  context.fillText('OPEN MIC', IMAGE_WIDTH / 2, 306, IMAGE_WIDTH - 80);
  context.fillStyle = '#f5f8fc';
  context.font = '700 27px Arial, sans-serif';
  context.fillText(`RINGKASAN RANKING TAHUN ${year}`, IMAGE_WIDTH / 2, 350);

  drawRankingSection(context, 'KOMIKA MEMBER', rankings.member, 390);
  drawRankingSection(context, 'KOMIKA LAINNYA', rankings['non-member'], 1110);
  context.fillStyle = '#d7eafb';
  context.textAlign = 'center';
  context.font = '700 23px Arial, sans-serif';
  context.fillText('BERDASARKAN KEHADIRAN OPEN MIC YANG TERCATAT', IMAGE_WIDTH / 2, 1855);
  context.fillStyle = '#ffffff';
  context.font = '700 22px Arial, sans-serif';
  context.fillText(siteUrl, IMAGE_WIDTH / 2, 1890);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Gambar ringkasan gagal dibuat.')), 'image/png');
  });
}

export function ShareHomeOpenMicRankingModal({ open, onClose, rankings, year }: ShareHomeOpenMicRankingModalProps) {
  const { settings } = useSiteSettings();
  const [image, setImage] = useState<GeneratedImage | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setImage((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return null;
      });
      setFeedback('');
      setError('');
      return;
    }

    let active = true;
    let generatedImage: GeneratedImage | null = null;
    setGenerating(true);
    setError('');
    setFeedback('');
    setImage(null);
    void createRankingImage(rankings, year, window.location.origin, settings.logo_url ?? '/assets/images/Logo%20Standupindo%20Cilegon%20Biru.png')
      .then((blob) => {
        generatedImage = { blob, url: URL.createObjectURL(blob) };
        if (active) setImage(generatedImage);
        else URL.revokeObjectURL(generatedImage.url);
      })
      .catch((generationError: unknown) => {
        if (active) setError(generationError instanceof Error ? generationError.message : 'Gambar ringkasan gagal dibuat.');
      })
      .finally(() => {
        if (active) setGenerating(false);
      });

    return () => {
      active = false;
      if (generatedImage) URL.revokeObjectURL(generatedImage.url);
    };
  }, [open, rankings, settings.logo_url, year]);

  function handleDownload() {
    if (!image || generating) return;
    const link = document.createElement('a');
    link.href = image.url;
    link.download = `ranking-komika-terajin-open-mic-${year}.png`;
    link.click();
    setFeedback('Gambar ringkasan berhasil diunduh.');
  }

  async function handleShare() {
    if (!image || generating || sharing) return;
    const file = new File([image.blob], `ranking-komika-terajin-open-mic-${year}.png`, { type: 'image/png' });
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function' || !navigator.canShare({ files: [file] })) {
      handleDownload();
      setFeedback('Perangkat ini belum mendukung berbagi gambar. Gambar sudah diunduh untuk dibagikan dari aplikasi pilihanmu.');
      return;
    }

    setSharing(true);
    setFeedback('');
    try {
      await navigator.share({
        title: `Komika Terajin Open Mic ${year} — Standupindo Cilegon`,
        text: `Ringkasan ranking 5 Komika Member dan 5 Komika Lainnya berdasarkan kehadiran Open Mic yang tercatat.\n${window.location.origin}/`,
        files: [file],
      });
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      console.error('Gagal membagikan gambar ranking Open Mic.', shareError);
      handleDownload();
      setFeedback('Menu berbagi gagal dibuka. Gambar ringkasan sudah diunduh sebagai fallback.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { if (!sharing) onClose(); }} title="Bagikan Ringkasan" size="md">
      <div className="space-y-4">
        {generating && <div role="status" className="rounded-xl bg-blue-50 p-4 text-center text-sm font-semibold text-blue-800">Menyiapkan gambar ringkasan ranking...</div>}
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        {image && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-700">Preview gambar · Top 5 Member dan Top 5 Komika Lainnya</p>
            <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <img src={image.url} alt={`Preview ranking Komika Terajin Open Mic tahun ${year}`} className="mx-auto block max-h-[55dvh] w-full object-contain" />
            </figure>
          </div>
        )}
        {feedback && <p role="status" className="rounded-xl bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-800">{feedback}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={handleDownload} disabled={!image || generating || sharing} className="btn-secondary flex-1 !min-h-11 !px-3 !py-2.5 text-sm disabled:opacity-60">
            <Download className="h-4 w-4" /> Unduh Gambar
          </button>
          <button type="button" onClick={() => void handleShare()} disabled={!image || generating || sharing} className="btn-primary flex-1 !min-h-11 !px-3 !py-2.5 text-sm disabled:opacity-60">
            {sharing ? <Mic className="h-4 w-4 animate-pulse" /> : <Share2 className="h-4 w-4" />}
            {sharing ? 'Membagikan...' : 'Bagikan'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
