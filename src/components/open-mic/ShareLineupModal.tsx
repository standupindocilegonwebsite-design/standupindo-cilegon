import { useEffect, useState } from 'react';
import { Download, Mic, Share2 } from 'lucide-react';
import type { OpenMic, OpenMicRegistration } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/ui/Modal';

type SharePerformer = Pick<OpenMicRegistration, 'id' | 'komika_id' | 'stage_name' | 'instagram' | 'community'>;
type LineupPerformer = SharePerformer & { photo: string | null };
type GeneratedPage = { blob: Blob; url: string };
type CanvasLineup = { stageName: string; instagram: string; community: string; photo: HTMLImageElement | null; nameLines: string[]; height: number };

interface ShareLineupModalProps {
  open: boolean;
  onClose: () => void;
  mic: OpenMic;
  performers: SharePerformer[];
  shareText: string;
  siteLogo: string | null;
  affiliationLogo: string | null | undefined;
}

const WIDTH = 1080;
const HEIGHT = 1920;
const COMMUNITY_LOGO = '/assets/images/standup-indo-logo.png';
const AFFILIATION_LOGO = '/assets/images/image.png';
const NAME_FONT = '700 28px Arial, sans-serif';

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

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    if (!src.startsWith('/')) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number, font: string) {
  context.font = font;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let line = '';
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function drawContainedImage(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  const imageWidth = image.width * scale;
  const imageHeight = image.height * scale;
  context.drawImage(image, x + (width - imageWidth) / 2, y + (height - imageHeight) / 2, imageWidth, imageHeight);
}

function drawMicrophone(context: CanvasRenderingContext2D, x: number, y: number, size: number) {
  context.fillStyle = '#dbeafe';
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#2563eb';
  context.fillStyle = '#2563eb';
  context.lineWidth = 4;
  roundedRect(context, x + size * 0.4, y + size * 0.2, size * 0.2, size * 0.38, size * 0.1);
  context.fill();
  context.beginPath();
  context.arc(x + size / 2, y + size * 0.45, size * 0.23, 0.1, Math.PI - 0.1);
  context.stroke();
  context.beginPath();
  context.moveTo(x + size / 2, y + size * 0.68);
  context.lineTo(x + size / 2, y + size * 0.8);
  context.moveTo(x + size * 0.35, y + size * 0.8);
  context.lineTo(x + size * 0.65, y + size * 0.8);
  context.stroke();
}

function instagramHandle(value: string | null) {
  return (value ?? '')
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

function drawHeader(context: CanvasRenderingContext2D, communityLogo: HTMLImageElement | null, affiliationLogo: HTMLImageElement | null) {
  const background = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, '#eaf6ff');
  background.addColorStop(0.5, '#f8fcff');
  background.addColorStop(1, '#e6f4ff');
  context.fillStyle = background;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = '#d9ebff';
  context.beginPath();
  context.arc(0, 0, 260, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = 'rgba(255, 255, 255, 0.48)';
  context.beginPath();
  context.arc(WIDTH + 80, 420, 300, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = 'rgba(191, 224, 255, 0.34)';
  context.beginPath();
  context.arc(70, 1420, 290, 0, Math.PI * 2);
  context.fill();

  const leftAccent = context.createLinearGradient(0, 1770, 190, HEIGHT);
  leftAccent.addColorStop(0, '#60b5ff');
  leftAccent.addColorStop(1, '#1474e8');
  context.fillStyle = leftAccent;
  context.beginPath();
  context.moveTo(0, 1792);
  context.bezierCurveTo(42, 1822, 78, 1880, 172, HEIGHT);
  context.lineTo(0, HEIGHT);
  context.closePath();
  context.fill();

  const rightAccent = context.createLinearGradient(WIDTH, 1780, WIDTH - 180, HEIGHT);
  rightAccent.addColorStop(0, '#74c7ff');
  rightAccent.addColorStop(1, '#2084ed');
  context.fillStyle = rightAccent;
  context.beginPath();
  context.moveTo(WIDTH, 1782);
  context.bezierCurveTo(WIDTH - 52, 1826, WIDTH - 105, 1885, WIDTH - 184, HEIGHT);
  context.lineTo(WIDTH, HEIGHT);
  context.closePath();
  context.fill();

  context.fillStyle = '#0b2b6b';
  context.fillRect(0, 145, WIDTH, 5);

  if (communityLogo) drawContainedImage(context, communityLogo, 52, 24, 110, 110);
  context.fillStyle = '#08245c';
  context.textAlign = 'left';
  context.font = '800 28px Arial, sans-serif';
  context.fillText('STANDUPINDO', 176, 68);
  context.font = '700 25px Arial, sans-serif';
  context.fillText('CILEGON', 176, 103);
  if (affiliationLogo) drawContainedImage(context, affiliationLogo, 850, 24, 175, 110);
  else {
    context.textAlign = 'right';
    context.font = '800 21px Arial, sans-serif';
    context.fillText('STANDUPINDO PUSAT', 1026, 84);
  }
  context.textAlign = 'left';
}

function preparePerformers(context: CanvasRenderingContext2D, performers: LineupPerformer[], photos: Map<string, HTMLImageElement>) {
  return performers.map((performer) => {
    const stageName = performer.stage_name.trim() || 'Komika';
    const instagram = instagramHandle(performer.instagram);
    const community = performer.community?.trim() || '';
    const nameLines = wrapText(context, stageName, 300, NAME_FONT);
    const height = Math.max(108, 30 + nameLines.length * 30 + 48);
    return { stageName, instagram, community, photo: photos.get(performer.id) ?? null, nameLines, height };
  });
}

function paginatePerformers(performers: CanvasLineup[]) {
  const pages: CanvasLineup[][] = [];
  for (let offset = 0; offset < performers.length; offset += 20) {
    pages.push(performers.slice(offset, offset + 20));
  }
  return pages;
}

function drawEvent(context: CanvasRenderingContext2D, mic: OpenMic, poster: HTMLImageElement | null) {
  const x = 54;
  const y = 180;
  const posterWidth = 340;
  const posterHeight = 270;
  context.shadowColor = 'rgba(37, 99, 235, 0.12)';
  context.shadowBlur = 22;
  context.shadowOffsetY = 8;
  const cardGradient = context.createLinearGradient(x, y, x + 972, y + 310);
  cardGradient.addColorStop(0, '#ffffff');
  cardGradient.addColorStop(1, '#f0f8ff');
  context.fillStyle = cardGradient;
  roundedRect(context, x, y, 972, 310, 28);
  context.fill();
  context.shadowColor = 'transparent';
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
  context.strokeStyle = '#dbeafe';
  context.lineWidth = 3;
  context.stroke();

  context.save();
  roundedRect(context, x + 14, y + 14, posterWidth, posterHeight, 20);
  context.clip();
  context.fillStyle = '#eaf3ff';
  context.fillRect(x + 14, y + 14, posterWidth, posterHeight);
  if (poster) drawContainedImage(context, poster, x + 14, y + 14, posterWidth, posterHeight);
  else {
    context.fillStyle = '#1d4ed8';
    context.font = '700 24px Arial, sans-serif';
    context.textAlign = 'center';
    context.fillText('POSTER OPEN MIC', x + 14 + posterWidth / 2, y + 155, posterWidth - 24);
    context.textAlign = 'left';
  }
  context.restore();

  const infoX = 438;
  context.fillStyle = '#2563eb';
  context.font = '800 20px Arial, sans-serif';
  context.fillText('OPEN MIC', infoX, y + 48);
  const titleLines = wrapText(context, mic.title, 540, '800 44px Arial, sans-serif').slice(0, 2);
  context.fillStyle = '#08245c';
  context.font = '800 44px Arial, sans-serif';
  titleLines.forEach((line, index) => context.fillText(line, infoX, y + 96 + index * 45, 540));
  const detailsY = y + 176;
  context.fillStyle = '#334155';
  context.font = '600 25px Arial, sans-serif';
  context.fillText(formatDate(mic.date), infoX, detailsY);
  context.fillText(`${mic.time} WIB`, infoX, detailsY + 42);
  const locationLines = wrapText(context, `${mic.venue}${mic.location ? `, ${mic.location}` : ''}`, 540, '500 23px Arial, sans-serif').slice(0, 2);
  context.font = '500 23px Arial, sans-serif';
  locationLines.forEach((line, index) => context.fillText(line, infoX, detailsY + 82 + index * 30, 540));
}

function drawPerformerCard(context: CanvasRenderingContext2D, performer: CanvasLineup, number: number, x: number, y: number, width: number, height: number) {
  context.shadowColor = 'rgba(37, 99, 235, 0.1)';
  context.shadowBlur = 12;
  context.shadowOffsetY = 4;
  context.fillStyle = '#ffffff';
  roundedRect(context, x, y, width, height, 18);
  context.fill();
  context.shadowColor = 'transparent';
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
  context.strokeStyle = '#dbeafe';
  context.lineWidth = 2;
  context.stroke();

  const avatarSize = Math.min(width > 700 ? 240 : 104, Math.max(62, Math.min(height - 36, height * 0.42)));
  const avatarX = x + 24;
  const avatarY = y + (height - avatarSize) / 2;
  context.fillStyle = '#eff6ff';
  roundedRect(context, avatarX, avatarY, avatarSize, avatarSize, 18);
  context.fill();
  if (performer.photo) drawContainedImage(context, performer.photo, avatarX, avatarY, avatarSize, avatarSize);
  else drawMicrophone(context, avatarX, avatarY, avatarSize);

  const textX = x + avatarSize + 40;
  const textWidth = width - avatarSize - 136;
  let nameFontSize = Math.min(64, Math.max(24, Math.round(height * 0.1)));
  const detailFontSize = Math.min(25, Math.max(16, Math.round(height * 0.085)));
  const detailLineHeight = detailFontSize + 5;
  let nameLines: string[] = [];
  let nameLineHeight = nameFontSize + 4;
  let textHeight = 0;
  let fits = false;
  while (!fits && nameFontSize >= 16) {
    nameLineHeight = nameFontSize + 4;
    nameLines = wrapText(context, performer.stageName, textWidth, `700 ${nameFontSize}px Arial, sans-serif`);
    textHeight = nameLines.length * nameLineHeight + detailLineHeight * 2 + 12;
    fits = textHeight <= height - 16;
    if (!fits) nameFontSize -= 1;
  }
  const textTop = y + (height - textHeight) / 2;
  context.fillStyle = '#1d4ed8';
  roundedRect(context, x + width - 60, y + 12, 48, 36, 18);
  context.fill();
  context.fillStyle = '#ffffff';
  context.font = '800 18px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText(String(number).padStart(2, '0'), x + width - 36, y + 37);
  context.textAlign = 'left';
  context.fillStyle = '#08245c';
  context.font = `700 ${nameFontSize}px Arial, sans-serif`;
  nameLines.forEach((line, lineIndex) => {
    context.fillText(line, textX, textTop + nameFontSize + lineIndex * nameLineHeight, textWidth);
  });
  let detailY = textTop + nameLines.length * nameLineHeight + 12 + detailFontSize;
  context.fillStyle = '#2563eb';
  context.font = `500 ${detailFontSize}px Arial, sans-serif`;
  if (performer.instagram) {
    context.fillText(`@${performer.instagram}`, textX, detailY, textWidth);
    detailY += detailLineHeight;
  } else {
    context.fillStyle = '#64748b';
    context.fillText('Instagram tidak tersedia', textX, detailY, textWidth);
    detailY += detailLineHeight;
  }
  context.fillStyle = performer.community ? '#475569' : '#64748b';
  context.fillText(performer.community || 'Komunitas tidak dicantumkan', textX, detailY, textWidth);
}

async function createLineupImages(
  mic: OpenMic,
  performers: SharePerformer[],
  branding: { siteLogo: string | null; affiliationLogo: string | null | undefined },
): Promise<Blob[]> {
  if (performers.length === 0) throw new Error('Belum ada komika yang ditandai benar-benar tampil di Open Mic ini.');
  const memberIds = [...new Set(performers.map((performer) => performer.komika_id).filter((id): id is string => Boolean(id)))];
  let memberPhotos = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data, error } = await supabase
      .from('komika')
      .select('id, photo, instagram_url')
      .in('id', memberIds);
    if (error) throw new Error('Data foto profil komika tidak dapat dimuat.');
    memberPhotos = new Map((data ?? []).flatMap((member) => member.photo ? [[member.id, member.photo] as const] : []));
    const memberInstagram = new Map((data ?? []).map((member) => [member.id, member.instagram_url]));
    performers = performers.map((performer) => ({
      ...performer,
      instagram: performer.instagram?.trim() || (performer.komika_id ? memberInstagram.get(performer.komika_id) : null) || null,
    }));
  }

  const [communityLogo, affiliationLogo, poster] = await Promise.all([
    loadImage(branding.siteLogo || COMMUNITY_LOGO).then((image) => image ?? loadImage(COMMUNITY_LOGO)),
    loadImage(branding.affiliationLogo || AFFILIATION_LOGO).then((image) => image ?? loadImage(AFFILIATION_LOGO)),
    mic.poster ? loadImage(mic.poster) : Promise.resolve(null),
  ]);
  if (mic.poster && !poster) throw new Error('Poster Open Mic tidak dapat dimuat untuk gambar lineup.');

  const photos = new Map<string, HTMLImageElement>();
  await Promise.all(performers.map(async (performer) => {
    const photoUrl = performer.komika_id ? memberPhotos.get(performer.komika_id) : undefined;
    if (typeof photoUrl !== 'string' || !photoUrl) return;
    const image = await loadImage(photoUrl);
    if (image) photos.set(performer.id, image);
  }));

  const measureCanvas = document.createElement('canvas');
  const measureContext = measureCanvas.getContext('2d');
  if (!measureContext) throw new Error('Gambar lineup tidak dapat dibuat di perangkat ini.');
  const prepared = preparePerformers(measureContext, performers.map((performer) => ({
    ...performer,
    photo: performer.komika_id ? memberPhotos.get(performer.komika_id) ?? null : null,
  })), photos);
  const listTop = 570;
  const listBottom = 1815;
  const listHeight = listBottom - listTop;
  const pages = paginatePerformers(prepared);
  const blobs: Blob[] = [];

  let pageOffset = 0;
  for (const [pageIndex, page] of pages.entries()) {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Gambar lineup tidak dapat dibuat di perangkat ini.');
    drawHeader(context, communityLogo, affiliationLogo);
    drawEvent(context, mic, poster);

    drawMicrophone(context, 54, 500, 64);
    context.fillStyle = '#08245c';
    context.font = '800 30px Arial, sans-serif';
    context.textAlign = 'left';
    context.fillText(`LINEUP KOMIKA PERFORM · ${pageIndex + 1}/${pages.length}`, 132, 541);
    const countLabel = `TOTAL ${prepared.length} KOMIKA`;
    context.font = '800 18px Arial, sans-serif';
    const badgeWidth = Math.max(168, context.measureText(countLabel).width + 38);
    context.fillStyle = 'rgba(219, 237, 255, 0.9)';
    roundedRect(context, WIDTH - 54 - badgeWidth, 500, badgeWidth, 48, 24);
    context.fill();
    context.fillStyle = '#1d4ed8';
    context.textAlign = 'center';
    context.font = '800 17px Arial, sans-serif';
    context.fillText(countLabel, WIDTH - 54 - badgeWidth / 2, 530);
    context.textAlign = 'left';
    const underlineGradient = context.createLinearGradient(132, 0, 300, 0);
    underlineGradient.addColorStop(0, '#1474e8');
    underlineGradient.addColorStop(1, '#6bbcff');
    context.fillStyle = underlineGradient;
    roundedRect(context, 132, 552, 142, 5, 2);
    context.fill();

    const hasPagination = prepared.length > 20;
    const columns = hasPagination || prepared.length > 5 ? 2 : 1;
    const pagePerformers = columns === 1
      ? page.map((performer) => {
        const nameLines = wrapText(context, performer.stageName, 740, NAME_FONT);
        return { ...performer, nameLines, height: Math.max(108, 30 + nameLines.length * 30 + 48) };
      })
      : page;
    const leftCount = columns === 1 ? pagePerformers.length : Math.ceil(pagePerformers.length / 2);
    const rowHeights: number[] = [];
    for (let row = 0; row < leftCount; row += 1) {
      const left = pagePerformers[row];
      const right = columns === 2 ? pagePerformers[leftCount + row] : undefined;
      rowHeights.push(Math.max(left.height, right?.height ?? 0));
    }
    const rowCount = rowHeights.length;
    const standardPagedCardHeight = Math.max(108, (listHeight - 9 * 8) / 10);
    const cardHeights = hasPagination
      ? rowHeights.map(() => standardPagedCardHeight)
      : columns === 1
      ? rowHeights.map((height) => Math.max(
        height,
        page.length === 1
          ? Math.min(900, listHeight * 0.78)
          : (listHeight - (rowCount - 1) * 16) / rowCount,
      ))
      : rowHeights.map((height) => height + Math.max(
        0,
        (listHeight - rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0)) / rowCount,
      ));
    const spaceBetweenRows = hasPagination
      ? Math.max(0, (listHeight - standardPagedCardHeight * 10) / 11)
      : Math.max(0, (listHeight - cardHeights.reduce((sum, height) => sum + height, 0)) / (rowCount + 1));
    let currentY = listTop + spaceBetweenRows;
    for (let row = 0; row < rowCount; row += 1) {
      const left = pagePerformers[row];
      const right = columns === 2 ? pagePerformers[leftCount + row] : undefined;
      const rowHeight = cardHeights[row];
      if (columns === 1) {
        drawPerformerCard(context, left, pageOffset + row + 1, 54, currentY, 972, rowHeight);
      } else if (!right && !hasPagination) {
        drawPerformerCard(context, left, pageOffset + row + 1, 303, currentY, 474, rowHeight);
      } else {
        drawPerformerCard(context, left, pageOffset + row + 1, 54, currentY, 474, rowHeight);
        if (right) drawPerformerCard(context, right, pageOffset + leftCount + row + 1, 552, currentY, 474, rowHeight);
      }
      currentY += rowHeight + spaceBetweenRows;
    }
    pageOffset += page.length;

    context.fillStyle = '#1d4ed8';
    context.font = '700 20px Arial, sans-serif';
    const domain = window.location.hostname;
    const domainWidth = context.measureText(domain).width;
    const footerWidth = 24 + 12 + domainWidth;
    const footerStart = (WIDTH - footerWidth) / 2;
    context.strokeStyle = '#bfdbfe';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(56, 1890);
    context.lineTo(footerStart - 20, 1890);
    context.moveTo(footerStart + footerWidth + 20, 1890);
    context.lineTo(1024, 1890);
    context.stroke();
    context.beginPath();
    context.arc(footerStart + 10, 1890, 10, 0, Math.PI * 2);
    context.strokeStyle = '#1d4ed8';
    context.lineWidth = 2;
    context.stroke();
    context.beginPath();
    context.ellipse(footerStart + 10, 1890, 4, 10, 0, 0, Math.PI * 2);
    context.moveTo(footerStart, 1890);
    context.lineTo(footerStart + 20, 1890);
    context.stroke();
    context.fillStyle = '#334155';
    context.textAlign = 'left';
    context.fillText(domain, footerStart + 36, 1897);
    context.textAlign = 'left';
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Gambar lineup gagal dibuat.')), 'image/png');
    });
    blobs.push(blob);
  }

  return blobs;
}

function downloadPages(pages: GeneratedPage[], slug: string) {
  pages.forEach((page, index) => {
    const link = document.createElement('a');
    link.href = page.url;
    link.download = `${slug}-lineup-${String(index + 1).padStart(2, '0')}.png`;
    link.click();
  });
}

export function ShareLineupModal({ open, onClose, mic, performers, shareText, siteLogo, affiliationLogo }: ShareLineupModalProps) {
  const [pages, setPages] = useState<GeneratedPage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setPages((current) => {
        current.forEach((page) => URL.revokeObjectURL(page.url));
        return [];
      });
      setFeedback('');
      setError('');
      return;
    }

    let active = true;
    let generatedPages: GeneratedPage[] = [];
    setGenerating(true);
    setError('');
    setFeedback('');
    setPages([]);
    void createLineupImages(mic, performers, { siteLogo, affiliationLogo })
      .then((blobs) => {
        generatedPages = blobs.map((blob) => ({ blob, url: URL.createObjectURL(blob) }));
        if (active) setPages(generatedPages);
        else generatedPages.forEach((page) => URL.revokeObjectURL(page.url));
      })
      .catch((generationError: unknown) => {
        if (active) setError(generationError instanceof Error ? generationError.message : 'Gambar lineup gagal dibuat.');
      })
      .finally(() => {
        if (active) setGenerating(false);
      });
    return () => {
      active = false;
      generatedPages.forEach((page) => URL.revokeObjectURL(page.url));
    };
  }, [open, mic, performers, siteLogo, affiliationLogo]);

  function handleDownload() {
    if (pages.length === 0 || generating || sharing) return;
    downloadPages(pages, mic.slug);
    setFeedback(`Gambar lineup${pages.length > 1 ? ` (${pages.length} halaman)` : ''} berhasil diunduh.`);
  }

  async function handleShare() {
    if (pages.length === 0 || generating || sharing) return;
    const files = pages.map((page, index) => new File(
      [page.blob],
      `${mic.slug}-lineup-${String(index + 1).padStart(2, '0')}.png`,
      { type: 'image/png' },
    ));
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function' || !navigator.canShare({ files })) {
      downloadPages(pages, mic.slug);
      setFeedback('Perangkat ini belum mendukung berbagi file gambar. Gambar lineup sudah diunduh untuk dibagikan dari aplikasi pilihanmu.');
      return;
    }

    setSharing(true);
    setFeedback('');
    try {
      await navigator.share({ title: `${mic.title} — Lineup Open Mic`, text: shareText, files });
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      downloadPages(pages, mic.slug);
      setFeedback(shareError instanceof Error
        ? `Menu berbagi gagal dibuka (${shareError.message}). Gambar lineup sudah diunduh sebagai fallback.`
        : 'Menu berbagi gagal dibuka. Gambar lineup sudah diunduh sebagai fallback.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { if (!sharing) onClose(); }} title="Bagikan Ringkasan" size="md">
      <div className="space-y-4">
        {generating && <div role="status" className="rounded-xl bg-blue-50 p-4 text-center text-sm font-semibold text-blue-800">Menyiapkan gambar lineup...</div>}
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        {pages.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-700">Preview gambar lineup · {pages.length} halaman</p>
            {pages.map((page, index) => (
              <figure key={page.url} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <figcaption className="border-b border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Halaman {index + 1} dari {pages.length}</figcaption>
                <img src={page.url} alt={`Preview lineup Open Mic halaman ${index + 1}`} className="mx-auto block max-h-[55dvh] w-full object-contain" />
              </figure>
            ))}
          </div>
        )}
        {feedback && <p role="status" className="rounded-xl bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-800">{feedback}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={handleDownload} disabled={pages.length === 0 || generating || sharing} className="btn-secondary flex-1 !min-h-11 !px-3 !py-2.5 text-sm disabled:opacity-60">
            <Download className="h-4 w-4" /> Unduh Gambar
          </button>
          <button type="button" onClick={() => void handleShare()} disabled={pages.length === 0 || generating || sharing} className="btn-primary flex-1 !min-h-11 !px-3 !py-2.5 text-sm disabled:opacity-60">
            {sharing ? <Mic className="h-4 w-4 animate-pulse" /> : <Share2 className="h-4 w-4" />}
            {sharing ? 'Membagikan...' : 'Bagikan'}
          </button>
        </div>
        <button type="button" onClick={onClose} disabled={sharing} className="w-full rounded-xl px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60">Batal</button>
      </div>
    </Modal>
  );
}
