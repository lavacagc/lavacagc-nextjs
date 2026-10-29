import { test, expect } from '@playwright/test';
import type { MetadataRoute } from 'next';
// Next's own renderer for a sitemap metadata route, to prove the route handler
// writes the same bytes the old src/app/sitemap.ts produced.
import { resolveSitemap } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data';
import { buildSitemapEntries, sitemapSourcesFrom, type SitemapDb } from '../src/lib/sitemap';
import { renderSitemapXml } from '../src/lib/sitemapXml';

/**
 * The sitemap is served by the /api/sitemap route handler and reached at
 * /sitemap.xml through a rewrite (vercel/next.js#99055: a sitemap.ts metadata
 * route is a static file on Vercel that never regenerates). These pin that
 * the move changed nothing a crawler reads.
 */

type Row = Record<string, unknown>;

/**
 * A minimal in-memory stand-in for the Supabase query builder: from(), select(),
 * eq() and order() over fixed rows, awaited like the real one. eq() really
 * filters, so a row the sitemap must not list only stays out if the query asks.
 */
function fakeDb(tables: Record<string, Row[]>): SitemapDb {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return builder;
      },
      order: () => builder,
      then: <T>(resolve: (value: { data: Row[]; error: null }) => T) => resolve({ data: rows, error: null }),
    };
    return builder;
  };
  return { from } as unknown as SitemapDb;
}

const urls = (entries: MetadataRoute.Sitemap) => entries.map((entry) => entry.url);

test.describe('buildSitemapEntries (unit)', () => {
  const db = fakeDb({
    blog_posts: [
      { slug: 'slice-sitemap-published', updated_at: '2026-10-29T20:00:00Z', published: true },
      { slug: 'slice-sitemap-unpublished', updated_at: '2026-10-29T21:00:00Z', published: false },
    ],
    projects: [
      { url_slug: 'slice-sitemap-active', updated_at: '2026-10-01T00:00:00Z', active: true },
      { url_slug: 'slice-sitemap-draft', updated_at: '2026-10-02T00:00:00Z', active: false },
    ],
  });

  test('lists a published post and leaves an unpublished one out', async () => {
    const entries = await buildSitemapEntries(sitemapSourcesFrom(db));
    expect(urls(entries)).toContain('https://www.lavacagc.com/blog/slice-sitemap-published');
    expect(urls(entries)).not.toContain('https://www.lavacagc.com/blog/slice-sitemap-unpublished');
    const post = entries.find((entry) => entry.url.endsWith('/blog/slice-sitemap-published'))!;
    expect(post).toMatchObject({ changeFrequency: 'monthly', priority: 0.7 });
    expect((post.lastModified as Date).toISOString()).toBe('2026-10-29T20:00:00.000Z');
  });

  test('lists an active project and leaves a draft out', async () => {
    const entries = urls(await buildSitemapEntries(sitemapSourcesFrom(db)));
    expect(entries).toContain('https://www.lavacagc.com/projects/slice-sitemap-active');
    expect(entries).not.toContain('https://www.lavacagc.com/projects/slice-sitemap-draft');
  });

  test('a failed database read throws instead of listing nothing', async () => {
    const failing = { from: () => ({ select() { return this; }, eq() { return this; }, order() { return this; }, then: (r: (v: unknown) => unknown) => r({ data: null, error: { message: 'boom' } }) }) } as unknown as SitemapDb;
    await expect(buildSitemapEntries(sitemapSourcesFrom(failing))).rejects.toThrow(/sitemap: (blog posts|projects) read failed: boom/);
  });
});

test.describe('renderSitemapXml (unit)', () => {
  test('writes exactly what Next renders for the same entries', async () => {
    const entries = await buildSitemapEntries(sitemapSourcesFrom(fakeDb({
      blog_posts: [{ slug: 'a-post', updated_at: '2026-10-29T20:00:00Z', published: true }],
      projects: [{ url_slug: 'a-project', updated_at: '2026-10-01T00:00:00Z', active: true }],
    })));
    expect(renderSitemapXml(entries)).toBe(resolveSitemap(entries));
  });

  test('escapes XML special characters, which Next does not', () => {
    const xml = renderSitemapXml([{ url: 'https://www.lavacagc.com/a?b=1&c=2' }]);
    expect(xml).toContain('<loc>https://www.lavacagc.com/a?b=1&amp;c=2</loc>');
  });
});

test.describe('GET /api/sitemap and the /sitemap.xml rewrite', () => {
  const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  test('returns well-formed sitemap XML with the same URLs as /sitemap.xml', async ({ page, request }) => {
    const direct = await request.get('/api/sitemap');
    expect(direct.status()).toBe(200);
    expect(direct.headers()['content-type']).toContain('application/xml');
    const xml = await direct.text();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')).toBe(true);

    const parsed = await page.evaluate((text) => {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      return {
        errors: doc.getElementsByTagName('parsererror').length,
        root: doc.documentElement.localName,
        urls: doc.getElementsByTagNameNS('http://www.sitemaps.org/schemas/sitemap/0.9', 'url').length,
      };
    }, xml);
    expect(parsed).toEqual({ errors: 0, root: 'urlset', urls: locs(xml).length });
    expect(locs(xml)).toContain('https://www.lavacagc.com');
    expect(locs(xml)).toContain('https://www.lavacagc.com/home-services');

    const rewritten = await request.get('/sitemap.xml');
    expect(rewritten.status()).toBe(200);
    expect(rewritten.headers()['content-type']).toContain('application/xml');
    expect(locs(await rewritten.text())).toEqual(locs(xml));
  });

  test('a crawler user agent the bot filter would block still gets the sitemap', async ({ request }) => {
    for (const path of ['/api/sitemap', '/sitemap.xml']) {
      const res = await request.get(path, { headers: { 'user-agent': 'curl/8.0' } });
      expect(res.status(), path).toBe(200);
    }
  });
});
