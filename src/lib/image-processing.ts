export const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024;

export type ImageProcessingProfile =
  | 'avatar'
  | 'poster'
  | 'payment-proof'
  | 'history-proof'
  | 'qris'
  | 'documentation'
  | 'logo';

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const PROFILE_OPTIONS: Record<ImageProcessingProfile, { maxDimension: number; quality: number; type: string }> = {
  avatar: { maxDimension: 960, quality: 0.86, type: 'image/webp' },
  poster: { maxDimension: 1920, quality: 0.84, type: 'image/webp' },
  'payment-proof': { maxDimension: 3000, quality: 0.96, type: 'image/jpeg' },
  'history-proof': { maxDimension: 3000, quality: 0.96, type: 'image/jpeg' },
  qris: { maxDimension: Number.POSITIVE_INFINITY, quality: 1, type: 'image/png' },
  documentation: { maxDimension: 1600, quality: 0.8, type: 'image/webp' },
  logo: { maxDimension: 1200, quality: 0.86, type: 'image/webp' },
};

class ImageProcessingFallbackError extends Error {}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function isRecoverableImageProcessingError(error: unknown): boolean {
  if (error instanceof ImageProcessingFallbackError) return true;
  if (typeof error !== 'object' || error === null || !('name' in error)) return false;
  return ['EncodingError', 'InvalidStateError', 'NotSupportedError', 'OperationError', 'QuotaExceededError']
    .includes(String(error.name));
}

export function validateImageFile(file: File): string | null {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) return 'Format file tidak didukung. Gunakan JPG, PNG, atau WEBP.';
  if (file.size > MAX_IMAGE_FILE_SIZE) return 'Ukuran file maksimal 5 MB.';
  return null;
}

export function getImageFileExtension(type: string): string {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

async function loadImage(source: Blob): Promise<{ image: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(source);
    return { image: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
  }

  const objectUrl = URL.createObjectURL(source);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new ImageProcessingFallbackError('Gambar tidak dapat dibaca untuk diproses.'));
      element.src = objectUrl;
    });
    return { image, width: image.naturalWidth, height: image.naturalHeight, cleanup: () => URL.revokeObjectURL(objectUrl) };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export async function processImageForUpload(
  original: File,
  profile: ImageProcessingProfile,
  source: Blob = original,
): Promise<Blob> {
  const validationError = validateImageFile(original);
  if (validationError) throw new Error(validationError);

  const options = PROFILE_OPTIONS[profile];
  let loaded: Awaited<ReturnType<typeof loadImage>> | null = null;
  try {
    loaded = await loadImage(source);
    const scale = Math.min(options.maxDimension / loaded.width, options.maxDimension / loaded.height, 1);
    const width = Math.max(1, Math.round(loaded.width * scale));
    const height = Math.max(1, Math.round(loaded.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new ImageProcessingFallbackError('Browser tidak dapat memproses gambar ini.');

    if (profile !== 'logo') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(loaded.image, 0, 0, width, height);
    const processed = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new ImageProcessingFallbackError('Kompresi gambar gagal.')),
        options.type,
        options.quality,
      );
    });

    return processed.size < original.size ? processed : original;
  } catch (error) {
    if (isAbortError(error) || !isRecoverableImageProcessingError(error)) throw error;
    return original;
  } finally {
    loaded?.cleanup();
  }
}
