import { test, expect } from '@playwright/test';
import { maskEmail } from '../src/lib/maskEmail';
import { canSendSignInLink, SENDABLE_STATUSES, VERIFY_TOKEN_TTL_HOURS } from '../src/lib/homecare/signInLink';

/**
 * The Home Care sign-in link, tested by BEHAVIOUR.
 *
 * The guards this replaces asserted that login/route.ts contained the string
 * `existing.status === 'active'`. That is not a test of anything a member
 * experiences: it passed happily on 2026-08-06, the day the owner's own link
 * silently went nowhere, and it would have gone red on a pure rename. What
 * actually failed that day was a decision - who gets a link - so that decision
 * is now a pure, exported function with its own tests, and the HTTP contract
 * around it is exercised over the wire.
 *
 * What is NOT covered here, deliberately: the successful send. Crossing this
 * route means passing reCAPTCHA, and unlike /api/leads/submit there is no
 * bypass token for it, so a green suite must not pretend to have proved
 * delivery. The send path is covered where it can be observed for real - the
 * route's own structured logging, and the admin lookup's mail history.
 */

test.describe('who may be sent a sign-in link', () => {
  test('active and pending members can; unsubscribed cannot', () => {
    expect(canSendSignInLink({ status: 'active' })).toBe(true);
    // The dead end this closed: signed up, never confirmed, and the member tab
    // used to answer them with silence while the signup tab beside it would
    // have re-sent the very same link.
    expect(canSendSignInLink({ status: 'pending' })).toBe(true);
    // They asked us to stop. A sign-in link is still mail we chose to send.
    expect(canSendSignInLink({ status: 'unsubscribed' })).toBe(false);
  });

  test('the sendable set is exactly those two statuses', () => {
    // Guards against a future status being waved through by a truthiness check.
    expect([...SENDABLE_STATUSES].sort()).toEqual(['active', 'pending']);
  });

  test('links last 48 hours, matching what both surfaces promise the member', () => {
    // The opt-in form and the admin resend toast both quote this number.
    expect(VERIFY_TOKEN_TTL_HOURS).toBe(48);
  });
});

test.describe('masking addresses for the log', () => {
  test('keeps the domain and both ends, and drops the middle', () => {
    expect(maskEmail('alextejena@me.com')).toBe('al***a@me.com');
    expect(maskEmail('jordancaruso@gmail.com')).toBe('jo***o@gmail.com');
  });

  test('never emits a complete local part', () => {
    for (const address of ['jo@example.com', 'a@example.com', 'abc@example.com']) {
      const local = address.slice(0, address.indexOf('@'));
      const masked = maskEmail(address);
      expect(masked).toContain('@example.com');
      // The whole local part must never survive - that is the only property
      // that keeps a log export from being a mailing list.
      expect(masked.slice(0, masked.indexOf('@'))).not.toBe(local);
    }
  });

  test('refuses to print anything it does not recognise as an address', () => {
    for (const junk of ['', '   ', 'not-an-address', '@nolocal.com', 'nodomain@', null, undefined]) {
      expect(maskEmail(junk as string)).toBe('***');
    }
  });

  test('trims surrounding whitespace but leaves case alone', () => {
    // Lowercasing is normalizeEmail's job and happens before this is called;
    // masking a value it was handed unchanged is the honest behaviour here.
    expect(maskEmail('  AlexTejena@Me.com  ')).toBe('Al***a@Me.com');
  });
});

test.describe('the login endpoint answers every caller the same way', () => {
  test('a honeypot submission is accepted and silently dropped', async ({ request }) => {
    const res = await request.post('/api/home-care/login', {
      data: { email: 'bot@example.com', honeypot: 'i am a bot' },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test('a request with no reCAPTCHA token is refused before any lookup', async ({ request }) => {
    const res = await request.post('/api/home-care/login', {
      data: { email: 'nobody@example.com' },
    });
    expect(res.status()).toBe(400);
  });

  test('a malformed body is refused without leaking anything', async ({ request }) => {
    const res = await request.post('/api/home-care/login', {
      headers: { 'Content-Type': 'application/json' },
      data: 'not json at all',
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid request');
  });
});

test.describe('the admin membership lookup is staff-only', () => {
  test('GET is refused without an admin session', async ({ request }) => {
    const res = await request.get('/api/admin/home-care/member?email=someone@example.com');
    expect(res.status()).toBe(401);
  });

  test('the resend POST is refused without an admin session', async ({ request }) => {
    const res = await request.post('/api/admin/home-care/member', {
      data: { email: 'someone@example.com' },
    });
    expect(res.status()).toBe(401);
  });
});
