const SITE_ORIGIN = 'https://www.standupindocilegon.id';
const DEFAULT_IMAGE = '/assets/images/Logo%20Standupindo%20Cilegon%20Biru.png';

type PageMetadata = {
  path: string;
  title: string;
  description: string;
  image?: string | null;
};

function setMeta(attribute: 'name' | 'property', key: string, value: string) {
  let element = document.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = value;
}

export function seoDescription(value: string | null | undefined, fallback: string): string {
  const plainText = (value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!??\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`#>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const description = plainText || fallback;
  if (description.length <= 160) return description;
  const shortened = description.slice(0, 157);
  const lastSpace = shortened.lastIndexOf(' ');
  return `${shortened.slice(0, lastSpace > 100 ? lastSpace : 157).trimEnd()}...`;
}

export function setPageMetadata({ path, title, description, image }: PageMetadata) {
  const canonicalPath = path.startsWith('/') ? path : '/';
  const canonicalUrl = new URL(canonicalPath, SITE_ORIGIN).toString();
  const imageUrl = new URL(image || DEFAULT_IMAGE, SITE_ORIGIN).toString();
  document.title = title;

  setMeta('name', 'description', description);
  let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = canonicalUrl;

  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:site_name', 'Standupindo Cilegon');
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', canonicalUrl);
  setMeta('property', 'og:image', imageUrl);
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
  setMeta('name', 'twitter:image', imageUrl);
}

export function clearPageMetadata() {
  document.querySelector('link[rel="canonical"]')?.remove();
  document.querySelector('meta[name="description"]')?.remove();
  document.querySelector('meta[property="og:title"]')?.remove();
  document.querySelector('meta[property="og:description"]')?.remove();
  document.querySelector('meta[property="og:url"]')?.remove();
  document.querySelector('meta[name="twitter:title"]')?.remove();
  document.querySelector('meta[name="twitter:description"]')?.remove();
}