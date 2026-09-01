import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { cityPathsFromSitemapXml } from '../scripts/lib/sitemap-city-paths.ts';

/**
 * AC5-AC8: `npm run audit:prod` must stop reporting a 404 for a page we never
 * published.
 *
 * The audit hardcoded `/locations/fairfield`. That slug is in no database row,
 * no sitemap entry, `src/data/locationData.ts`, or any link on the site - so
 * production answered 404 correctly on every run, and the audit called it a
 * failure. The list now comes from the sitemap, which is what we ask search
 * engines to crawl, so a URL in it that 404s is a real defect and a town that
 * leaves the sitemap stops being audited on the next run.
 */

const SITEMAP_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.lavacagc.com/</loc></url>
  <url><loc>https://www.lavacagc.com/locations/montclair</loc></url>
  <url><loc>https://www.lavacagc.com/locations/alpine</loc></url>
  <url><loc>https://www.lavacagc.com/locations/alpine</loc></url>
  <url><loc>https://www.lavacagc.com/locations/alpine/services</loc></url>
  <url><loc>https://www.lavacagc.com/locations/alpine/services/kitchen-remodeling</loc></url>
  <url><loc>https://www.lavacagc.com/services/kitchen-remodeling</loc></url>
  <url><loc>https://www.lavacagc.com/locations</loc></url>
</urlset>`;

test.describe('site audit path derivation', () => {
  test('AC5: only single-segment city pages are taken, deduped and sorted', () => {
    expect(cityPathsFromSitemapXml(SITEMAP_FIXTURE)).toEqual([
      '/locations/alpine',
      '/locations/montclair',
    ]);
  });

  test('AC6: a sitemap with no city pages yields nothing, so the caller can fail loudly', () => {
    // The audit throws on this rather than sweeping a shorter list, because a
    // run that silently covers fewer pages reads exactly like a clean one.
    expect(cityPathsFromSitemapXml('<urlset></urlset>')).toEqual([]);
    expect(
      cityPathsFromSitemapXml(
        '<urlset><url><loc>https://www.lavacagc.com/about</loc></url></urlset>'
      )
    ).toEqual([]);
  });

  test('AC7: the audit no longer pins any /locations path of its own', () => {
    // The defect itself: a copy of the town list living in the audit script,
    // drifting away from the site. If one comes back, this fails.
    // Comments are stripped first, on purpose: the script explains at length
    // WHY '/locations/fairfield' must never be pinned there again, and an
    // assertion that forbids saying so would delete the reason with the defect.
    const code = readFileSync(path.join(process.cwd(), 'scripts', 'site-audit.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Whole-line comments only. Deliberately NOT anything after a `//`
      // anywhere on a line - that pattern also eats every line holding an
      // https:// URL, which is where a re-pinned path would most likely hide.
      .replace(/^\s*\/\/.*$/gm, '');

    const hardcoded = code.match(/'\/locations\/[^']*'/g) ?? [];
    expect(hardcoded, 'audit must derive /locations/* from the sitemap').toEqual([]);
    expect(code, 'no town names in audit code').not.toContain('fairfield');
  });

  test('AC8: every city page the sitemap publishes actually answers 200', async ({ request }) => {
    // The invariant the audit now leans on. It is also the check that would
    // have caught the original defect from the other side: if fairfield were
    // ever published without a page behind it, this fails.
    const xml = await (await request.get('/sitemap.xml')).text();
    const cityPaths = cityPathsFromSitemapXml(xml);
    expect(cityPaths.length, 'sitemap should publish city pages').toBeGreaterThan(0);

    const broken: string[] = [];
    for (const cityPath of cityPaths) {
      const status = (await request.get(cityPath, { maxRedirects: 0 })).status();
      if (status !== 200) broken.push(`${cityPath} -> ${status}`);
    }
    expect(broken, 'sitemap URLs must not 404').toEqual([]);
  });

  test('AC9: fairfield is not published, and asking for it is still a 404', () => {
    // Documents the decision rather than changing behaviour: Fairfield is not a
    // service area, so the page is meant to be absent. Adding the town later
    // means a service_areas row AND a locationData entry - at which point it
    // enters the sitemap and AC8 starts covering it with no edit here.
    const source = readFileSync(
      path.join(process.cwd(), 'src', 'data', 'locationData.ts'),
      'utf8'
    );
    expect(source).not.toContain('fairfield');
  });
});
