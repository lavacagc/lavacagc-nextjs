import { test, expect } from '@playwright/test';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';

/**
 * Auto-generated before/after remodel renderings.
 *
 * The generation cron is the only piece testable without a live backend (auth).
 * The slider rendering + drag is verified visually against the dev server
 * (the dev-only SAMPLE_RENDERINGS only appear under `next dev`, not the
 * production `next start` Playwright runs against). The full pipeline
 * (import -> cron -> ready -> slider) is a gated live-backend test.
 */

test.describe('Before/After renderings (no backend required)', () => {
  test('generation cron rejects unauthenticated callers', async ({ request }) => {
    const res = await request.get('/api/cron/generate-renderings');
    // Middleware returns 401 when CRON_SECRET is set but the Bearer is missing,
    // or 500 when CRON_SECRET itself isn't configured (CI). Either means the
    // job is not runnable without the secret.
    expect([401, 500], `unexpected status ${res.status()}`).toContain(res.status());
  });
});

test.describe('Before/After renderings — full pipeline (live backend)', () => {
  test('import queues a rendering, cron generates it, slider shows on the listing', async ({ page, request }) => {
    test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const cronSecret = process.env.CRON_SECRET;
    test.skip(!email || !password || !cronSecret, 'Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD / CRON_SECRET to run the full pipeline.');

    // Log in and open the importer.
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: /email/i }).fill(email!);
    await page.getByRole('textbox', { name: /password/i }).fill(password!);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL('**/vaca-mgmt', { timeout: 20000 });
    await page.getByRole('button', { name: 'Content' }).click();
    await page.getByRole('button', { name: 'Home Listings' }).click();
    await page.getByRole('tab', { name: 'Import' }).click();

    // A home with a Kitchen Before Photo → should queue one rendering.
    const csv =
      'Address,City,List Price,Est Remodel Budget Low,Est Remodel Budget High,Photo URLs,Status,Kitchen Before Photo\n' +
      '7 Render Test Rd,Ridgewood,"$500,000","$100,000","$150,000",https://placehold.co/800x600.png,available,https://placehold.co/800x600.png\n';
    await page.getByText(/Drop a file here or click to browse/i).click();
    await page.locator('input[type="file"]').setInputFiles({ name: 'fixture.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.getByRole('button', { name: /Import 1 home/i }).click();
    await expect(page.getByText(/render\(s\) queued/i)).toBeVisible({ timeout: 30000 });

    // Run the cron to generate the after image.
    const cronRes = await request.get('/api/cron/generate-renderings', {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    expect(cronRes.ok()).toBeTruthy();

    // The detail page should now show the before/after slider.
    await page.goto('/buy-and-remodel/7-render-test-rd-ridgewood', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Before .* after/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('slider').first()).toBeVisible();
    await expect(page.getByText(/AI-generated visualization/i).first()).toBeVisible();
  });
});
