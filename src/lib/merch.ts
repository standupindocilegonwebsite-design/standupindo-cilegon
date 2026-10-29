export const MERCH_STORAGE_BUCKET = 'standupindo-merch';
export const MERCH_DESCRIPTION_MAX_LENGTH = 120;

export interface PublicMerchConfig {
  imageUrl: string;
  title: string;
  description: string;
  shopUrl: string;
}

export function getPublicMerchConfig(settings: {
  merch_banner_enabled?: boolean;
  merch_banner_image_url?: string | null;
  merch_banner_title?: string;
  merch_banner_description?: string;
  merch_shop_url?: string;
}): PublicMerchConfig | null {
  if (!settings.merch_banner_enabled) return null;

  const imageUrl = settings.merch_banner_image_url?.trim() ?? '';
  const title = settings.merch_banner_title?.trim() ?? '';
  const rawDescription = settings.merch_banner_description ?? '';
  const description = rawDescription.trim();
  const shopUrl = getMerchShopUrl(settings.merch_shop_url);

  if (!imageUrl || !title || !description || rawDescription.length > MERCH_DESCRIPTION_MAX_LENGTH || !shopUrl) return null;
  return { imageUrl, title, description, shopUrl };
}

export function getMerchShopUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function getMerchBannerSignature(config: {
  imageUrl: string;
  title: string;
  description: string;
  shopUrl: string;
}): string {
  return JSON.stringify([config.imageUrl, config.title, config.description, config.shopUrl]);
}
