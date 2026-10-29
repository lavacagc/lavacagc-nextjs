/**
 * GET /api/sitemap - the public sitemap, reached at /sitemap.xml through a
 * rewrite in next.config.ts. robots.txt and Search Console keep using
 * /sitemap.xml; this path is an implementation detail.
 *
 * Why a route handler and not src/app/sitemap.ts: since Next.js 16.2 the
 * Vercel adapter emits a metadata route like sitemap.ts as a STATIC FILE, so
 * its `revalidate`, its tagged data cache and revalidatePath('/sitemap.xml')
 * never regenerate it. In production (2026-10-29) a newly published article
 * reached /blog within seconds while /sitemap.xml kept serving the build-time
 * file (x-vercel-cache HIT, age growing) until the next deploy. Upstream:
 * https://github.com/vercel/next.js/issues/99055 (fix in PR #99056, not yet
 * released). A route handler whose path does not end in sitemap.xml is an
 * ordinary ISR function, so the hourly window and on-demand revalidation work.
 *
 * Once a Next.js release ships that fix, move this back to src/app/sitemap.ts
 * (export default buildSitemapEntries, export const revalidate = 3600), then
 * drop this route, the rewrite, SITEMAP_ROUTE in the revalidation path lists
 * and the middleware exclusion, and confirm on a Vercel preview that a publish
 * shows in /sitemap.xml on the next request.
 *
 * ISR: no request APIs are read, so the response is prerendered and
 * regenerated at least hourly; every blog and project writer also expires
 * SITEMAP_TAG and revalidates '/api/sitemap'. A failed database read throws, so
 * Next keeps serving the last good sitemap instead of one without posts.
 */
import { buildSitemapEntries } from '@/lib/sitemap'
import { renderSitemapXml } from '@/lib/sitemapXml'

export const revalidate = 3600

export async function GET(): Promise<Response> {
  const xml = renderSitemapXml(await buildSitemapEntries())
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  })
}
