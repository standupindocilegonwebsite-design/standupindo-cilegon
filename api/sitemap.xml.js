const SITE_ORIGIN = 'https://www.standupindocilegon.id';
const PAGE_SIZE = 1000;
const STATIC_PATHS = [
  '/',
  '/open-mic',
  '/event',
  '/komika',
  '/more',
  '/more/tentang',
  '/more/kerja-sama',
  '/more/kontak',
  '/more/gabung',
  '/syarat-ketentuan',
  '/kebijakan-privasi',
];

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]);
}

function publicSlug(value) {
  return typeof value === 'string' && value.length > 0 && !/[\\/\u0000-\u001f]/.test(value);
}

async function fetchPublicRows(baseUrl, apiKey, table, select, filters = {}) {
  const rows = [];
  const url = new URL(`/rest/v1/${table}`, baseUrl);
  url.search = new URLSearchParams({ select, order: 'slug.asc', limit: String(PAGE_SIZE), ...filters }).toString();

  for (let offset = 0; ; offset += PAGE_SIZE) {
    url.searchParams.set('offset', String(offset));
    const response = await fetch(url, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) throw new Error(`Public sitemap query failed for ${table} (${response.status}).`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`Public sitemap query returned an invalid response for ${table}.`);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    response.status(405).send('Method not allowed.');
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.status(503).send('Sitemap data source is not configured.');
    return;
  }

  try {
    const [openMics, events, komika, recaps] = await Promise.all([
      fetchPublicRows(supabaseUrl, anonKey, 'open_mics', 'slug', { published: 'eq.true' }),
      fetchPublicRows(supabaseUrl, anonKey, 'events', 'slug,documentation_photos', { published: 'eq.true' }),
      fetchPublicRows(supabaseUrl, anonKey, 'komika', 'slug', { published: 'eq.true', status: 'eq.active' }),
      fetchPublicRows(supabaseUrl, anonKey, 'annual_recaps', 'year,published', { published: 'eq.true', order: 'year.desc' }),
    ]);

    const paths = [
      ...STATIC_PATHS,
      ...openMics.filter((row) => publicSlug(row.slug)).map((row) => `/open-mic/${encodeURIComponent(row.slug)}`),
      ...events.filter((row) => publicSlug(row.slug)).flatMap((row) => [
        `/event/${encodeURIComponent(row.slug)}`,
        ...(Array.isArray(row.documentation_photos) && row.documentation_photos.some((photo) => typeof photo === 'string' && photo.trim())
          ? [`/event/${encodeURIComponent(row.slug)}/dokumentasi`]
          : []),
      ]),
      ...komika.filter((row) => publicSlug(row.slug)).map((row) => `/komika/${encodeURIComponent(row.slug)}`),
      ...recaps.filter((row) => Number.isInteger(Number(row.year)) && Number(row.year) >= 1900)
        .map((row) => `/recap/${Number(row.year)}`),
    ];
    const uniquePaths = [...new Set(paths)];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${uniquePaths
      .map((path) => `  <url><loc>${escapeXml(new URL(path, SITE_ORIGIN).toString())}</loc></url>`)
      .join('\n')}\n</urlset>`;

    response.setHeader('Content-Type', 'application/xml; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    response.status(200).send(request.method === 'HEAD' ? '' : xml);
  } catch (error) {
    console.error('Failed to generate public sitemap.', error);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.status(502).send('Sitemap is temporarily unavailable.');
  }
}