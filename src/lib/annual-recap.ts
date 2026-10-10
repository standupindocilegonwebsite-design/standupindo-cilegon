export type AnnualRecapRecord = {
  id?: string;
  year: number;
  published: boolean;
  closing_narrative: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export const DEFAULT_RECAP_CLOSING = [
  'Terima kasih sudah menjadi bagian dari perjalanan Standupindo Cilegon.',
  'Setiap panggung menjadi bagian dari cerita kita.',
  'Sampai bertemu di panggung berikutnya.',
].join(' ');

export function getRecapYears(currentYear = new Date().getFullYear()): number[] {
  return Array.from({ length: 5 }, (_, index) => currentYear - index);
}
