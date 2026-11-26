export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { loadPublicSitemapRows, publicBlogPath, sitemapTimestamp, SITE_URL } from '../../lib/sitemapData';

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Article-only inventory for the discovery auditor. Eligible rows and their
// canonical paths come from the same producer as /sitemap.xml.
function urlEntry(row) {
  const path = publicBlogPath(row);
  if (!path) return '';
  const lastModified = sitemapTimestamp(row.updated_at, row.published_at);
  return `<url><loc>${escapeXml(`${SITE_URL}${path}`)}</loc>${
    lastModified ? `<lastmod>${lastModified.toISOString()}</lastmod>` : ''
  }</url>`;
}

export async function GET() {
  try {
    const rows = await loadPublicSitemapRows();
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${(rows.blogs || []).map(urlEntry).join('')}</urlset>`;
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    // Never expose the database error or cache an empty fallback.
    return new Response('Sitemap temporarily unavailable', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': '30',
      },
    });
  }
}
