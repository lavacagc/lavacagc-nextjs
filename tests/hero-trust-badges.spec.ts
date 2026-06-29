import { test, expect, devices } from '@playwright/test';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';

// Test the clickable trust badges in the Hero component on mobile.
// The 4 badges (in a 2x2 grid on mobile) are:
//   1. Google Rating star block      -> scrolls to #testimonials
//   2. "Trusted by" / Home Owners    -> scrolls to #testimonials
//   3. "Licensed, Bonded, & Insured" -> navigates to /about
//   4. "Family-Owned" / & Operated   -> navigates to /about

// Force iPhone SE viewport (375x667) for this whole file.
// Use Chromium (not WebKit) for compatibility with the existing test setup —
// matches the convention in playwright.config.ts where the "mobile" project uses
// Pixel 5 dimensions on Chromium.
test.use({
  ...devices['iPhone SE'],
  defaultBrowserType: 'chromium',
  viewport: { width: 375, height: 667 },
});

test.describe('Hero trust badges (mobile)', () => {
  test.beforeEach(async ({ page }) => {
    // Use 'commit' to avoid waiting for the autoplaying hero <video> network activity.
    await page.goto('/', { waitUntil: 'commit' });
    // Wait for the hero badges to be attached before each test starts.
    await page
      .getByRole('link', { name: 'Learn about our licensing, bonding, and insurance' })
      .waitFor({ state: 'attached', timeout: 30000 });
  });

  test('all four trust badges are visible', async ({ page }) => {
    const googleBadge = page.getByRole('button', { name: 'View customer testimonials' }).first();
    const trustedByBadge = page.getByRole('button', { name: 'View customer testimonials' }).nth(1);
    const licensedBadge = page.getByRole('link', { name: 'Learn about our licensing, bonding, and insurance' });
    const familyBadge = page.getByRole('link', { name: 'Learn about our family-owned business' });

    await expect(googleBadge).toBeVisible();
    await expect(trustedByBadge).toBeVisible();
    await expect(licensedBadge).toBeVisible();
    await expect(familyBadge).toBeVisible();
  });

  // Helper: scroll the page to force lazy-loaded sections (Testimonials is dynamic)
  // to mount, then return to top so we can click the hero badges.
  async function ensureTestimonialsMounted(page: import('@playwright/test').Page) {
    // Scroll all the way down in steps so dynamic imports + intersection observers fire.
    for (let y = 500; y < 8000; y += 700) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(150);
    }
    await page.locator('#testimonials').waitFor({ state: 'attached', timeout: 15000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
  }

  test('"Trusted by" badge scrolls testimonials section into view', async ({ page }) => {
    // Testimonials renders null without reviews (CI uses placeholder Supabase),
    // so #testimonials only exists with a live backend.
    test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
    await ensureTestimonialsMounted(page);

    const trustedByBadge = page.getByRole('button', { name: 'View customer testimonials' }).nth(1);
    await trustedByBadge.click();

    const testimonials = page.locator('#testimonials');
    await expect(testimonials).toBeInViewport({ timeout: 5000 });
  });

  test('Google Rating badge scrolls testimonials section into view', async ({ page }) => {
    // Testimonials renders null without reviews (CI uses placeholder Supabase),
    // so #testimonials only exists with a live backend.
    test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
    await ensureTestimonialsMounted(page);

    const googleBadge = page.getByRole('button', { name: 'View customer testimonials' }).first();
    await googleBadge.click();

    const testimonials = page.locator('#testimonials');
    await expect(testimonials).toBeInViewport({ timeout: 5000 });
  });

  test('"Licensed, Bonded, & Insured" badge navigates to /about', async ({ page }) => {
    // Soft-navigation to /about fetches the route's RSC payload; under CI's
    // no-backend runtime that render fails and the client nav never completes,
    // so the URL never changes. Needs a live backend (passes locally).
    test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
    const licensedBadge = page.getByRole('link', { name: 'Learn about our licensing, bonding, and insurance' });
    await Promise.all([
      page.waitForURL('**/about', { timeout: 15000 }),
      licensedBadge.click(),
    ]);
    expect(new URL(page.url()).pathname).toBe('/about');
  });

  test('"Family-Owned" badge navigates to /about (after going back)', async ({ page }) => {
    // Same /about RSC dependency as the Licensed nav test — needs a live backend.
    test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
    // First click Licensed to navigate away.
    const licensedBadge = page.getByRole('link', { name: 'Learn about our licensing, bonding, and insurance' });
    await Promise.all([
      page.waitForURL('**/about', { timeout: 15000 }),
      licensedBadge.click(),
    ]);

    // Go back to the home page. Use a fresh navigation rather than goBack() to
    // avoid flakiness with dev-server HMR re-renders.
    await page.goto('/', { waitUntil: 'commit' });
    await page
      .getByRole('link', { name: 'Learn about our family-owned business' })
      .waitFor({ state: 'attached', timeout: 30000 });

    const familyBadge = page.getByRole('link', { name: 'Learn about our family-owned business' });
    await Promise.all([
      page.waitForURL('**/about', { timeout: 15000 }),
      familyBadge.click(),
    ]);
    expect(new URL(page.url()).pathname).toBe('/about');
  });
});
