import { test, expect, type Route } from '@playwright/test';

/**
 * Regression guard for the Vercel serverless "fire-and-forget" bug.
 *
 * The bug: /api/leads/submit used `Promise.allSettled([...fetches])` WITHOUT
 * awaiting, then returned the response. On Vercel, function execution is
 * suspended once the response is sent, so the notification fetches silently
 * never ran — DB insert succeeded but no Telegram/email ever fired.
 *
 * These ACs verify that:
 *   AC1: /api/leads/submit does NOT return the HTTP response until after
 *        the notify sub-requests have been dispatched
 *   AC2: telegram-lead + new-lead are both dispatched with the
 *        x-internal-secret header (middleware carveout)
 *   AC3: the user-facing response still lands within ~10s (timeouts cap it)
 */

test.describe('/api/leads/submit — notifications must dispatch before response', () => {
  test.beforeEach(async ({ page }) => {
    // Block external reCAPTCHA script, stub grecaptcha so the form can submit
    await page.route(/recaptcha|gstatic\.com\/recaptcha/, (route) => route.abort());
    await page.addInitScript(() => {
      // @ts-expect-error - runtime stub
      window.grecaptcha = {
        enterprise: {
          ready: (cb: () => void) => cb(),
          execute: async () => 'test-recaptcha-token',
        },
      };
    });
  });

  test('AC1+AC2: notify endpoints are hit with x-internal-secret before /submit response lands', async ({ page }) => {
    const notifyHits: Array<{ url: string; hasSecret: boolean }> = [];
    let submitResponseTime = 0;
    let lastNotifyTime = 0;

    // Intercept notify endpoints — record timing and header presence
    await page.route('**/api/notify/telegram-lead', async (route: Route) => {
      notifyHits.push({
        url: 'telegram-lead',
        hasSecret: !!route.request().headers()['x-internal-secret'],
      });
      lastNotifyTime = Date.now();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"sent"}' });
    });
    await page.route('**/api/notify/new-lead', async (route: Route) => {
      notifyHits.push({
        url: 'new-lead',
        hasSecret: !!route.request().headers()['x-internal-secret'],
      });
      lastNotifyTime = Date.now();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"sent"}' });
    });
    await page.route('**/api/leads/webhook', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    // Intercept /api/leads/submit and forward it, but record when its response lands.
    // We cannot use page.route for the /submit itself because we want the REAL
    // server logic to run its notification dispatch. So instead we run against
    // a local dev server (TEST_URL defaults to localhost:3000) and just measure
    // wall-clock time of the user-visible response vs when notify routes were hit.
    await page.route('**/api/leads/submit', async (route: Route) => {
      const response = await route.fetch();
      submitResponseTime = Date.now();
      await route.fulfill({ response });
    });

    await page.goto('/free-estimate');
    // Fill the landing form
    await page.getByRole('textbox', { name: /full name/i }).fill('AC Test');
    await page.getByRole('textbox', { name: /^email/i }).fill('test@example.com');
    await page.getByRole('textbox', { name: /phone/i }).fill('(201) 555-1234');
    await page.getByRole('textbox', { name: /zip code/i }).fill('07620');
    await page.getByRole('checkbox', { name: /i agree to the terms/i }).check();
    await page.getByRole('button', { name: /get my free estimate/i }).click();

    // Wait until we see the success state OR timeout
    await expect(page.getByText(/thank you/i)).toBeVisible({ timeout: 15000 });

    // AC1: both notify endpoints should have been hit
    expect(notifyHits.length).toBeGreaterThanOrEqual(2);
    const urls = notifyHits.map((h) => h.url).sort();
    expect(urls).toContain('telegram-lead');
    expect(urls).toContain('new-lead');

    // AC2: each notify must carry the internal secret header
    for (const hit of notifyHits) {
      expect(hit.hasSecret, `${hit.url} missing x-internal-secret`).toBe(true);
    }

    // AC1 timing: notifications were dispatched BEFORE /submit response returned
    // (this is the core regression guard against the fire-and-forget bug).
    expect(lastNotifyTime).toBeGreaterThan(0);
    expect(submitResponseTime).toBeGreaterThan(0);
    // Tolerate a few ms of slop for event loop ordering.
    expect(lastNotifyTime).toBeLessThanOrEqual(submitResponseTime + 50);
  });
});
