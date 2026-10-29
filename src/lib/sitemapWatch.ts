/**
 * The sitemap watcher's pure half: read the sitemap the public is served and
 * compare it with the entries the database says it should hold.
 *
 * Why it exists: for weeks /sitemap.xml served a build-time file while every
 * publish believed it had refreshed it (vercel/next.js#99055). Nothing in the
 * pipeline read the sitemap back, so nothing noticed. The watcher
 * (/api/cron/sitemap-watch) reads it back every day the way a crawler does
 * and reports the difference; this module is the comparison, kept free of
 * fetch and Telegram so a spec can pin every rule.
 *
 * Only blog and project entries carry a date from a database row, so only
 * they are compared by lastmod; every other entry is dated by the clock at
 * generation time and is compared by presence alone.
 *
 * The grace window below covers only those row-dated entries. Presence-only
 * entries (home services) and unexpected entries (an unpublished post, a
 * deactivated project, a switched-off service) get none on purpose: every
 * writer that changes what the sitemap lists (a catalog save, an unpublish, a
 * project deactivation) expires SITEMAP_TAG and revalidates SITEMAP_PATHS on
 * the spot, so the served copy is refreshed on demand and a difference the
 * daily run still sees is real.
 */
import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/sitemap'

export type ServedEntry = { url: string; lastmod: string | null }

const XML_UNESCAPES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }

export function xmlUnescape(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (entity) => XML_UNESCAPES[entity])
}

/** The <url> entries of a sitemap, in document order; a <url> without <loc> is skipped. */
export function parseSitemapXml(xml: string): ServedEntry[] {
  const entries: ServedEntry[] = []
  const urlBlock = /<url>([\s\S]*?)<\/url>/g
  let block: RegExpExecArray | null
  while ((block = urlBlock.exec(xml))) {
    const loc = /<loc>([\s\S]*?)<\/loc>/.exec(block[1])
    if (!loc) continue
    const lastmod = /<lastmod>([\s\S]*?)<\/lastmod>/.exec(block[1])
    entries.push({ url: xmlUnescape(loc[1].trim()), lastmod: lastmod ? xmlUnescape(lastmod[1].trim()) : null })
  }
  return entries
}

/** An entry whose lastmod is a database row's updated_at, not the generation clock. */
export function isRowDated(url: string): boolean {
  return url.startsWith(`${SITE_URL}/blog/`) || url.startsWith(`${SITE_URL}/projects/`)
}

export type StaleEntry = { url: string; served: string | null; expected: string }

export interface SitemapDrift {
  /** Expected, absent from the served copy, and old enough that it should be there. */
  missing: string[]
  /** Served with a lastmod older than the row's updated_at, past the grace window. */
  stale: StaleEntry[]
  /** Served but no longer expected: an unpublished post or a deactivated project still listed. */
  unexpected: string[]
  /** Changes newer than the grace window: not counted yet, reported so a reader can see them. */
  pending: string[]
}

/**
 * How long a change may take to show in the served copy before it counts as
 * drift: the route's ISR window (3600 s) plus the same again, so a regeneration
 * that lands at the end of the window and a crawler cache in front of it are
 * both inside it.
 */
export const SITEMAP_GRACE_MS = 2 * 60 * 60 * 1000

/**
 * Where the watcher reads the sitemap from.
 *
 * Not the public host: a fetch from a Vercel function to www.lavacagc.com is
 * answered by Cloudflare's managed challenge (proven on a preview on
 * 2026-10-29: 403, "Just a moment"), the same interception telegramLead.ts
 * warns about. The deployment's own vercel.app host sits behind Cloudflare,
 * and /sitemap.xml is outside the middleware matcher there, so it is served by
 * the same route handler from the same ISR cache that the public host reads;
 * the bug this watcher exists for (a static file no publish regenerates) shows
 * on both hosts alike. What it does not cover is the Cloudflare hop itself and
 * the www edge cache entry; docs/sitemap.md says how to check those by hand.
 *
 * SITEMAP_WATCH_HOST wins when set (a host name, no scheme), then Vercel's
 * VERCEL_PROJECT_PRODUCTION_URL, then the public site as a last resort for a
 * run off Vercel.
 */
export function sitemapWatchUrl(env: Record<string, string | undefined>): { url: string; via: 'override' | 'vercel' | 'public' } {
  const override = env.SITEMAP_WATCH_HOST?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  if (override) return { url: `https://${override}/sitemap.xml`, via: 'override' }
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  if (vercel) return { url: `https://${vercel}/sitemap.xml`, via: 'vercel' }
  return { url: `${SITE_URL}/sitemap.xml`, via: 'public' }
}

const toMs = (value: string | Date | undefined | null): number | null => {
  if (!value) return null
  const ms = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

export function diffSitemap(
  expected: MetadataRoute.Sitemap,
  served: ServedEntry[],
  now: Date,
  graceMs: number = SITEMAP_GRACE_MS,
): SitemapDrift {
  const drift: SitemapDrift = { missing: [], stale: [], unexpected: [], pending: [] }
  const servedByUrl = new Map(served.map((entry) => [entry.url, entry]))
  const expectedUrls = new Set(expected.map((entry) => entry.url))
  const settledBefore = now.getTime() - graceMs

  for (const entry of expected) {
    const expectedMs = isRowDated(entry.url) ? toMs(entry.lastModified) : null
    // A row changed inside the grace window is still allowed to be on its way.
    const inGrace = expectedMs !== null && expectedMs > settledBefore
    const live = servedByUrl.get(entry.url)
    if (!live) {
      if (inGrace) drift.pending.push(entry.url)
      else drift.missing.push(entry.url)
      continue
    }
    if (expectedMs === null) continue
    const servedMs = toMs(live.lastmod)
    // One second of slack: Postgres keeps microseconds, the sitemap keeps milliseconds.
    if (servedMs !== null && servedMs >= expectedMs - 1000) continue
    if (inGrace) drift.pending.push(entry.url)
    else drift.stale.push({ url: entry.url, served: live.lastmod, expected: new Date(expectedMs).toISOString() })
  }

  for (const entry of served) {
    if (!expectedUrls.has(entry.url)) drift.unexpected.push(entry.url)
  }

  return drift
}

export function hasDrift(drift: SitemapDrift): boolean {
  return drift.missing.length > 0 || drift.stale.length > 0 || drift.unexpected.length > 0
}
