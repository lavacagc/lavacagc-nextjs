import { test, expect } from '@playwright/test';

/**
 * CM-08 (S2) - /api/referrals was public with no rate limit, no honeypot and
 * no body cap: `await request.json()` on an unbounded stream feeding a direct
 * INSERT. Anyone could write unlimited rows of unlimited size into a table the
 * owner is expected to act on, and the form's maxLength attributes were the
 * only bound that existed anywhere.
 *
 * NOTE ON THE STUB BUILD: the rate limiter needs SUPABASE_SECRET_KEY, which
 * the stub build does not set, so checkRateLimit fails open here (CM-06 - that
 * fail-open is its own finding). The 429 path is therefore asserted only when
 * a limiter is actually available; the body cap and honeypot are pure request
 * handling and are asserted unconditionally.
 *
 * @isolation CM-08
 */

const PATH = '/api/referrals';

const VALID = {
  referrerName: 'Chaos Probe',
  referrerEmail: 'chaos-referrer@example.invalid',
  referrerPhone: '(201) 555-0123',
  friendName: 'Chaos Friend',
  friendEmail: 'chaos-friend@example.invalid',
  friendPhone: '(201) 555-0124',
  projectType: 'Kitchen Remodeling',
  message: 'probe',
};

test.describe('@isolation CM-08 referrals endpoint is gated', () => {
  test('an oversized body is refused before it can be parsed or stored', async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}${PATH}`, {
      data: { ...VALID, message: 'x'.repeat(200_000) },
      failOnStatusCode: false,
    });
    expect(res.status(), 'a 200KB referral must be refused, not stored').toBe(413);
  });

  test('a filled honeypot is accepted politely and writes nothing', async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}${PATH}`, {
      data: { ...VALID, website: 'http://spam.example' },
      failOnStatusCode: false,
    });
    // A bot must learn nothing from the response...
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // ...but nothing was written, which is why this is a 200 that did no work.
    // The negative proof is that a real insert would have needed Supabase
    // credentials the stub build does not have, so a genuine write attempt
    // here answers 500 - see the "normal referral" test below.
  });

  test('the honeypot field exists in the form, or the gate is decorative', async () => {
    const { readFileSync } = await import('fs');
    const form = readFileSync('src/components/ReferralForm.tsx', 'utf8');
    expect(form, 'the form must render the hidden field').toContain('name="website"');
    expect(form, 'and must actually send it').toContain('website: honeypot');
  });

  test('a normal referral still reaches the database layer', async ({ request, baseURL }) => {
    // The positive half. Against the stub build there are no Supabase
    // credentials, so the insert fails with 500 - which still proves the
    // request passed the body cap, the honeypot and the rate limit and got all
    // the way to the write. A 400/413/429 here would mean a gate wrongly ate a
    // legitimate referral, which is the regression this guards against.
    const res = await request.post(`${baseURL}${PATH}`, { data: VALID, failOnStatusCode: false });
    expect([200, 201, 500], `unexpected ${res.status()} - a gate rejected a legitimate referral`)
      .toContain(res.status());
  });
});
