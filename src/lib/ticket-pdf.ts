import type { jsPDF as JsPdfDocument } from 'jspdf';
import { formatDate, formatPrice } from '@/lib/format';
import { LOGO_URL } from '@/lib/types';

export interface ETicketEvent {
  title: string;
  date: string;
  time: string;
  venue: string;
  location?: string | null;
  poster: string | null;
  event_rules?: string | null;
}

export interface ETicketOrder {
  id: string;
  order_number: string | null;
  full_name: string;
  ticket_category: string;
  quantity: number;
  unit_price: number;
}

export interface ETicketInstance {
  id: string;
  sequence_no: number;
  qr_token: string | null;
}

function parseEventTime(time: string): { start: string; end: string } {
  const parts = time.split(/\s*(?:-|–|—|sampai|hingga)\s*/i).filter(Boolean);
  return { start: parts[0] ?? time, end: parts[1] ?? '—' };
}

function getRules(value?: string | null): string[] {
  const rules = value?.split(/\r?\n|(?<=[.!?])\s+(?=\d+[.)]\s)/)
    .map((rule) => rule.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
  if (rules?.length) return rules;
  return [
    'Tiket hanya berlaku untuk event yang tercantum.',
    'QR Code wajib ditunjukkan saat check-in.',
    '1 QR Code hanya dapat digunakan satu kali.',
    'Jangan membagikan QR Code kepada orang lain.',
    'Tiket yang sudah digunakan tidak dapat digunakan kembali.',
    'Refund/reschedule mengikuti kebijakan penyelenggara.',
  ];
}

async function loadPosterData(url: string): Promise<{ data: string; width: number; height: number }> {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error('Poster Event gagal dimuat. Periksa koneksi lalu coba lagi.');
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Poster Event tidak dapat diproses di browser ini.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    return { data: canvas.toDataURL('image/jpeg', 0.92), width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

async function loadLogoData(): Promise<{ data: string; width: number; height: number }> {
  const image = new Image();
  image.src = LOGO_URL;
  try {
    await image.decode();
  } catch {
    throw new Error('Logo Standupindo Cilegon gagal dimuat.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Logo Standupindo Cilegon tidak dapat diproses di browser ini.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  return { data: canvas.toDataURL('image/jpeg', 0.92), width: image.naturalWidth, height: image.naturalHeight };
}

function fitWithin(width: number, height: number, maxWidth: number, maxHeight: number) {
  const ratio = Math.min(maxWidth / width, maxHeight / height);
  return { width: width * ratio, height: height * ratio };
}

function addLabel(doc: JsPdfDocument, label: string, value: string, x: number, y: number, width: number, valueSize = 9) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(valueSize);
  doc.setTextColor(15, 23, 42);
  const lines = doc.splitTextToSize(value || '—', width);
  doc.text(lines.slice(0, 2), x, y + 4.2);
}

export async function createETicketPdfDocument({
  event,
  order,
  tickets,
  qrCanvases,
}: {
  event: ETicketEvent;
  order: ETicketOrder;
  tickets: ETicketInstance[];
  qrCanvases: Map<string, HTMLCanvasElement>;
}) {
  if (tickets.length === 0) throw new Error('Tiket individual belum tersedia untuk order ini.');
  if (tickets.some((ticket) => !ticket.qr_token || !qrCanvases.has(ticket.id))) {
    throw new Error('QR tiket belum siap. Buka detail tiket, lalu coba unduh kembali.');
  }

  const poster = event.poster?.trim() ? await loadPosterData(event.poster.trim()) : null;
  const logo = await loadLogoData();
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [148, 225], compress: true });
  const pageWidth = 148;
  const margin = 10;
  const right = pageWidth - margin;
  const orderNumber = order.order_number || order.id;
  const eventTime = parseEventTime(event.time);
  const venue = [event.venue, event.location].map((part) => part?.trim()).filter((part, index, parts) => part && parts.indexOf(part) === index).join(', ');
  const rules = getRules(event.event_rules);

  tickets.forEach((ticket, index) => {
    if (index > 0) doc.addPage([148, 225], 'portrait');
    doc.setFillColor(29, 78, 216);
    doc.rect(0, 0, pageWidth, 2, 'F');
    const logoSize = fitWithin(logo.width, logo.height, 7, 7);
    doc.addImage(logo.data, 'JPEG', margin + (7 - logoSize.width) / 2, 4 + (7 - logoSize.height) / 2, logoSize.width, logoSize.height, undefined, 'FAST');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const brandTextX = margin + 9;
    doc.setTextColor(15, 23, 42);
    doc.text('STANDUPINDO', brandTextX, 10);
    doc.setTextColor(29, 78, 216);
    doc.text('CILEGON', brandTextX + doc.getTextWidth('STANDUPINDO '), 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('E-TICKET RESMI', right, 10, { align: 'right' });

    if (poster) {
      const size = fitWithin(poster.width, poster.height, 48, 60);
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(margin, 16, 50, 62, 2, 2, 'F');
      doc.addImage(poster.data, 'JPEG', margin + (50 - size.width) / 2, 16 + (62 - size.height) / 2, size.width, size.height, undefined, 'FAST');
    } else {
      doc.setFillColor(239, 246, 255);
      doc.roundedRect(margin, 16, 50, 62, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(29, 78, 216);
      doc.text('POSTER EVENT', margin + 25, 48, { align: 'center' });
    }

    const infoX = 66;
    const infoWidth = right - infoX;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(29, 78, 216);
    doc.text('EVENT', infoX, 20);
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    const titleLines = doc.splitTextToSize(event.title, infoWidth).slice(0, 3);
    doc.text(titleLines, infoX, 27);
    let infoY = 29 + (titleLines.length - 1) * 5.3;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const venueLines = doc.splitTextToSize(venue || 'Lokasi belum tersedia', infoWidth).slice(0, 2);
    doc.text(venueLines, infoX, infoY + 4);
    infoY += 11 + (venueLines.length - 1) * 3.8;
    doc.setDrawColor(226, 232, 240);
    doc.line(infoX, infoY, right, infoY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('TANGGAL', infoX, infoY + 6);
    doc.text('MULAI', infoX, infoY + 18);
    doc.text('SELESAI', infoX + 36, infoY + 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(formatDate(event.date), infoX, infoY + 10.5);
    doc.text(eventTime.start, infoX, infoY + 22.5);
    doc.text(eventTime.end, infoX + 36, infoY + 22.5);

    doc.setDrawColor(203, 213, 225);
    doc.line(margin, 84, right, 84);
    addLabel(doc, 'Nama Pembeli', order.full_name, margin, 92, 78);
    addLabel(doc, 'Tipe / Kategori Tiket', order.ticket_category, margin, 108, 78);
    addLabel(doc, 'Harga Tiket', formatPrice(order.unit_price), margin, 124, 78);
    addLabel(doc, 'Nomor Order', orderNumber, margin, 140, 78, 8);
    addLabel(doc, 'ID Tiket', ticket.id, margin, 156, 78, 7.5);

    const qrCanvas = qrCanvases.get(ticket.id);
    if (!qrCanvas) throw new Error(`QR untuk tiket ${ticket.sequence_no} tidak tersedia.`);
    const qrSize = 42;
    const qrX = right - qrSize;
    const qrY = 96;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4, 2, 2, 'FD');
    doc.addImage(qrCanvas.toDataURL('image/png'), 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'FAST');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('TUNJUKKAN QR SAAT CHECK-IN', qrX + qrSize / 2, qrY + qrSize + 5, { align: 'center' });

    doc.setFillColor(239, 246, 255);
    doc.roundedRect(margin, 168, right - margin, 11, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(29, 78, 216);
    doc.text(`TIKET ${ticket.sequence_no}`, pageWidth / 2, 175.2, { align: 'center' });

    doc.setDrawColor(203, 213, 225);
    doc.line(margin, 183, right, 183);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text('SYARAT & KETENTUAN', margin, 189);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(rules.length > 7 ? 6.3 : 6.8);
    doc.setTextColor(71, 85, 105);
    let ruleY = 194;
    const lineHeight = 3.25;
    let shown = 0;
    for (const [ruleIndex, rule] of rules.entries()) {
      const lines = doc.splitTextToSize(`${ruleIndex + 1}. ${rule}`, right - margin * 2);
      for (const line of lines) {
        if (ruleY > 215) break;
        doc.text(line, margin, ruleY);
        ruleY += lineHeight;
        shown += 1;
      }
      if (ruleY > 215) break;
    }
    if (shown === 0) {
      doc.text('Ikuti ketentuan yang berlaku dari penyelenggara.', margin, 194);
    }
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, 218, right, 218);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    doc.text('STANDUPINDO CILEGON', pageWidth / 2, 222, { align: 'center' });
  });

  return doc;
}

export async function downloadETicketPdf(input: Parameters<typeof createETicketPdfDocument>[0]) {
  const doc = await createETicketPdfDocument(input);
  const fileOrder = (input.order.order_number || input.order.id).replace(/[^A-Za-z0-9_-]/g, '-');
  doc.save(`E-Tiket-${fileOrder}.pdf`);
  return { pages: doc.getNumberOfPages() };
}

function sanitizeFilenamePart(value: string) {
  return value.trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    || 'Tiket';
}

export async function createETicketPdfFile(input: Parameters<typeof createETicketPdfDocument>[0]) {
  const doc = await createETicketPdfDocument(input);
  const fileName = `E-Tiket-${sanitizeFilenamePart(input.event.title)}-${sanitizeFilenamePart(input.order.full_name)}.pdf`;
  return new File([doc.output('blob')], fileName, { type: 'application/pdf' });
}
