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
 * Acceptance criteria:
 *  1. The OG asset exists in /public and is a real (non-trivial) image.
 *  2. The page declares that asset for both og:image and twitter:image.
 *  3. The old, 404-ing og-portfolio.jpg is no longer referenced by this page.
 */

const OG_FILE = 'og-buy-and-remodel.png';
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
    /openGraph[\s\S]*images:\s*\[[\s\S]*og-buy-and-remodel\.png/,
  );
  // twitter:image — Twitter card must carry its own image, not silently fall back.
  expect(src, 'twitter should reference the branded cover').toMatch(
    /twitter[\s\S]*images:\s*\[[\s\S]*og-buy-and-remodel\.png/,
  );
  // The previously-referenced, non-existent image must be gone from this page.
  expect(src, 'dead og-portfolio.jpg must be removed').not.toContain('og-portfolio.jpg');
});
