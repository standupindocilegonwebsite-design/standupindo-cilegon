const SITE_NAME = 'Standupindo Cilegon';
const DEFAULT_IMAGE = '/assets/images/Logo%20Standupindo%20Cilegon%20Biru.png';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

export default async function handler(request, response) {
  const slugValue = request.query?.slug;
  const slug = Array.isArray(slugValue) ? slugValue[0] : slugValue;
  if (typeof slug !== 'string' || !slug) {
    response.status(400).send('Slug Komika tidak valid.');
    return;
  }

  const protocol = String(request.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = request.headers['x-forwarded-host'] || request.headers.host || 'standupindocilegon.com';
  const origin = `${protocol}://${host}`;
  const canonicalUrl = new URL(`/komika/${encodeURIComponent(slug)}`, origin).toString();
  let profile = null;

  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) {
    try {
      const query = new URLSearchParams({
        select: 'stage_name,photo,bio',
        slug: `eq.${slug}`,
        published: 'eq.true',
        status: 'eq.active',
        limit: '1',
      });
      const result = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/komika?${query}`, {
        headers: {
          apikey: process.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
          Accept: 'application/json',
        },
      });
      if (!result.ok) throw new Error(`Supabase returned ${result.status}`);
      const profiles = await result.json();
      profile = Array.isArray(profiles) ? profiles[0] ?? null : null;
    } catch (error) {
      console.error('Failed to load Komika share preview.', error);
    }
  }

  const stageName = profile?.stage_name || 'Komika';
  let imageUrl = new URL(DEFAULT_IMAGE, origin).toString();
  if (profile?.photo) {
    try {
      imageUrl = new URL(profile.photo, origin).toString();
    } catch (error) {
      console.error('Invalid Komika photo URL for share preview.', error);
    }
  }
  const description = String(profile?.bio || `Kenali ${stageName}, komika dari ${SITE_NAME}.`).replace(/\s+/g, ' ').slice(0, 300);
  const title = `${stageName} — ${SITE_NAME}`;

  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  response.status(200).send(`<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
    <meta property="og:type" content="profile">
    <meta property="og:site_name" content="${SITE_NAME}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    <meta property="og:image" content="${escapeHtml(imageUrl)}">
    <meta property="og:image:alt" content="Foto ${escapeHtml(stageName)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  </head>
  <body><a href="${escapeHtml(canonicalUrl)}">Lihat profil ${escapeHtml(stageName)}</a></body>
</html>`);
}