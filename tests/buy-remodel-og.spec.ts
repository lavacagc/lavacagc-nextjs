import { test, expect } from '@playwright/test';
import { existsSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Buy + Remodel social share (Open Graph) cover image.
 *
 * The link preview that shows when /buy-and-remodel is pasted into iMessage,
 * Facebook, LinkedIn, Slack, etc. must use the dedicated branded cover — not a
 * missing file (which makes scrapers fall back to a random listing photo).
 *
 * Acceptance criteria:
 *  1. The OG asset exists in /public and is non-trivial in size.
 *  2. The page <head> advertises that asset for both og:image and twitter:image.
 *  3. The old, 404-ing og-portfolio.jpg is no longer referenced by this page.
 */

const OG_PATH = '/og-buy-and-remodel.png';

test('the OG cover asset exists in public/', () => {
  const file = join(process.cwd(), 'public', 'og-buy-and-remodel.png');
  expect(existsSync(file)).toBe(true);
  expect(statSync(file).size).toBeGreaterThan(10_000); // a real image, not an empty/placeholder file
});

test('/buy-and-remodel advertises the branded OG + Twitter image', async ({ page }) => {
  const resp = await page.goto('/buy-and-remodel', { waitUntil: 'domcontentloaded' });
  // The page is access-gated; metadata is emitted regardless of the gate state.
  expect(resp, 'page should respond').toBeTruthy();

  const ogImage = await page.locator('meta[property="og:image"]').first().getAttribute('content');
  const twImage = await page.locator('meta[name="twitter:image"]').first().getAttribute('content');

  expect(ogImage, 'og:image').toContain(OG_PATH);
  expect(twImage, 'twitter:image').toContain(OG_PATH);

  // The previously-referenced, non-existent image must be gone from this page.
  expect(ogImage).not.toContain('og-portfolio.jpg');
});
