import { test, expect } from '@playwright/test';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';

/**
 * Full-stack regression guard for the 2026-07-12 production incident: a Home
 * Care booking submitted with an email but NO phone number died at the
 * Supabase insert with Postgres 23502 - public.leads.phone is NOT NULL, the
 * form sent `phone: null`, and the visitor saw "Something went wrong".
 * (leads.email is equally NOT NULL, so phone-only submissions failed the same
 * way.) The fix normalizes missing contact fields to '' server-side in
 * src/lib/leadSanitize.ts.
 *
 * These specs drive the REAL stack - browser form → /api/leads/submit →
 * reCAPTCHA gate (E2E bypass token) → Supabase insert → notifications - and
 * then verify the row landed in the live DB. They need:
 *   - a server running with RECAPTCHA_E2E_BYPASS_TOKEN + real Supabase/notify env
 *   - RECAPTCHA_E2E_BYPASS_TOKEN, NEXT_PUBLIC_SUPABASE_URL and
 *     SUPABASE_SECRET_KEY in THIS process env (token for the browser stub,
 *     keys for DB verification + cleanup)
 *
 * Acceptance criteria:
 *  AC1: Booking with email only (no phone) -> success UI, HTTP 200, lead row
 *       saved with phone '' (the incident scenario).
 *  AC2: Booking with phone only (no email) -> success UI, HTTP 200, lead row
 *       saved with email ''.
 *  AC3: Booking with neither email nor phone -> inline client error, NO
 *       request to /api/leads/submit.
 *  AC4: Multi-service estimate request with email only -> success UI, row
 *       saved with source home_care_estimate_request.
 *  AC5: A 200 {challenge:'recaptcha_v2'} response must NOT show the success
 *       screen (it used to - the booking was silently lost). With no v2 key
 *       locally, requestChallenge resolves null -> "Verification needed"
 *       toast. (Mocked route: no live backend needed, but kept here with the
 *       rest of the booking-form ACs.)
 *
 * The suite runs fullyParallel, so every test uses its OWN row markers
 * (email/phone) and cleans up only those - a shared beforeEach/afterEach
 * cleanup would delete a sibling test's rows mid-assertion. Emails use
 * Resend's delivery sink (delivered+label@resend.dev) so any follow-up email
 * is harmless. A failed run can leave its row behind; the next run's
 * start-of-test cleanup removes it.
 */

const BYPASS_TOKEN = process.env.RECAPTCHA_E2E_BYPASS_TOKEN || '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || '';
const CONFIGURED = Boolean(BYPASS_TOKEN && SUPABASE_URL && SUPABASE_KEY);
const CONFIG_REASON =
  'Requires RECAPTCHA_E2E_BYPASS_TOKEN + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY ' +
  '(server must run with the same bypass token).';

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
  await supa('DELETE', `follow_up_queue?lead_email=eq.${encodeURIComponent(email)}`);
  await supa('DELETE', `leads?email=eq.${encodeURIComponent(email)}`);
}

async function cleanupByPhone(phone: string): Promise<void> {
  await supa('DELETE', `leads?phone=eq.${encodeURIComponent(phone)}&email=eq.`);
}

// Give each test its own rate-limit bucket (TEST-NET-3 x-real-ip on the submit
// request) and reset it. All browser submits otherwise share the 'unknown'
// bucket, and a full-suite run has enough live submits to trip the 5/min
// limiter - the submit 429s and the test fails on a red herring.
async function pinRateLimitBucket(page: import('@playwright/test').Page, ip: string): Promise<void> {
  await supa('DELETE', `rate_limits?ip_address=eq.${encodeURIComponent(`lead-submit:${ip}`)}`);
  await page.route('**/api/leads/submit', (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-real-ip': ip } })
  );
}

test.describe('Home Care booking - email-or-phone contact (23502 regression)', () => {
  test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
  test.skip(!CONFIGURED, CONFIG_REASON);
  // Server-path spec: one browser project is enough, and each mobile re-run
  // doubles the REAL Telegram/email notifications sent to the owner.
  test.skip(({ isMobile }) => Boolean(isMobile), 'server-path spec - chromium project only');

  test.beforeEach(async ({ page }) => {
    // The real reCAPTCHA script can't mint tokens for localhost; stub it to
    // return the E2E bypass token the server is configured to accept.
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
  });

  test('AC1: email only, no phone - the incident scenario', async ({ page }) => {
    const email = 'delivered+hcb-ac1@resend.dev';
    await cleanupByEmail(email);
    await pinRateLimitBucket(page, '203.0.113.81');

    await page.goto('/home-care/book?task=caulk_windows');
    await page.getByLabel(/name/i).first().fill('E2E BookingTest');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/zip/i).fill('07039');

    const [response] = await Promise.all([
      page.waitForResponse('**/api/leads/submit'),
      page.getByRole('button', { name: /request this service/i }).click(),
    ]);
    expect(response.status(), 'submit must not 500 - 23502 regression').toBe(200);
    await expect(page.getByText(/request sent/i)).toBeVisible({ timeout: 15000 });

    const rows = (await supa(
      'GET',
      `leads?email=eq.${encodeURIComponent(email)}&source=eq.home_care_booking&select=first_name,email,phone,inquiry_type,zip_code&order=created_at.desc&limit=1`
    )) as Array<Record<string, unknown>>;
    expect(rows, 'lead row must be saved').toHaveLength(1);
    expect(rows[0].phone, "missing phone must be stored as ''").toBe('');
    expect(rows[0].inquiry_type).toBe('estimate');
    expect(rows[0].zip_code).toBe('07039');

    await cleanupByEmail(email);
  });

  test('AC2: phone only, no email', async ({ page }) => {
    const phone = '(201) 555-0187';
    await cleanupByPhone(phone);
    await pinRateLimitBucket(page, '203.0.113.82');

    await page.goto('/home-care/book?task=caulk_windows');
    await page.getByLabel(/name/i).first().fill('E2E BookingTest');
    await page.getByLabel(/phone/i).fill(phone);
    await page.getByLabel(/zip/i).fill('07039');

    const [response] = await Promise.all([
      page.waitForResponse('**/api/leads/submit'),
      page.getByRole('button', { name: /request this service/i }).click(),
    ]);
    expect(response.status()).toBe(200);
    await expect(page.getByText(/request sent/i)).toBeVisible({ timeout: 15000 });

    const rows = (await supa(
      'GET',
      `leads?phone=eq.${encodeURIComponent(phone)}&source=eq.home_care_booking&select=email,phone&order=created_at.desc&limit=1`
    )) as Array<Record<string, unknown>>;
    expect(rows, 'lead row must be saved').toHaveLength(1);
    expect(rows[0].email, "missing email must be stored as ''").toBe('');

    await cleanupByPhone(phone);
  });

  test('AC3: neither email nor phone - blocked client-side, no API call', async ({ page }) => {
    let submitCalls = 0;
    await page.route('**/api/leads/submit', async (route) => {
      submitCalls += 1;
      await route.continue();
    });

    await page.goto('/home-care/book?task=caulk_windows');
    await page.getByLabel(/name/i).first().fill('E2E BookingTest');
    await page.getByRole('button', { name: /request this service/i }).click();

    await expect(page.getByText(/add an email or phone/i)).toBeVisible();
    expect(submitCalls).toBe(0);
  });

  test('AC5: v2-challenge response is NOT treated as success', async ({ page }) => {
    // Mock the submit endpoint: server says "low v3 score, show the checkbox".
    // Nothing was saved, so the form must not claim success.
    await page.route('**/api/leads/submit', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ challenge: 'recaptcha_v2' }),
      })
    );

    await page.goto('/home-care/book?task=caulk_windows');
    await page.getByLabel(/name/i).first().fill('E2E BookingTest');
    await page.getByLabel(/email/i).fill('delivered+hcb-ac5@resend.dev');
    await page.getByRole('button', { name: /request this service/i }).click();

    // No v2 site key in this env -> requestChallenge resolves null ->
    // cancelled path. The old code showed "Request sent!" here. (.first():
    // the text renders in the toast AND its a11y status region.)
    await expect(page.getByText(/verification needed/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/request sent/i)).toHaveCount(0);
  });

  test('AC4: multi-service estimate request with email only', async ({ page }) => {
    const email = 'delivered+hcb-ac4@resend.dev';
    await cleanupByEmail(email);
    await pinRateLimitBucket(page, '203.0.113.84');

    await page.goto('/home-care/book?tasks=caulk_windows,refresh_bath_caulk');
    await page.getByLabel(/name/i).first().fill('E2E BookingTest');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/zip/i).fill('07039');

    const [response] = await Promise.all([
      page.waitForResponse('**/api/leads/submit'),
      page.getByRole('button', { name: /request my estimate/i }).click(),
    ]);
    expect(response.status()).toBe(200);
    await expect(page.getByText(/estimate request sent/i)).toBeVisible({ timeout: 15000 });

    const rows = (await supa(
      'GET',
      `leads?email=eq.${encodeURIComponent(email)}&source=eq.home_care_estimate_request&select=phone,message&order=created_at.desc&limit=1`
    )) as Array<Record<string, unknown>>;
    expect(rows, 'lead row must be saved').toHaveLength(1);
    expect(rows[0].phone).toBe('');
    expect(String(rows[0].message)).toContain('caulk_windows');

    await cleanupByEmail(email);
  });
});
