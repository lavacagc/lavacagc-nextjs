import { test, expect } from '@playwright/test';

/**
 * /unsub — the tokenless public unsubscribe page (CAN-SPAM safety net).
 *
 * Anyone landing on /unsub (a short link, a mistyped URL, a link that carried
 * no token) must be able to opt out by entering their email. /unsubscribe
 * aliases to it. The email POST is mocked at the network layer here; the
 * backend cascade (all marketing streams off → homeowner/newsletter status)
 * is verified separately against the real endpoint.
 */

test.describe('/unsub tokenless unsubscribe', () => {
  test('renders the email-entry form', async ({ page }) => {
    await page.goto('/unsub');
    await expect(page.getByRole('heading', { name: /Unsubscribe from marketing emails/i })).toBeVisible();
    await expect(page.getByTestId('unsub-email')).toBeVisible();
    await expect(page.getByTestId('unsub-submit')).toBeVisible();
  });

  test('submitting an email shows the unsubscribed confirmation', async ({ page }) => {
    let posted: { email?: string } | null = null;
    await page.route('**/api/preferences/unsubscribe-by-email', async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    });

    await page.goto('/unsub');
    await page.getByTestId('unsub-email').fill('someone@example.com');
    await page.getByTestId('unsub-submit').click();

    await expect(page.getByTestId('unsub-done')).toBeVisible();
    await expect(page.getByTestId('unsub-done')).toContainText('someone@example.com');
    expect(posted).toEqual({ email: 'someone@example.com' });
  });

  test('pre-fills the email from ?email=', async ({ page }) => {
    await page.goto('/unsub?email=prefill%40example.com');
    await expect(page.getByTestId('unsub-email')).toHaveValue('prefill@example.com');
  });

  test('surfaces a server error without claiming success', async ({ page }) => {
    await page.route('**/api/preferences/unsubscribe-by-email', (route) =>
      route.fulfill({ status: 500, json: { error: 'Something went wrong — please try again.' } }),
    );
    await page.goto('/unsub');
    await page.getByTestId('unsub-email').fill('boom@example.com');
    await page.getByTestId('unsub-submit').click();
    await expect(page.getByTestId('unsub-error')).toBeVisible();
    await expect(page.getByTestId('unsub-done')).toHaveCount(0);
  });

  test('/unsubscribe redirects to /unsub', async ({ page }) => {
    await page.goto('/unsubscribe');
    await expect(page).toHaveURL(/\/unsub$/);
    await expect(page.getByTestId('unsub-form')).toBeVisible();
  });
});

test.describe('unsubscribe-by-email API validation', () => {
  test('rejects a missing/invalid email with 400', async ({ request }) => {
    const empty = await request.post('/api/preferences/unsubscribe-by-email', { data: {} });
    expect(empty.status()).toBe(400);
    const bad = await request.post('/api/preferences/unsubscribe-by-email', { data: { email: 'not-an-email' } });
    expect(bad.status()).toBe(400);
  });
});
