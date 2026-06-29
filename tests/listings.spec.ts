import { test, expect } from '@playwright/test';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';

/**
 * "Buy + Remodel" curated home listings.
 *
 * The whole feature is admin-gated: hidden (404) from the public until an admin
 * flips the publish switch. No-backend specs (placeholder Supabase, no admin
 * session) therefore verify it is hidden by default and that the admin import
 * route rejects unauthenticated callers. The public gallery's rendered content
 * (hero, JSON-LD, CTA) requires the feature published, so those are live-backend
 * specs, alongside the full spreadsheet import flow.
 */

test.describe('Buy + Remodel — public page (no backend required)', () => {
  test('gallery is hidden (404) from the public while unpublished', async ({ page }) => {
    const res = await page.goto('/buy-and-remodel', { waitUntil: 'domcontentloaded' });
    expect(res?.status(), 'unpublished feature should 404 for the public').toBe(404);
  });

  test('admin import route rejects unauthenticated callers', async ({ request }) => {
    const res = await request.post('/api/admin/listings/import', { data: { rows: [] } });
    expect(res.status(), 'middleware should 401 an unauthenticated import').toBe(401);
  });
});

test.describe('Buy + Remodel — published gallery content (live backend)', () => {
  // Requires the feature PUBLISHED in the target env. If it 404s, skip.
  test('published gallery renders hero, JSON-LD, and the estimate CTA', async ({ page, request }) => {
    test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
    const probe = await request.get('/buy-and-remodel', { maxRedirects: 0 });
    test.skip(probe.status() === 404, 'Feature not published in this env — flip the admin switch to run.');

    await page.goto('/buy-and-remodel', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: /Buy \+ Remodel/i })).toBeVisible();

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const collection = blocks.map((b) => JSON.parse(b)).find((j) => j['@type'] === 'CollectionPage');
    expect(collection, 'CollectionPage JSON-LD should be present').toBeTruthy();
    expect(collection.mainEntity['@type']).toBe('ItemList');

    const cta = page.getByRole('link', { name: /Get a Remodel Estimate/i });
    await expect(cta).toHaveAttribute('href', /\/free-estimate/);
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
