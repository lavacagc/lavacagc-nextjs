import { test, expect } from '@playwright/test';
import { existsSync, statSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Buy + Remodel social share (Open Graph) cover image.
 *
 * The link preview that shows when /buy-and-remodel is pasted into iMessage,
 * Facebook, LinkedIn, Slack, etc. must use the dedicated branded cover — not a
 * missing file (which makes scrapers fall back to a random listing photo).
 *
 * These are environment-independent checks (no server, no Supabase): the page is
 * `force-dynamic` and access-gated, so a live-head scrape can't run in CI where
 * the backend is a placeholder. We instead assert the asset exists and that the
 * page's metadata declares it — which is the actual contract for link previews.
 *
 * The asset lives at /og-buy-remodel.png. The earlier /og-buy-and-remodel.png
 * path had a stale 403 frozen in the Cloudflare edge cache (7-day TTL) after a
 * burst of automated requests poisoned that cache key; the origin served the
 * file fine, but scrapers hit the cached 403. Serving from a fresh path is a new
 * cache key, so it resolves clean — hence the rename. Don't reintroduce the old
 * path until that Cloudflare entry has been purged or expired.
 *
 * Acceptance criteria:
 *  1. The OG asset exists in /public and is a real (non-trivial) image.
 *  2. The page declares that asset for both og:image and twitter:image.
 *  3. The old, 404-ing og-portfolio.jpg is no longer referenced by this page.
 *  4. The Cloudflare-poisoned og-buy-and-remodel.png path is no longer referenced.
 */

const OG_FILE = 'og-buy-remodel.png';
const PAGE = join(process.cwd(), 'src', 'app', 'buy-and-remodel', 'page.tsx');

test('the OG cover asset exists in public/', () => {
  const file = join(process.cwd(), 'public', OG_FILE);
  expect(existsSync(file)).toBe(true);
  expect(statSync(file).size).toBeGreaterThan(10_000); // a real image, not an empty/placeholder file
});

test('the page declares the branded OG + Twitter image', () => {
  const src = readFileSync(PAGE, 'utf8');

  // og:image — declared inside the openGraph.images array.
  expect(src, 'openGraph should reference the branded cover').toMatch(
    /openGraph[\s\S]*images:\s*\[[\s\S]*og-buy-remodel\.png/,
  );
  // twitter:image — Twitter card must carry its own image, not silently fall back.
  expect(src, 'twitter should reference the branded cover').toMatch(
    /twitter[\s\S]*images:\s*\[[\s\S]*og-buy-remodel\.png/,
  );
  // The previously-referenced, non-existent image must be gone from this page.
  expect(src, 'dead og-portfolio.jpg must be removed').not.toContain('og-portfolio.jpg');
  // The Cloudflare-poisoned path must not be reintroduced.
  expect(src, 'poisoned og-buy-and-remodel.png path must be retired').not.toContain('og-buy-and-remodel.png');
});
