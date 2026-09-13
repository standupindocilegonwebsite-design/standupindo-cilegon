import type { TicketOrderStatus } from '@/lib/types';
import { formatPrice, normalizeWhatsappNumber } from '@/lib/format';

export interface TicketOrderMessageData {
  order_number: string | null;
  full_name: string;
  email: string | null;
  whatsapp: string;
  ticket_category: string;
  quantity: number;
  total_price: number;
  notes: string | null;
  status: TicketOrderStatus;
}

function details(order: TicketOrderMessageData): string {
  return [
    '*DETAIL PESANAN*',
    '━━━━━━━━━━━━━━',
    `*Nomor Pesanan:* ${order.order_number || '-'}`,
    `*Tiket:* ${order.ticket_category}`,
    `*Jumlah:* ${order.quantity} Tiket`,
    `*Total:* *${formatPrice(order.total_price)}*`,
  ].filter(Boolean).join('\n');
}

export function generateTicketOrderWhatsAppMessage(order: TicketOrderMessageData, eventTitle: string, status: TicketOrderStatus = order.status): string {
  const event = `*${eventTitle}*`;
  const name = `*${order.full_name}*`;

  switch (status) {
    case 'Menunggu Pembayaran':
      return [
        `Halo ${name} 👋`,
        '',
        `Terima kasih sudah melakukan pemesanan tiket untuk ${event}.`,
        '',
        'Pesanan kamu saat ini masih *Menunggu Pembayaran*.',
        '',
        details(order),
        '',
        'Silakan melakukan pembayaran sesuai metode pembayaran yang telah diberikan oleh Admin.',
        '',
        'Jika sudah melakukan pembayaran, silakan konfirmasi kepada Admin.',
        '',
        'Terima kasih 🙏',
      ].join('\n');
    case 'Sudah Bayar':
      return [
        `Halo ${name} 👋`,
        '',
        `Pembayaran untuk tiket ${event} sudah kami terima.`,
        '',
        'Saat ini pesanan kamu sedang dalam proses *verifikasi pembayaran* oleh Admin.',
        '',
        details(order),
        '',
        'Mohon menunggu proses verifikasi.',
        '',
        'Kami akan menginformasikan kembali setelah pembayaran terverifikasi.',
        '',
        'Terima kasih 🙏',
      ].join('\n');
    case 'Terverifikasi':
      return [
        `Halo ${name} 👋`,
        '',
        `Pembelian tiket ${event} kamu sudah *terverifikasi* ✅`,
        '',
        'Tiket kamu telah dikonfirmasi dan tercatat sebagai peserta acara.',
        '',
        details(order),
        '',
        'Simpan tiket / QR Code kamu dan tunjukkan saat melakukan check-in di lokasi acara.',
        '',
        'Sampai bertemu di acara! 🎉',
        '',
        'Terima kasih sudah melakukan pembelian 🙏',
      ].join('\n');
    case 'Selesai':
      return [
        `Halo ${name} 👋`,
        '',
        `Terima kasih sudah hadir di ${event}! 🎉`,
        '',
        'Pesanan tiket kamu telah *selesai* dan tercatat sebagai tiket yang sudah digunakan.',
        '',
        'Semoga acaranya menyenangkan dan sampai bertemu di event berikutnya! ❤️',
        '',
        'Terima kasih sudah menjadi bagian dari acara kami 🙏',
      ].join('\n');
    case 'Dibatalkan':
      return [
        `Halo ${name} 👋`,
        '',
        `Mohon maaf, pesanan tiket untuk ${event} telah *dibatalkan*.`,
        '',
        details(order),
        '',
        'Jika pembatalan ini terjadi karena kesalahan atau kamu membutuhkan informasi lebih lanjut, silakan hubungi Admin.',
        '',
        'Terima kasih 🙏',
      ].join('\n');
    default:
      return '';
  }
}

export function generateTicketOrderWhatsAppUrl(number: string, order: TicketOrderMessageData, eventTitle: string, status: TicketOrderStatus = order.status): string {
  const normalized = normalizeWhatsappNumber(number);
  if (!normalized) return '#';
  const message = generateTicketOrderWhatsAppMessage(order, eventTitle, status);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function generateTicketPurchaseWhatsAppMessage(order: TicketOrderMessageData, eventTitle: string): string {
  const notes = order.notes?.trim() || '-';
  return [
    'Halo Admin 👋',
    '',
    'Saya ingin melakukan pemesanan tiket',
    `*${eventTitle}*`,
    '',
    '*DETAIL PESANAN*',
    '━━━━━━━━━━━━━━',
    `*Nomor Pesanan:* ${order.order_number || '-'}`,
    `*Nama:* ${order.full_name}`,
    `*Email:* ${order.email || '-'}`,
    `*WhatsApp:* ${order.whatsapp}`,
    `*Tiket:* ${order.ticket_category}`,
    `*Jumlah:* ${order.quantity} Tiket`,
    `*Total:* *${formatPrice(order.total_price)}*`,
    '',
    '*Catatan:*',
    notes,
    '',
    'Mohon informasi metode pembayarannya.',
    '',
    'Terima kasih 🙏',
  ].join('\n');
}
