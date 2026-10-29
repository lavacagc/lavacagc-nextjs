import { test, expect } from '@playwright/test';
import type { MetadataRoute } from 'next';
import { renderSitemapXml } from '../src/lib/sitemapXml';
import { diffSitemap, hasDrift, parseSitemapXml, SITEMAP_GRACE_MS } from '../src/lib/sitemapWatch';

/**
 * The sitemap watcher (/api/cron/sitemap-watch) compares the served sitemap
 * with the database. These pin the comparison rules on the pure module, so a
 * rule that changes here is a deliberate change, not a quiet one.
 */

const SITE = 'https://www.lavacagc.com';
const NOW = new Date('2026-10-30T12:00:00.000Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();

const entries: MetadataRoute.Sitemap = [
  { url: SITE, lastModified: NOW, changeFrequency: 'weekly', priority: 1 },
  {
    url: `${SITE}/home-services/gutter-cleaning`,
    lastModified: NOW,
    alternates: { languages: { en: `${SITE}/home-services/gutter-cleaning`, es: `${SITE}/home-services/gutter-cleaning?lang=es` } },
  },
  { url: `${SITE}/blog/old-post`, lastModified: hoursAgo(72), changeFrequency: 'monthly', priority: 0.6 },
  { url: `${SITE}/projects/kitchen-in-summit`, lastModified: hoursAgo(240) },
];

test.describe('parseSitemapXml', () => {
  test('reads back every entry renderSitemapXml wrote, with its lastmod', () => {
    const served = parseSitemapXml(renderSitemapXml(entries));
    expect(served.map((entry) => entry.url)).toEqual(entries.map((entry) => entry.url));
    expect(served[2].lastmod).toBe(hoursAgo(72));
    expect(served[1].lastmod).toBe(NOW.toISOString());
  });

  test('unescapes XML entities in a loc and tolerates whitespace and a missing lastmod', () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url>
        <loc> ${SITE}/blog/a&amp;b </loc>
      </url>
      <url><lastmod>2026-01-01T00:00:00.000Z</lastmod></url>
      <url><loc>${SITE}/blog/c</loc><lastmod>2026-01-02T00:00:00.000Z</lastmod></url>
    </urlset>`;
    expect(parseSitemapXml(xml)).toEqual([
      { url: `${SITE}/blog/a&b`, lastmod: null },
      { url: `${SITE}/blog/c`, lastmod: '2026-01-02T00:00:00.000Z' },
    ]);
  });
});

test.describe('diffSitemap', () => {
  const servedFrom = (list: MetadataRoute.Sitemap) => parseSitemapXml(renderSitemapXml(list));

  test('an identical copy has no drift', () => {
    const drift = diffSitemap(entries, servedFrom(entries), NOW);
    expect(drift).toEqual({ missing: [], stale: [], unexpected: [], pending: [] });
    expect(hasDrift(drift)).toBe(false);
  });

  test('a clock-dated page is compared by presence only, whatever its lastmod', () => {
    const served = servedFrom(entries).map((entry) => (entry.url === SITE ? { ...entry, lastmod: hoursAgo(500) } : entry));
    expect(hasDrift(diffSitemap(entries, served, NOW))).toBe(false);
  });

  test('a post published longer ago than the grace window and still unlisted is missing', () => {
    const post = { url: `${SITE}/blog/new-post`, lastModified: hoursAgo(3) };
    const drift = diffSitemap([...entries, post], servedFrom(entries), NOW);
    expect(drift.missing).toEqual([post.url]);
    expect(drift.pending).toEqual([]);
    expect(hasDrift(drift)).toBe(true);
  });

  test('a post published inside the grace window is pending, not drift', () => {
    const post = { url: `${SITE}/blog/just-now`, lastModified: hoursAgo(1) };
    const drift = diffSitemap([...entries, post], servedFrom(entries), NOW);
    expect(drift.pending).toEqual([post.url]);
    expect(drift.missing).toEqual([]);
    expect(hasDrift(drift)).toBe(false);
  });

  test('the grace window is the ISR window twice over', () => {
    expect(SITEMAP_GRACE_MS).toBe(2 * 3600 * 1000);
  });

  test('a row updated after the served lastmod is stale once the grace window has passed', () => {
    const updated = entries.map((entry) => (entry.url === `${SITE}/blog/old-post` ? { ...entry, lastModified: hoursAgo(5) } : entry));
    const drift = diffSitemap(updated, servedFrom(entries), NOW);
    expect(drift.stale).toEqual([{ url: `${SITE}/blog/old-post`, served: hoursAgo(72), expected: hoursAgo(5) }]);
    expect(hasDrift(drift)).toBe(true);
  });

  test('a row updated inside the grace window is pending', () => {
    const updated = entries.map((entry) => (entry.url === `${SITE}/blog/old-post` ? { ...entry, lastModified: hoursAgo(0.5) } : entry));
    const drift = diffSitemap(updated, servedFrom(entries), NOW);
    expect(drift.stale).toEqual([]);
    expect(drift.pending).toEqual([`${SITE}/blog/old-post`]);
  });

  test('a lastmod within one second of the row is not stale (microseconds vs milliseconds)', () => {
    const served = servedFrom(entries).map((entry) =>
      entry.url === `${SITE}/projects/kitchen-in-summit` ? { ...entry, lastmod: new Date(Date.parse(hoursAgo(240)) - 900).toISOString() } : entry,
    );
    expect(hasDrift(diffSitemap(entries, served, NOW))).toBe(false);
  });

  test('a served post that is no longer expected is unexpected', () => {
    const stillListed = [...entries, { url: `${SITE}/blog/unpublished`, lastModified: hoursAgo(100) }];
    const drift = diffSitemap(entries, servedFrom(stillListed), NOW);
    expect(drift.unexpected).toEqual([`${SITE}/blog/unpublished`]);
    expect(hasDrift(drift)).toBe(true);
  });

  test('a served post with no lastmod at all is stale, not ignored', () => {
    const served = servedFrom(entries).map((entry) => (entry.url === `${SITE}/blog/old-post` ? { ...entry, lastmod: null } : entry));
    const drift = diffSitemap(entries, served, NOW);
    expect(drift.stale).toEqual([{ url: `${SITE}/blog/old-post`, served: null, expected: hoursAgo(72) }]);
  });
});
