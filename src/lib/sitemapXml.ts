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
