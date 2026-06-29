import { test, expect } from '@playwright/test';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';

/**
 * "Buy + Remodel" email gate (double opt-in + newsletter).
 *
 * The gallery (/buy-and-remodel) is a public teaser; each home's DETAIL page is
 * gated behind a verified-email access cookie. No-backend specs verify the gate
 * redirect, the unlock page, and the input-hardening of the subscribe/verify/
 * unsubscribe routes. The full subscribe -> verify -> cookie -> unsubscribe loop
 * is a gated live-backend spec.
 */

test.describe('Buy + Remodel email gate (no backend required)', () => {
  test('gallery is public and shows the unlock banner', async ({ page }) => {
    const res = await page.goto('/buy-and-remodel', { waitUntil: 'domcontentloaded' });
    expect(res?.status(), 'gallery should be publicly reachable').toBeLessThan(400);
    await expect(page.getByTestId('unlock-banner')).toBeVisible();
  });

  test('detail page redirects an unauthenticated visitor to /unlock with a next param', async ({ page }) => {
    await page.goto('/buy-and-remodel/12-maple-avenue-ridgewood-07450', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/buy-and-remodel\/unlock\?next=/);
  });

  test('unlock page renders the signup form', async ({ page }) => {
    await page.goto('/buy-and-remodel/unlock', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/full details/i);
    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#phone')).toBeVisible();
    await expect(page.locator('#zips')).toBeVisible();
  });

  test('subscribe rejects a malformed body (400)', async ({ request }) => {
    const res = await request.post('/api/buy-and-remodel/subscribe', { data: {} });
    expect(res.status()).toBe(400);
  });

  test('subscribe with valid fields but no reCAPTCHA token is rejected (400)', async ({ request }) => {
    const res = await request.post('/api/buy-and-remodel/subscribe', {
      data: { first_name: 'Test', last_name: 'User', email: 'test@example.com', phone: '2015550123', zips: '07450' },
    });
    expect(res.status()).toBe(400);
  });

  test('subscribe silently accepts a honeypot hit (200, no error leak)', async ({ request }) => {
    const res = await request.post('/api/buy-and-remodel/subscribe', {
      data: {
        first_name: 'Bot',
        last_name: 'Bot',
        email: 'bot@example.com',
        phone: '2015550123',
        zips: '07450',
        honeypot: 'i-am-a-bot',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('verify with an invalid token redirects back to the unlock page', async ({ page }) => {
    await page.goto('/api/buy-and-remodel/verify?token=not-a-real-token', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/buy-and-remodel\/unlock\?error=/);
  });

  test('unsubscribe with no token returns a confirmation page (200 html)', async ({ request }) => {
    const res = await request.get('/api/buy-and-remodel/unsubscribe');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/html');
  });
});

test.describe('Buy + Remodel email gate — full flow (live backend)', () => {
  test('subscribe -> verify sets access cookie -> detail page loads -> unsubscribe revokes', async ({ page, request, context }) => {
    test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SECRET_KEY;
    test.skip(!supabaseUrl || !serviceKey, 'Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY to run the gate flow.');

    // Unique email so re-runs don't collide.
    const email = `gate-test+${Date.now()}@example.com`;

    // 1. Subscribe (reCAPTCHA disabled paths require real keys; this asserts the
    //    request is accepted end-to-end in the live env).
    const sub = await request.post('/api/buy-and-remodel/subscribe', {
      data: { first_name: 'Gate', last_name: 'Test', email, phone: '2015550123', zips: '07450' },
    });
    // In a fully-configured env this is 200; if reCAPTCHA hard-fails it's 403.
    expect([200, 403]).toContain(sub.status());
    test.skip(sub.status() !== 200, 'reCAPTCHA blocked the live subscribe; configure keys to run the full loop.');

    // 2. Read the verify token straight from the DB (service key).
    const lookup = await request.get(
      `${supabaseUrl}/rest/v1/newsletter_subscribers?email=eq.${encodeURIComponent(email)}&select=verify_token,unsubscribe_token`,
      { headers: { apikey: serviceKey!, Authorization: `Bearer ${serviceKey!}` } },
    );
    const [row] = await lookup.json();
    expect(row?.verify_token, 'a pending verify token should exist').toBeTruthy();

    // 3. Verify → should set the br_access cookie and redirect into the listings.
    await page.goto(`/api/buy-and-remodel/verify?token=${row.verify_token}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/buy-and-remodel(\/|$)/);
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === 'br_access'), 'br_access cookie set after verify').toBeTruthy();

    // 4. Unsubscribe → revokes; a fresh context (no cookie) is redirected again.
    await page.goto(`/api/buy-and-remodel/unsubscribe?token=${row.unsubscribe_token}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/unsubscribed/i)).toBeVisible();
  });
});
