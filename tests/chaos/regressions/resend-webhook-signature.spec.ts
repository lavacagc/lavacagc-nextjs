import { test, expect } from '@playwright/test';
import { Webhook } from 'svix';

/**
 * /api/webhooks/resend trusts a request only if its Svix signature verifies.
 *
 * Regression guard for the 2026-10-31 dependency update: `svix` used to arrive
 * only as a dependency of `resend`, the patched `resend` dropped it, and the
 * route stopped compiling. It is now a direct dependency; this spec proves the
 * verification still accepts a correctly signed payload and refuses the rest.
 *
 * Event types are chosen so the handler stops before any database call.
 *
 * @isolation resend-webhook
 */

const PATH = '/api/webhooks/resend';

function signed(body: string, secret: string) {
  const id = `msg_${Date.now()}`;
  const timestamp = new Date();
  const signature = new Webhook(secret).sign(id, timestamp, body);
  return {
    'content-type': 'application/json',
    'svix-id': id,
    'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
    'svix-signature': signature,
  };
}

test.describe('@isolation Resend webhook signature', () => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  test.skip(!secret, 'needs RESEND_WEBHOOK_SECRET (set by playwright.config.ts on stub runs)');

  const body = JSON.stringify({ type: 'email.regression_probe', data: {} });

  test('a correctly signed event is accepted', async ({ request }) => {
    const res = await request.post(PATH, { data: body, headers: signed(body, secret!) });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: true });
  });

  test('an unsigned event is refused', async ({ request }) => {
    const res = await request.post(PATH, { data: body, headers: { 'content-type': 'application/json' } });
    expect(res.status()).toBe(400);
  });

  test('a body altered after signing is refused', async ({ request }) => {
    const headers = signed(body, secret!);
    const tampered = body.replace('regression_probe', 'delivered');
    const res = await request.post(PATH, { data: tampered, headers });
    expect(res.status()).toBe(400);
  });

  test('a signature made with another secret is refused', async ({ request }) => {
    const other = 'whsec_' + Buffer.from('some-other-secret-value').toString('base64');
    const res = await request.post(PATH, { data: body, headers: signed(body, other) });
    expect(res.status()).toBe(400);
  });
});
