export const MATERIAL_DURATION_OPTIONS = Array.from({ length: 60 }, (_, index) => index + 1);

export function parseEstimatedDuration(value: string) {
  const normalized = value.trim();
  if (!normalized || !/^\d+$/.test(normalized)) return null;
  const duration = Number(normalized);
  return Number.isSafeInteger(duration) && duration > 0 ? duration : null;
}

export function isEstimatedDurationInputValid(value: string) {
  return value.trim() === '' || parseEstimatedDuration(value) !== null;
}

export function formatEstimatedDuration(duration: number | null | undefined, abbreviated = false) {
  if (duration == null) return 'Durasi belum ditentukan';
  return `±${duration} ${abbreviated ? 'mnt' : 'menit'}`;
}

export function formatSetlistDuration(materials: Array<{ estimated_duration?: number | null }>) {
  const total = materials.reduce((sum, material) => sum + (material.estimated_duration ?? 0), 0);
  const unknownCount = materials.filter((material) => material.estimated_duration == null).length;
  if (unknownCount === 0) return `±${total} menit`;
  if (total === 0) return `Durasi belum ditentukan (${unknownCount} materi)`;
  return `±${total} menit · ${unknownCount} belum ditentukan`;
}
