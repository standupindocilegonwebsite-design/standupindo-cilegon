import type { OpenMic } from '@/lib/types';

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function getOpenMicNumbers(openMics: OpenMic[]): Map<string, number> {
  return new Map(
    [...openMics]
      .sort((first, second) => first.date.localeCompare(second.date) || first.created_at.localeCompare(second.created_at) || first.id.localeCompare(second.id))
      .map((mic, index) => [mic.id, index + 1]),
  );
}

export function getOpenMicStatus(status: 'upcoming' | 'completed' | 'cancelled', date: string): 'upcoming' | 'completed' | 'cancelled' {
  if (status === 'cancelled' || status === 'completed') return status;
  return isUpcoming(date) ? 'upcoming' : 'completed';
}

export function getEventStatus(status: 'upcoming' | 'completed' | 'cancelled', date: string): 'upcoming' | 'completed' | 'cancelled' {
  if (status === 'cancelled' || status === 'completed') return status;
  return isUpcoming(date) ? 'upcoming' : 'completed';
}

export function formatDate(value: string): string {
  const d = new Date(value + 'T00:00:00');
  if (isNaN(d.getTime())) return value;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatPrice(value: number): string {
  if (!value || value === 0) return 'GRATIS';
  return 'Rp ' + value.toLocaleString('id-ID');
}

export function normalizeWhatsappNumber(number: string): string {
  const digits = number.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('62')) return `62${digits.slice(2).replace(/^0+/, '')}`;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

export function waLink(number: string, message?: string): string {
  const clean = normalizeWhatsappNumber(number);
  if (!clean) return '#';
  const text = `?text=${encodeURIComponent(message ?? 'Halo Admin Standupindo Cilegon, saya ingin menghubungi terkait pendaftaran Open Mic.')}`;
  return `https://wa.me/${clean}${text}`;
}

export function createOrderNumber(eventTitle: string): string {
  const words = eventTitle.toUpperCase().replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter(Boolean);
  const letters = words.join('');
  const prefix = (words.length >= 3 ? words.slice(0, 3).map((word) => word[0]).join('') : letters.slice(0, 3)).padEnd(3, 'X').slice(0, 3);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = new Uint32Array(6);
  crypto.getRandomValues(values);
  const code = Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
  return `${prefix}-${code}`;
}

export function isUpcoming(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() >= today.getTime();
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function safeExternalUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
