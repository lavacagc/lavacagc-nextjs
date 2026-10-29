/**
 * GET /api/cron/sitemap-watch - read the public sitemap back, daily, and tell
 * the owner when it no longer matches the database.
 *
 * Why: between Next.js 16.2 and 2026-10-29 every publish "refreshed" the
 * sitemap and none of them did (vercel/next.js#99055); the served file was the
 * one from the last deploy, and nothing read it back to notice. This route is
 * the reader. It fetches /sitemap.xml the way a crawler does (through the CDN,
 * never in-process, because the served copy is the thing under test; on the
 * deployment's own host rather than www, because Cloudflare challenges a
 * function's egress, see sitemapWatchUrl), rebuilds the expected entries from the database
 * (posts and projects read uncached; the active home-service slugs through
 * the catalog's tagged cache, the same one the sitemap uses, which
 * invalidateCatalog expires on every save), and reports the difference
 * (src/lib/sitemapWatch.ts). A post published two hours ago that is still not
 * listed, a row updated but served with the old lastmod, or an unpublished
 * post still listed is drift; a change younger than the grace window is
 * reported as pending and not alarmed.
 *
 * It also asks GitHub whether the upstream fix (vercel/next.js#99056) has
 * merged, so the day it does the owner hears that the route-handler
 * workaround can be retired (docs/sitemap.md). That message is sent only
 * while the merge is less than UPSTREAM_ALERT_WINDOW_MS old (one daily run
 * plus cron jitter), so it is sent once, in the run after the merge; the JSON
 * answer carries upstream.merged on every run. GITHUB_TOKEN, when set, is sent
 * so the call is not held to the unauthenticated rate limit.
 *
 * Telegram goes out on drift, on an unreadable sitemap (503, a Cloudflare
 * challenge, a network error) and on an unreadable database. A healthy day
 * is silent. The JSON answer carries everything either way, and the status
 * is 503 whenever the check did not pass, so a failed cron shows in the
 * Vercel cron log.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCatalogStrict } from '@/lib/home-services/catalogData';
import { escapeTelegram, sendTelegramMessage, type TelegramOutcome } from '@/lib/notify/telegramMessage';
import { buildSitemapEntries, getStaticSupabaseClient, SITE_URL, sitemapSourcesFrom } from '@/lib/sitemap';
import { diffSitemap, hasDrift, parseSitemapXml, SITEMAP_GRACE_MS, sitemapWatchUrl, type ServedEntry, type SitemapDrift } from '@/lib/sitemapWatch';

export const dynamic = 'force-dynamic';

/** The public address, for the owner's messages; the fetch goes to sitemapWatchUrl (see there). */
export const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;
const UPSTREAM_PR_API = 'https://api.github.com/repos/vercel/next.js/pulls/99056';
const UPSTREAM_PR_URL = 'https://github.com/vercel/next.js/pull/99056';
/** How long after the upstream merge the daily run announces it: one run plus cron jitter. */
export const UPSTREAM_ALERT_WINDOW_MS = 26 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = 'LaVacaGC-SitemapWatch/1.0';

type ServedCopy =
  | { outcome: 'ok'; status: number; age: number | null; cache: string | null; entries: ServedEntry[] }
  | { outcome: 'unavailable'; status: number; age: number | null; cache: string | null; retryAfter: string | null }
  | { outcome: 'blocked'; status: number; detail: string }
  | { outcome: 'error'; detail: string };

async function fetchServedCopy(url: string): Promise<ServedCopy> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml' },
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    return { outcome: 'error', detail: err instanceof Error ? err.message : String(err) };
  }
  const age = res.headers.get('age');
  const cache = res.headers.get('x-vercel-cache');
  const body = await res.text().catch(() => '');
  if (res.status === 503) {
    return { outcome: 'unavailable', status: res.status, age: age ? Number(age) : null, cache, retryAfter: res.headers.get('retry-after') };
  }
  // Cloudflare's managed challenge answers 403 with an HTML interstitial; an
  // edge rule could do the same with another status. Either way the watcher
  // cannot see the sitemap, which is its own alert, not drift.
  if (!res.ok || !body.includes('<urlset')) {
    const detail = body.includes('Just a moment') ? 'Cloudflare challenge page' : `HTTP ${res.status}, ${res.headers.get('content-type') ?? 'no content type'}`;
    return { outcome: 'blocked', status: res.status, detail };
  }
  return { outcome: 'ok', status: res.status, age: age ? Number(age) : null, cache, entries: parseSitemapXml(body) };
}

type Upstream = { checked: true; merged: boolean; mergedAt: string | null; state: string } | { checked: false; detail: string };

async function checkUpstreamFix(): Promise<Upstream> {
  const token = process.env.GITHUB_TOKEN;
  try {
    const res = await fetch(UPSTREAM_PR_API, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { checked: false, detail: `GitHub answered ${res.status}` };
    const pr = (await res.json()) as { merged?: boolean; merged_at?: string | null; state?: string };
    return { checked: true, merged: pr.merged === true, mergedAt: pr.merged_at ?? null, state: pr.state ?? 'unknown' };
  } catch (err) {
    return { checked: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

const list = (urls: string[], max = 5) => {
  const shown = urls.slice(0, max).map((url) => url.replace(SITE_URL, ''));
  const more = urls.length > max ? ` and ${urls.length - max} more` : '';
  return `${shown.join(', ')}${more}`;
};

function driftMessage(drift: SitemapDrift, served: Extract<ServedCopy, { outcome: 'ok' }>): string {
  const lines = ['⚠️ <b>Sitemap drift</b> (daily check)'];
  if (drift.missing.length) lines.push(`Published but not listed: ${drift.missing.length} (${escapeTelegram(list(drift.missing))})`);
  if (drift.stale.length) {
    const first = drift.stale[0];
    lines.push(`Old lastmod: ${drift.stale.length} (${escapeTelegram(first.url.replace(SITE_URL, ''))} served ${escapeTelegram(first.served ?? 'none')}, row ${escapeTelegram(first.expected)})`);
  }
  if (drift.unexpected.length) lines.push(`Listed but not published: ${drift.unexpected.length} (${escapeTelegram(list(drift.unexpected))})`);
  lines.push(`Served copy: x-vercel-cache ${escapeTelegram(served.cache ?? 'none')}, age ${served.age ?? 'none'} s, ${served.entries.length} URLs`);
  lines.push(`Open: ${SITEMAP_URL}`);
  return lines.join('\n');
}

function upstreamMergedRecently(upstream: Upstream, now: Date): boolean {
  if (!upstream.checked || !upstream.merged || !upstream.mergedAt) return false;
  const mergedMs = Date.parse(upstream.mergedAt);
  return Number.isFinite(mergedMs) && now.getTime() - mergedMs < UPSTREAM_ALERT_WINDOW_MS;
}

export async function GET(request: NextRequest) {
  // CRON_SECRET is enforced by middleware; this is a defense-in-depth check.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfiguration: CRON_SECRET not set' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const source = sitemapWatchUrl(process.env);
  const [served, upstream] = await Promise.all([fetchServedCopy(source.url), checkUpstreamFix()]);

  const messages: string[] = [];
  if (upstreamMergedRecently(upstream, now) && upstream.checked) {
    messages.push(
      `ℹ️ <b>Next.js sitemap fix merged</b> (${escapeTelegram(upstream.mergedAt ?? '')}).\nWhen a release ships it, move the sitemap back to src/app/sitemap.ts: docs/sitemap.md.\n${UPSTREAM_PR_URL}`,
    );
  }

  let status: 'ok' | 'drift' | 'sitemap_unavailable' | 'sitemap_unreadable' | 'database_unreadable' = 'ok';
  let drift: SitemapDrift | null = null;
  let expectedCount: number | null = null;
  let detail: string | undefined;

  if (served.outcome === 'ok') {
    try {
      const db = getStaticSupabaseClient();
      const slugs = (await getCatalogStrict()).map((service) => service.slug);
      const expected = await buildSitemapEntries(sitemapSourcesFrom(db, slugs));
      expectedCount = expected.length;
      drift = diffSitemap(expected, served.entries, now, SITEMAP_GRACE_MS);
      if (hasDrift(drift)) {
        status = 'drift';
        messages.push(driftMessage(drift, served));
      }
    } catch (err) {
      status = 'database_unreadable';
      detail = err instanceof Error ? err.message : String(err);
      console.error('sitemap-watch: could not build the expected sitemap:', detail);
      messages.push(`⚠️ <b>Sitemap watcher could not read the database</b>\n${escapeTelegram(detail)}`);
    }
  } else if (served.outcome === 'unavailable') {
    status = 'sitemap_unavailable';
    detail = `503 from ${SITEMAP_URL}, Retry-After ${served.retryAfter ?? 'none'}`;
    messages.push(`⚠️ <b>Sitemap is answering 503</b>\nRetry-After ${escapeTelegram(served.retryAfter ?? 'none')} s. Crawlers keep their last copy; the database read behind /api/sitemap is failing.\n${SITEMAP_URL}`);
  } else {
    status = 'sitemap_unreadable';
    detail = served.detail;
    messages.push(`⚠️ <b>Sitemap watcher cannot read the sitemap</b>\n${escapeTelegram(served.detail)}\n${SITEMAP_URL}`);
  }

  let telegram: TelegramOutcome | 'not_needed' = 'not_needed';
  if (messages.length) {
    telegram = await sendTelegramMessage(messages.join('\n\n'));
  }

  const body = {
    status,
    checkedAt: now.toISOString(),
    sitemap: SITEMAP_URL,
    fetched: source,
    served:
      served.outcome === 'ok'
        ? { outcome: served.outcome, status: served.status, age: served.age, cache: served.cache, count: served.entries.length }
        : served,
    expected: expectedCount === null ? null : { count: expectedCount, graceMs: SITEMAP_GRACE_MS },
    drift,
    upstream: { pr: UPSTREAM_PR_URL, ...upstream },
    telegram,
    ...(detail ? { detail } : {}),
  };
  return NextResponse.json(body, { status: status === 'ok' ? 200 : 503 });
}
