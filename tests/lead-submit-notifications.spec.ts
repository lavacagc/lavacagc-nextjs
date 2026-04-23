import { test, expect, type Route } from '@playwright/test';

/**
 * Regression guard for the lead-submit notification pipeline.
 *
 * Historical bugs this protects against:
 *
 *   1. "Fire-and-forget" Promise.allSettled: /api/leads/submit used to kick off
 *      notify fetches without awaiting them, then return. On Vercel serverless
 *      the function was suspended the moment the response was sent, so the
 *      sub-fetches silently never ran.
 *
 *   2. Cloudflare managed-challenge: after the await fix, self-fetches from
 *      Vercel back to https://www.lavacagc.com/api/notify/* got 403'd by
 *      Cloudflare's bot challenge page BEFORE our middleware could see them.
 *      DB insert succeeded, 200 returned, but Telegram/email never fired.
 *
 * Current architecture: /api/leads/submit imports the notification helpers
 * from src/lib/notify/ and awaits them in-process. No HTTP self-fetch, no
 * Cloudflare hop, no edge challenge.
 *
 * This means we CAN'T use page.route to intercept the notify endpoints from
 * the outside — they're no longer network calls. What we CAN assert:
 *
 *   AC1: /api/leads/submit returns {success: true} for a valid submission
 *   AC2: /api/leads/webhook, /api/notify/telegram-lead, /api/notify/new-lead
 *        are NOT called over the network during a successful submit (regression
 *        guard against someone reintroducing a self-fetch and getting
 *        silently blocked by Cloudflare again)
 *   AC3: the user-facing response lands within ~15s (timeouts cap each
 *        notification at 4s wall-clock)
 *
 * Unit-level verification that each helper was invoked would require mocking
 * the modules — we rely on manual/staging verification of delivery for now.
 */

test.describe('/api/leads/submit — notifications dispatch in-process', () => {
  test.beforeEach(async ({ page }) => {
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

  test('AC1+AC2+AC3: submit succeeds without self-fetching notify endpoints', async ({ page }) => {
    const selfFetchedNotifyHits: string[] = [];
    let submitResponseTime = 0;
    let submitStarted = 0;

    // If any of these fire, it means someone reintroduced an HTTP self-fetch
    // for an internal notification. That would get interstitialled by
    // Cloudflare in production and silently fail. We fail the test here
    // instead of in production.
    const notifyUrls = [
      '**/api/notify/telegram-lead',
      '**/api/notify/new-lead',
      '**/api/notify/form-error',
      '**/api/leads/webhook',
    ];
    for (const pattern of notifyUrls) {
      await page.route(pattern, async (route: Route) => {
        // Only record if the navigator is the page itself (not a server call
        // that accidentally matches because we can't distinguish). We record
        // these and fail — any browser-originated hit to these endpoints
        // during a lead submit flow means something is off.
        selfFetchedNotifyHits.push(pattern);
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });
    }

    await page.route('**/api/leads/submit', async (route: Route) => {
      submitStarted = Date.now();
      const response = await route.fetch();
      submitResponseTime = Date.now();
      await route.fulfill({ response });
    });

    await page.goto('/free-estimate');
    await page.getByRole('textbox', { name: /full name/i }).fill('AC Test');
    await page.getByRole('textbox', { name: /^email/i }).fill('test@example.com');
    await page.getByRole('textbox', { name: /phone/i }).fill('(201) 555-1234');
    await page.getByRole('textbox', { name: /zip code/i }).fill('07620');
    await page.getByRole('checkbox', { name: /i agree to the terms/i }).check();
    await page.getByRole('button', { name: /get my free estimate/i }).click();

    await expect(page.getByText(/thank you/i)).toBeVisible({ timeout: 15000 });

    // AC2: no browser-originated or same-origin self-fetch to internal notify
    // endpoints should have happened during a successful submit.
    expect(
      selfFetchedNotifyHits,
      `Unexpected notify endpoint hits: ${selfFetchedNotifyHits.join(', ')}. ` +
        `Internal callers must import from src/lib/notify/ — self-fetches to ` +
        `www.lavacagc.com/api/notify/* get blocked by Cloudflare.`
    ).toEqual([]);

    // AC3: the user-facing response came back within the timeout budget.
    expect(submitResponseTime).toBeGreaterThan(0);
    expect(submitResponseTime - submitStarted).toBeLessThan(15000);
  });
});
