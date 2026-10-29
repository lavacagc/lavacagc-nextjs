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
 * SITEMAP_TAG and revalidates '/api/sitemap'.
 *
 * A failed database read throws inside the tagged caches in src/lib/sitemap.ts,
 * so an hourly regeneration still gets the last good rows from them and keeps
 * the last good sitemap. Only when no cached copy is left (a writer expired the
 * tag while the database was down) does the build fail, and then the answer is
 * 503 with Retry-After (sitemapResponse), never a sitemap without posts.
 */
import { unstable_cache } from 'next/cache'
import { buildSitemapEntries } from '@/lib/sitemap'
import { sitemapResponse } from '@/lib/sitemapXml'

export const revalidate = 3600

/**
 * Seconds Next keeps a 503 as this route's ISR copy. Without this the 503
 * would be stored for the full hour and served (x-nextjs-cache HIT) long after
 * the database came back.
 */
const UNAVAILABLE_REVALIDATE_SECONDS = 60

// A route's ISR window is the shortest one any cache it read asked for, so
// reading this one shortens the window for the response being generated.
const shortenIsrWindow = unstable_cache(async () => true, ['sitemap-unavailable'], {
  revalidate: UNAVAILABLE_REVALIDATE_SECONDS,
})

export async function GET(): Promise<Response> {
  const response = await sitemapResponse(() => buildSitemapEntries())
  if (response.status === 503) await shortenIsrWindow()
  return response
}
