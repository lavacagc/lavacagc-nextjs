/**
 * Sitemap entries to XML, in the exact shape Next.js renders a
 * MetadataRoute.Sitemap metadata route (urlset, xhtml:link alternates, then
 * lastmod, changefreq, priority), so serving the sitemap from a route handler
 * changes nothing a crawler reads. One addition: text is XML-escaped, which
 * Next does not do; none of today's URLs contain a character that needs it.
 *
 * Image and video entries are not rendered because no entry uses them; one
 * added later throws here rather than being dropped from the sitemap silently.
 */
import type { MetadataRoute } from 'next'

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }

export function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch])
}

export function renderSitemapXml(entries: MetadataRoute.Sitemap): string {
  const hasAlternates = entries.some((entry) => Object.keys(entry.alternates?.languages ?? {}).length > 0)
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
  xml += hasAlternates ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' : '>\n'
  for (const entry of entries) {
    if (entry.images?.length || entry.videos?.length) {
      throw new Error(`sitemap: ${entry.url} has images or videos, which renderSitemapXml does not render yet`)
    }
    xml += '<url>\n'
    xml += `<loc>${xmlEscape(entry.url)}</loc>\n`
    for (const [language, href] of Object.entries(entry.alternates?.languages ?? {})) {
      if (!href) continue
      xml += `<xhtml:link rel="alternate" hreflang="${xmlEscape(language)}" href="${xmlEscape(href)}" />\n`
    }
    if (entry.lastModified) {
      const lastmod = entry.lastModified instanceof Date ? entry.lastModified.toISOString() : entry.lastModified
      xml += `<lastmod>${xmlEscape(lastmod)}</lastmod>\n`
    }
    if (entry.changeFrequency) xml += `<changefreq>${entry.changeFrequency}</changefreq>\n`
    if (typeof entry.priority === 'number') xml += `<priority>${entry.priority}</priority>\n`
    xml += '</url>\n'
  }
  xml += '</urlset>\n'
  return xml
}

/**
 * How long a crawler should wait before asking again after a 503. Search
 * engines treat 503 as temporary and keep the sitemap they already have; an
 * empty or partial sitemap would instead tell them pages were removed.
 */
export const SITEMAP_RETRY_AFTER_SECONDS = 300

/**
 * The /api/sitemap response for entries built by `build`. A failed build
 * (a database read threw, see buildSitemapEntries) is answered 503 with
 * Retry-After and no-store, never with a partial sitemap.
 */
export async function sitemapResponse(build: () => Promise<MetadataRoute.Sitemap>): Promise<Response> {
  let entries: MetadataRoute.Sitemap
  try {
    entries = await build()
  } catch (err) {
    console.error('sitemap: answering 503, no sitemap could be built:', err instanceof Error ? err.message : String(err))
    return new Response('Sitemap temporarily unavailable\n', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Retry-After': String(SITEMAP_RETRY_AFTER_SECONDS),
        'Cache-Control': 'no-store',
      },
    })
  }
  return new Response(renderSitemapXml(entries), {
    headers: { 'Content-Type': 'application/xml' },
  })
}
