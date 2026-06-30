import { test, expect } from '@playwright/test';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';

/**
 * Listing detail "shadowbox" photo lightbox.
 *
 * The detail page is published + email-gated, so it only renders with a live
 * backend (and the feature published). These are live-backend specs that skip
 * cleanly otherwise. The lightbox itself was also verified manually against the
 * dev server (sample data) during development.
 */
test.describe('Buy + Remodel — photo lightbox (live backend)', () => {
  test('clicking a house photo opens a cycling lightbox with a counter', async ({ page, request }) => {
    test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);

    // Reach a detail page: open the gallery, follow the first listing link.
    const probe = await request.get('/buy-and-remodel', { maxRedirects: 0 });
    test.skip(probe.status() === 404, 'Feature not published in this env — flip the admin switch to run.');

    await page.goto('/buy-and-remodel', { waitUntil: 'domcontentloaded' });
    const firstCard = page
      .getByTestId('listings-grid')
      .locator('a[href^="/buy-and-remodel/"]')
      .first();
    test.skip((await firstCard.count()) === 0, 'No clickable listing detail links (locked/empty env).');
    await firstCard.click();
    await page.waitForURL(/\/buy-and-remodel\/[^/]+$/);

    // The photo grid tiles are buttons now.
    const grid = page.getByTestId('listing-photo-grid');
    test.skip((await grid.count()) === 0, 'Listing has no photos.');
    await grid.getByRole('button').first().click();

    // Lightbox dialog opens with a "1 / N" counter.
    const lightbox = page.getByTestId('listing-lightbox');
    await expect(lightbox).toBeVisible();
    await expect(lightbox.getByText(/^\d+ \/ \d+$/)).toBeVisible();
    const startCounter = await lightbox.getByText(/^\d+ \/ \d+$/).textContent();

    // If there's more than one photo, Next advances the counter.
    const total = Number((startCounter ?? '1 / 1').split('/')[1].trim());
    if (total > 1) {
      await lightbox.locator('button:has(svg.lucide-arrow-right)').click();
      await expect(lightbox.getByText(/^2 \/ /)).toBeVisible();
    }

    // Escape closes it.
    await page.keyboard.press('Escape');
    await expect(lightbox).toBeHidden();
  });
});
