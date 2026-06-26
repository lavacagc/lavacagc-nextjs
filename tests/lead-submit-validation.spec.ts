import { test, expect } from '@playwright/test';

/**
 * /api/leads/submit — input validation, body-size limit, and rate-limit
 * ordering. These paths short-circuit BEFORE reCAPTCHA/Supabase, so they run
 * locally without server secrets.
 *
 * Acceptance criteria:
 *  AC1: Body larger than 16 KB -> 413 (rejected before JSON parse).
 *  AC2: Malformed JSON -> 400 "Invalid request".
 *  AC3: Body failing the schema (wrong type / over-length field) -> 400.
 *  AC4: Honeypot present -> 200 success short-circuit.
 *  AC5: Valid shape but missing reCAPTCHA token -> 400 "Missing reCAPTCHA
 *       token" (schema keeps the envelope optional so the explicit check +
 *       owner alert still fire).
 *  AC6: A normal request is NOT 429'd locally — the rate limiter fails OPEN
 *       when its backend isn't provisioned, so it must fall through (not block
 *       real leads).
 */

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const URL = '/api/leads/submit';
const headers = { 'content-type': 'application/json', 'user-agent': CHROME_UA };

test.describe('/api/leads/submit — validation & limits', () => {
  test('AC1: oversized body -> 413', async ({ request }) => {
    const huge = 'a'.repeat(17 * 1024);
    const res = await request.post(URL, { headers, data: { message: huge, email: 'a@b.com' } });
    expect(res.status()).toBe(413);
  });

  test('AC2: malformed JSON -> 400', async ({ request }) => {
    const res = await request.post(URL, { headers, data: '{ not json' });
    expect(res.status()).toBe(400);
  });

  test('AC3: schema violation (wrong type) -> 400', async ({ request }) => {
    // recaptchaToken must be a string; a number is rejected by the schema.
    const res = await request.post(URL, { headers, data: { recaptchaToken: 12345, email: 'a@b.com' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('Invalid request');
  });

  test('AC4: honeypot -> 200 success', async ({ request }) => {
    const res = await request.post(URL, { headers, data: { honeypot: 'x', email: 'a@b.com' } });
    expect(res.status()).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  test('AC5: valid shape, missing reCAPTCHA token -> 400 specific error', async ({ request }) => {
    const res = await request.post(URL, { headers, data: { email: 'a@b.com' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/recaptcha/i);
  });

  test('AC6: normal request is not rate-limited locally (fails open)', async ({ request }) => {
    const res = await request.post(URL, {
      headers,
      data: { recaptchaToken: 'tok', recaptchaAction: 'contact_form', email: 'a@b.com', phone: '2015551234' },
    });
    // Limiter has no backend locally -> must NOT 429; falls through to reCAPTCHA.
    expect(res.status()).not.toBe(429);
  });
});
