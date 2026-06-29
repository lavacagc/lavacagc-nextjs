import { test, expect } from '@playwright/test';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';

/**
 * "Buy + Remodel" curated home listings.
 *
 * No-backend specs run in CI (placeholder Supabase): the public page must
 * render its hero + a graceful empty state, emit valid JSON-LD, link the
 * estimate CTA, 404 on unknown slugs, and the admin import route must reject
 * unauthenticated callers (middleware). Live-backend specs (real Supabase +
 * admin creds) exercise the full spreadsheet import flow and are gated.
 */

test.describe('Buy + Remodel — public page (no backend required)', () => {
  test('gallery page loads with hero and renders gracefully with zero rows', async ({ page }) => {
    const res = await page.goto('/buy-and-remodel', { waitUntil: 'domcontentloaded' });
    expect(res?.status(), 'page should return < 400').toBeLessThan(400);

    await expect(page.getByRole('heading', { level: 1, name: /Buy \+ Remodel/i })).toBeVisible();

    // Either the grid (with data) or the empty state (no data) must render.
    const grid = page.getByTestId('listings-grid');
    const empty = page.getByTestId('listings-empty');
    await expect(grid.or(empty)).toBeVisible();
  });

  test('emits valid CollectionPage/ItemList JSON-LD', async ({ page }) => {
    await page.goto('/buy-and-remodel', { waitUntil: 'domcontentloaded' });
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const parsed = blocks.map((b) => JSON.parse(b));
    const collection = parsed.find((j) => j['@type'] === 'CollectionPage');
    expect(collection, 'CollectionPage JSON-LD should be present').toBeTruthy();
    expect(collection.mainEntity['@type']).toBe('ItemList');
    expect(typeof collection.mainEntity.numberOfItems).toBe('number');
  });

  test('page-level estimate CTA links to /free-estimate', async ({ page }) => {
    await page.goto('/buy-and-remodel', { waitUntil: 'domcontentloaded' });
    const cta = page.getByRole('link', { name: /Get a Remodel Estimate/i });
    await expect(cta).toHaveAttribute('href', /\/free-estimate/);
  });

  // Detail pages are gated behind a verified email: an unauthenticated visitor
  // (no access cookie, no admin session) is redirected to the unlock page BEFORE
  // the page can resolve — so even an unknown slug lands on /unlock, not a 404.
  // (The 404-on-unknown-slug behavior is verified for authenticated users in the
  // live-backend gate spec.)
  test('detail page redirects an unauthenticated visitor to the unlock page', async ({ page }) => {
    await page.goto('/buy-and-remodel/this-home-does-not-exist-xyz', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/buy-and-remodel\/unlock(\?|$)/);
  });

  test('admin import route rejects unauthenticated callers', async ({ request }) => {
    const res = await request.post('/api/admin/listings/import', { data: { rows: [] } });
    expect(res.status(), 'middleware should 401 an unauthenticated import').toBe(401);
  });
});

test.describe('Buy + Remodel — admin import flow (live backend)', () => {
  test('upload spreadsheet, flag a bad row, commit, and see the listing publish', async ({ page }) => {
    test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    test.skip(!email || !password, 'Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD to run the admin import flow.');

    // Log in.
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: /email/i }).fill(email!);
    await page.getByRole('textbox', { name: /password/i }).fill(password!);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL('**/vaca-mgmt', { timeout: 20000 });

    // Open Home Listings → Import.
    await page.getByRole('button', { name: 'Content' }).click();
    await page.getByRole('button', { name: 'Home Listings' }).click();
    await page.getByRole('tab', { name: 'Import' }).click();

    // Upload a fixture spreadsheet (one good row, one missing-address row).
    const csv =
      'Address,City,List Price,Est Remodel Budget Low,Est Remodel Budget High,Photo URLs,Status\n' +
      '99 Test Lane,Ridgewood,"$500,000","$100,000","$150,000",https://placehold.co/800x600.png,available\n' +
      ',Ridgewood,"$500,000","$100,000","$150,000",https://placehold.co/800x600.png,available\n';
    await page.getByText(/Drop a file here or click to browse/i).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'fixture.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });

    // Preview should flag exactly one error row.
    await expect(page.getByText(/1 ready, 1 with errors/i)).toBeVisible({ timeout: 10000 });

    // Commit and confirm the result summary.
    await page.getByRole('button', { name: /Import 1 home/i }).click();
    await expect(page.getByText(/added,.*updated,.*skipped/i)).toBeVisible({ timeout: 30000 });

    // The new home should appear on the public page.
    await page.goto('/buy-and-remodel', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('99 Test Lane')).toBeVisible({ timeout: 10000 });
  });
});
