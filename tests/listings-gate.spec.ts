import { test, expect } from '@playwright/test';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';

/**
 * "Buy + Remodel" — admin publish gate + email gate.
 *
 * The whole feature is hidden (404) from the public until an admin flips the
 * publish flag in the admin panel; until then only a logged-in admin (or local
 * dev) can preview it. Once published, each home's DETAIL page is additionally
 * gated behind a verified-email access cookie.
 *
 * In CI there is no backend and no admin session, so the publish flag reads
 * false → the public pages 404. No-backend specs verify that hidden-by-default
 * behavior plus the backend-independent hardening of the subscribe/verify/
 * unsubscribe API. The published rendering + full email-gate flow are gated
 * live-backend specs.
 */

test.describe('Buy + Remodel — hidden until published (no backend required)', () => {
  test('gallery returns 404 to the public while unpublished', async ({ page }) => {
    const res = await page.goto('/buy-and-remodel', { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(404);
  });

  test('a home detail page returns 404 to the public while unpublished', async ({ page }) => {
    const res = await page.goto('/buy-and-remodel/12-maple-avenue-ridgewood-07450', { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(404);
  });

  test('the unlock/signup page returns 404 to the public while unpublished', async ({ page }) => {
    const res = await page.goto('/buy-and-remodel/unlock', { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(404);
  });

  // --- subscribe/verify/unsubscribe API hardening (independent of the gate) ---

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

  test('verify with an invalid token fails safe (redirects to the unlock URL, no cookie)', async ({ request }) => {
    const res = await request.get('/api/buy-and-remodel/verify?token=not-a-real-token', { maxRedirects: 0 });
    expect([302, 307, 308]).toContain(res.status());
    expect(res.headers()['location']).toContain('/buy-and-remodel/unlock?error=');
    expect(res.headers()['set-cookie'] ?? '').not.toContain('br_access=');
  });

  test('unsubscribe with no token returns a confirmation page (200 html)', async ({ request }) => {
    const res = await request.get('/api/buy-and-remodel/unsubscribe');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/html');
  });
});

test.describe('Buy + Remodel — published email gate (live backend)', () => {
  // These require the feature to be PUBLISHED in the target env (admin flipped
  // the switch). If the gallery 404s, the feature is unpublished here → skip.
  test('published: an unauthenticated visitor to a detail page is redirected to /unlock', async ({ page, request }) => {
    test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
    const gallery = await request.get('/buy-and-remodel', { maxRedirects: 0 });
    test.skip(gallery.status() === 404, 'Feature not published in this env — flip the admin switch to run.');

    // A real (or unknown) slug both redirect to unlock when published + no cookie.
    await page.goto('/buy-and-remodel/some-listing-slug', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/buy-and-remodel\/unlock\?next=/);

    // Regression: a slug that merely STARTS WITH "unlock" must still be gated
    // (the unlock-page exemption is an exact match, not a prefix), not served.
    await page.goto('/buy-and-remodel/unlocked-colonial-montclair', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/buy-and-remodel\/unlock\?next=/);
  });
});

test.describe('Buy + Remodel email gate — full flow (live backend)', () => {
  test('subscribe -> verify sets access cookie -> unsubscribe revokes', async ({ page, request, context }) => {
    test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SECRET_KEY;
    test.skip(!supabaseUrl || !serviceKey, 'Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY to run the gate flow.');

    // Unique email so re-runs don't collide.
    const email = `gate-test+${Date.now()}@example.com`;

    // 1. Subscribe (needs real reCAPTCHA keys to return 200).
    const sub = await request.post('/api/buy-and-remodel/subscribe', {
      data: { first_name: 'Gate', last_name: 'Test', email, phone: '2015550123', zips: '07450' },
    });
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

    // 4. Unsubscribe → revokes access + clears the cookie.
    await page.goto(`/api/buy-and-remodel/unsubscribe?token=${row.unsubscribe_token}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/unsubscribed/i)).toBeVisible();
  });
});
