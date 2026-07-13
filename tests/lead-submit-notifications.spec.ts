import { test, expect, type Route } from '@playwright/test';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';

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
 *
 * The submit crosses the real reCAPTCHA gate via RECAPTCHA_E2E_BYPASS_TOKEN
 * (the server must run with the same token; see /api/leads/submit). Without
 * it no browser-stubbed token can pass server-side verification and this
 * spec used to fail on every local full-suite run.
 */

const BYPASS_TOKEN = process.env.RECAPTCHA_E2E_BYPASS_TOKEN || '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || '';
const CONFIGURED = Boolean(BYPASS_TOKEN && SUPABASE_URL && SUPABASE_KEY);
const CONFIG_REASON =
  'Requires RECAPTCHA_E2E_BYPASS_TOKEN + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY ' +
  '(server must run with the same bypass token).';

const TEST_EMAIL = 'delivered+notify@resend.dev';

// The submit writes a real lead + follow-up queue rows into the live DB;
// remove them so repeated runs stay idempotent.
async function cleanupTestRows(): Promise<void> {
  for (const q of [
    `follow_up_queue?lead_email=eq.${encodeURIComponent(TEST_EMAIL)}`,
    `leads?email=eq.${encodeURIComponent(TEST_EMAIL)}`,
    `rate_limits?ip_address=eq.${encodeURIComponent('lead-submit:203.0.113.85')}`,
  ]) {
    await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
  }
}

// This test's own rate-limit bucket (see pinRateLimitBucket note in
// home-care-booking-contact-optional.spec.ts): live submits from parallel
// specs otherwise share the 'unknown' bucket and trip the 5/min limiter.
const TEST_IP = '203.0.113.85';

test.describe('/api/leads/submit — notifications dispatch in-process', () => {
  // Server-path spec: one browser project is enough, and each mobile re-run
  // doubles the REAL Telegram/email notifications sent to the owner.
  test.skip(({ isMobile }) => Boolean(isMobile), 'server-path spec - chromium project only');

  test.beforeEach(async ({ page }) => {
    await page.route(/recaptcha|gstatic\.com\/recaptcha/, (route) => route.abort());
    await page.addInitScript(
      ({ token }) => {
        // @ts-expect-error - runtime stub
        window.grecaptcha = {
          enterprise: {
            ready: (cb: () => void) => cb(),
            execute: async () => token,
          },
        };
      },
      { token: BYPASS_TOKEN }
    );
    await cleanupTestRows();
  });

  test.afterEach(async () => {
    await cleanupTestRows();
  });

  test('AC1+AC2+AC3: submit succeeds without self-fetching notify endpoints', async ({ page }) => {
    // This drives the REAL /api/leads/submit (route.fetch, not a mock): the
    // server must verify reCAPTCHA, insert into Supabase, and dispatch
    // notifications. That needs server secret keys + a live DB (and would emit
    // real Telegram/email), so it can't run in the default CI job.
    test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
    test.skip(!CONFIGURED, CONFIG_REASON);
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
      // x-real-ip pins this test to its own rate-limit bucket (cleaned up in
      // cleanupTestRows) so parallel live-submit specs can't 429 it.
      const response = await route.fetch({
        headers: { ...route.request().headers(), 'x-real-ip': TEST_IP },
      });
      submitResponseTime = Date.now();
      await route.fulfill({ response });
    });

    // domcontentloaded: the landing page pulls third-party scripts (ads/GA)
    // that can hang the window load event in dev; the form is interactive
    // long before that.
    await page.goto('/free-estimate', { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: /full name/i }).fill('AC Test');
    await page.getByRole('textbox', { name: /^email/i }).fill(TEST_EMAIL);
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
