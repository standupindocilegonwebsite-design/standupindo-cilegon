const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

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
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits.startsWith('62') ? digits : digits;
}

export function waLink(number: string, message?: string): string {
  const clean = normalizeWhatsappNumber(number);
  if (!clean) return '#';
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${clean}${text}`;
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
