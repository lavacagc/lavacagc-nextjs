import { test, expect } from '@playwright/test';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';

/**
 * TCPA consent logging via /api/consent/log.
 *
 * Background (verified live 2026-07-13): ContactForm, EstimateForm,
 * HomeEstimateForm and WarrantyForm used to invoke the deployed `log-consent`
 * edge fn with ip_address: null - a browser cannot know its own IP - and a
 * stricter fn deploy (~2025-11-14) made that a Zod 400. Every TCPA consent
 * record from those forms silently failed for months (the forms swallow the
 * error by design; prod consent_logs had rows only from the server-side
 * newsletter paths). /api/consent/log logs server-side, deriving IP + user
 * agent from the request itself.
 *
 * Acceptance criteria:
 *  AC1: POST /api/consent/log with email/phone/type -> 200; a consent_logs
 *       row exists with tcpa_consent, consent_text, user_agent, and the
 *       caller's ip captured server-side.
 *  AC2: missing consent_type -> 400, no row.
 *  AC3: ContactForm submission E2E fires a real consent log (the lead submit
 *       and notification edge fn are intercepted; the consent call is live).
 *  AC4: per-IP rate limit returns 429 after 10 requests in a minute.
 *
 * Live-backend gated; rows are cleaned up per test (unique markers, suite
 * runs fullyParallel).
 */

const BYPASS_TOKEN = process.env.RECAPTCHA_E2E_BYPASS_TOKEN || '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || '';
const CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_KEY);
const CONFIG_REASON = 'Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (live consent_logs verification).';

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function supa(method: 'GET' | 'DELETE', pathAndQuery: string): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (method === 'GET') return res.json();
  return null;
}

async function cleanupByEmail(email: string): Promise<void> {
  await supa('DELETE', `consent_logs?user_email=eq.${encodeURIComponent(email)}`);
}

async function rateBucketCleanup(ip: string): Promise<void> {
  await supa('DELETE', `rate_limits?ip_address=eq.${encodeURIComponent(`consent-log:${ip}`)}`);
}

test.describe('/api/consent/log - server-side TCPA consent logging', () => {
  test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
  test.skip(!CONFIGURED, CONFIG_REASON);
  test.skip(({ isMobile }) => Boolean(isMobile), 'API/server-path spec - chromium project only');

  test('AC1: consent row saved with server-derived ip + user agent', async ({ request }) => {
    const email = 'delivered+consent-ac1@resend.dev';
    const ip = '203.0.113.61';
    await cleanupByEmail(email);
    await rateBucketCleanup(ip);

    const res = await request.post('/api/consent/log', {
      headers: { 'content-type': 'application/json', 'user-agent': CHROME_UA, 'x-real-ip': ip },
      data: {
        user_email: email,
        user_phone: '2015550166',
        consent_type: 'contact_form_submission',
        tcpa_consent: true,
        consent_text: 'consent spec row - safe to delete',
      },
    });
    expect(res.status()).toBe(200);

    const rows = (await supa(
      'GET',
      `consent_logs?user_email=eq.${encodeURIComponent(email)}&select=consent_type,tcpa_consent,ip_address,user_agent,consent_text`
    )) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].consent_type).toBe('contact_form_submission');
    expect(rows[0].tcpa_consent).toBe(true);
    expect(rows[0].ip_address).toBe(ip);
    expect(rows[0].user_agent).toBe(CHROME_UA);

    await cleanupByEmail(email);
    await rateBucketCleanup(ip);
  });

  test('AC2: missing consent_type -> 400, no row', async ({ request }) => {
    const email = 'delivered+consent-ac2@resend.dev';
    const ip = '203.0.113.62';
    await cleanupByEmail(email);
    await rateBucketCleanup(ip);

    const res = await request.post('/api/consent/log', {
      headers: { 'content-type': 'application/json', 'user-agent': CHROME_UA, 'x-real-ip': ip },
      data: { user_email: email, tcpa_consent: true },
    });
    expect(res.status()).toBe(400);
    const rows = (await supa(
      'GET',
      `consent_logs?user_email=eq.${encodeURIComponent(email)}&select=id`
    )) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(0);

    await rateBucketCleanup(ip);
  });

  test('AC3: ContactForm submission logs consent end-to-end', async ({ page }) => {
    test.skip(!BYPASS_TOKEN, 'Requires RECAPTCHA_E2E_BYPASS_TOKEN (form submit crosses the reCAPTCHA gate).');
    const email = 'delivered+consent-ac3@resend.dev';
    await cleanupByEmail(email);

    await page.route(/recaptcha|gstatic\.com\/recaptcha/, (route) => route.abort());
    await page.addInitScript(
      ({ token }) => {
        // @ts-expect-error - runtime stub
        window.grecaptcha = {
          enterprise: { ready: (cb: () => void) => cb(), execute: async () => token },
        };
      },
      { token: BYPASS_TOKEN }
    );
    // Intercept the lead submit + the notification edge fn so this test does
    // not create leads or send owner emails - ONLY the consent call runs live.
    await page.route('**/api/leads/submit', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
    );
    await page.route('**/functions/v1/send-lead-notification', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    );

    await page.goto('/contact', { waitUntil: 'domcontentloaded' });
    // Names must satisfy the form's letters-only regex (no digits - 'E2E' fails).
    await page.getByRole('textbox', { name: /first name/i }).fill('Consent');
    await page.getByRole('textbox', { name: /last name/i }).fill('Tester');
    await page.getByRole('textbox', { name: /email/i }).fill(email);
    await page.getByRole('textbox', { name: /phone/i }).fill('(201) 555-0166');
    // Exact name: the chatbot widget's "Type a message..." input also matches /message/i.
    await page.getByRole('textbox', { name: 'Message *' }).fill('Consent logging E2E check - safe to delete.');
    await page.getByRole('radio', { name: /email/i }).check();
    await page.getByRole('checkbox', { name: /i agree|terms/i }).first().check();

    const [consentRes] = await Promise.all([
      page.waitForResponse('**/api/consent/log'),
      // exact: the chatbot widget also has a "Send message" icon button.
      page.getByRole('button', { name: 'Send Message', exact: true }).click(),
    ]);
    expect(consentRes.status()).toBe(200);

    const rows = (await supa(
      'GET',
      `consent_logs?user_email=eq.${encodeURIComponent(email)}&select=consent_type,tcpa_consent,ip_address`
    )) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].consent_type).toBe('contact_form_submission');
    expect(rows[0].tcpa_consent).toBe(true);

    await cleanupByEmail(email);
  });

  test('AC4: rate limited after 10 requests per minute per IP', async ({ request }) => {
    const email = 'delivered+consent-ac4@resend.dev';
    const ip = '203.0.113.64';
    await cleanupByEmail(email);
    await rateBucketCleanup(ip);

    let got429 = false;
    for (let i = 0; i < 11; i += 1) {
      const res = await request.post('/api/consent/log', {
        headers: { 'content-type': 'application/json', 'user-agent': CHROME_UA, 'x-real-ip': ip },
        data: { user_email: email, consent_type: 'estimate_form', tcpa_consent: true },
      });
      if (res.status() === 429) {
        got429 = true;
        break;
      }
      expect(res.status()).toBe(200);
    }
    expect(got429, '11th request within the window must be throttled').toBe(true);

    await cleanupByEmail(email);
    await rateBucketCleanup(ip);
  });
});
