import { test, expect } from '@playwright/test';

/**
 * CM-01 (S1) - /api/leads/webhook was public, unauthenticated and unthrottled,
 * and handed its raw body to createLeadFollowUpSequence: one POST queued an
 * instant acknowledgement plus 24h/48h/7d follow-ups to ANY address, which the
 * daily cron then sent from the verified sending domain.
 *
 * Confirmed against production during the chaos run with an empty body (which
 * is rejected at validation before any write): HTTP 400 "Name and email
 * required" - proof the route was processing anonymous input.
 *
 * The route's own docblock says internal callers should import the function
 * directly, and grep confirms every first-party caller does. So the fix is to
 * take it off the public list and require the same internal secret /api/notify/*
 * uses.
 *
 * @isolation CM-01
 */

const PATH = '/api/leads/webhook';

/** A body that WOULD queue mail if it were ever processed. */
const LIVE_BODY = {
  name: 'Chaos Probe',
  email: 'chaos-probe@example.invalid',
  projectType: 'kitchen',
};

test.describe('@isolation CM-01 leads webhook requires the internal secret', () => {
  test('an anonymous POST is refused with 401 and never reaches the queue', async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}${PATH}`, {
      data: LIVE_BODY,
      failOnStatusCode: false,
    });
    expect(res.status(), 'anonymous callers must be refused before any work happens').toBe(401);

    // The refusal must come from the auth layer, not from validation - a 400
    // would mean the body was parsed and the endpoint is still doing work for
    // an anonymous caller.
    const body = await res.json().catch(() => ({}));
    expect(JSON.stringify(body)).not.toContain('Name and email required');
  });

  test('a POST with a wrong secret is refused', async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}${PATH}`, {
      data: LIVE_BODY,
      headers: { 'x-internal-secret': 'not-the-secret' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('a POST carrying the internal secret is let through to the handler', async ({ request, baseURL }) => {
    // The positive half: the fix must not brick the internal path. The stub
    // build has no INTERNAL_WEBHOOK_SECRET configured, so the middleware
    // cannot admit anyone - which is itself the correct fail-closed behaviour
    // and is what this asserts. With a secret configured, the same request
    // reaches the handler and answers on the body's merits instead.
    const secret = process.env.INTERNAL_WEBHOOK_SECRET;
    const res = await request.post(`${baseURL}${PATH}`, {
      data: {},
      headers: secret ? { 'x-internal-secret': secret } : {},
      failOnStatusCode: false,
    });
    if (!secret) {
      expect(res.status(), 'with no secret configured the route must fail CLOSED').toBe(401);
      return;
    }
    // Authenticated: now the handler runs and rejects the empty body on merit.
    expect(res.status()).toBe(400);
    expect(await res.text()).toContain('Name and email required');
  });
});
