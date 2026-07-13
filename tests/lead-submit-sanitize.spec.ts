import { test, expect } from '@playwright/test';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';

/**
 * Live-backend guard for the server-side lead sanitizer
 * (src/lib/leadSanitize.ts): NO payload that satisfies the business rule
 * "email or phone present" may ever be lost to a database constraint.
 *
 * Context: public.leads (dashboard-created, DDL not in repo) enforces
 * NOT NULL on first_name/last_name/email/phone/inquiry_type, CHECKs on
 * inquiry_type + contact_time_preference, integer/timestamptz column types,
 * and rejects unknown columns outright (PGRST204). Before the sanitizer, any
 * of those killed the whole insert: a Home Care booking without a phone died
 * with 23502 (2026-07-12 incident), and /request-estimate lost weeks of leads
 * to a 23514 in 2026-06.
 *
 * Acceptance criteria (all drive the REAL /api/leads/submit + live Supabase):
 *  AC1: inquiry_type outside the CHECK enum -> 200, row saved with
 *       inquiry_type 'contact' (fallback), NOT a 500.
 *  AC2: square_footage non-numeric + unknown column + junk
 *       contact_time_preference -> 200, row saved without those values.
 *  AC3: missing first/last name (email present) -> 200, row saved with
 *       fallback names.
 *  AC4: whitespace-only email + missing phone -> 400 "Email or phone is
 *       required" (whitespace is not a contact method), no row.
 *
 * NOTE: every saved row here fires ONE real ⚠️ "form warning" alert
 * (Telegram + email) - that alert IS part of the behavior under test.
 *
 * The suite runs fullyParallel, so each test uses its own `source` marker and
 * rate-limit bucket (x-real-ip) and cleans up only its own rows - shared
 * hooks would delete a sibling test's rows mid-assertion.
 *
 * Requires the same env as home-care-booking-contact-optional.spec.ts.
 */

const BYPASS_TOKEN = process.env.RECAPTCHA_E2E_BYPASS_TOKEN || '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || '';
const CONFIGURED = Boolean(BYPASS_TOKEN && SUPABASE_URL && SUPABASE_KEY);
const CONFIG_REASON =
  'Requires RECAPTCHA_E2E_BYPASS_TOKEN + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY ' +
  '(server must run with the same bypass token).';

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TEST_EMAIL = 'delivered+sanitize@resend.dev';

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

// Per-test isolation: unique source marker + unique TEST-NET-3 rate-limit
// bucket. Cleanup targets only this test's rows, so parallel siblings can't
// interfere with each other.
function testScope(n: number) {
  const source = `e2e_sanitize_ac${n}`;
  const ip = `203.0.113.7${n}`;
  const headers = { 'content-type': 'application/json', 'user-agent': CHROME_UA, 'x-real-ip': ip };
  const cleanup = async () => {
    // TEST_EMAIL is a Resend sink only tests use, so wiping all its follow-up
    // rows is safe even across parallel siblings (nothing asserts on them).
    await supa('DELETE', `follow_up_queue?lead_email=eq.${encodeURIComponent(TEST_EMAIL)}`);
    await supa('DELETE', `leads?source=eq.${source}`);
    await supa('DELETE', `rate_limits?ip_address=eq.${encodeURIComponent(`lead-submit:${ip}`)}`);
  };
  const newestRow = async (select: string): Promise<Record<string, unknown> | undefined> => {
    const rows = (await supa(
      'GET',
      `leads?source=eq.${source}&select=${select}&order=created_at.desc&limit=1`
    )) as Array<Record<string, unknown>>;
    return rows[0];
  };
  return { source, headers, cleanup, newestRow };
}

function payload(source: string, overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    recaptchaToken: BYPASS_TOKEN,
    recaptchaAction: 'e2e_sanitize',
    first_name: 'E2E',
    last_name: 'SanitizeTest',
    email: TEST_EMAIL,
    phone: '(201) 555-0188',
    inquiry_type: 'estimate',
    source,
    message: 'sanitize spec row - safe to delete',
    ...overrides,
  };
}

test.describe('/api/leads/submit - sanitizer keeps constraint-violating payloads alive', () => {
  test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
  test.skip(!CONFIGURED, CONFIG_REASON);
  // API-level spec (request fixture, no browser): running it per-project just
  // duplicates real DB writes + owner warning alerts.
  test.skip(({ isMobile }) => Boolean(isMobile), 'API-level spec - chromium project only');

  test('AC1: junk inquiry_type is mapped, not fatal', async ({ request }) => {
    const scope = testScope(1);
    await scope.cleanup();

    const res = await request.post('/api/leads/submit', {
      headers: scope.headers,
      data: payload(scope.source, { inquiry_type: 'services_intake' }),
    });
    expect(res.status(), 'a CHECK violation must not lose the lead').toBe(200);
    const row = await scope.newestRow('inquiry_type,email');
    expect(row, 'lead row must be saved').toBeTruthy();
    expect(row!.inquiry_type).toBe('contact');

    await scope.cleanup();
  });

  test('AC2: bad square_footage + unknown column + junk contact_time_preference are dropped, not fatal', async ({ request }) => {
    const scope = testScope(2);
    await scope.cleanup();

    const res = await request.post('/api/leads/submit', {
      headers: scope.headers,
      data: payload(scope.source, {
        square_footage: 'about 1200',
        contact_time_preference: 'whenever-works',
        some_future_field: 'x',
      }),
    });
    expect(res.status()).toBe(200);
    const row = await scope.newestRow('square_footage,contact_time_preference,email');
    expect(row).toBeTruthy();
    expect(row!.square_footage).toBeNull();
    expect(row!.contact_time_preference).toBeNull();
    expect(row!.email).toBe(TEST_EMAIL);

    await scope.cleanup();
  });

  test('AC3: missing names get fallbacks, not a 23502', async ({ request }) => {
    const scope = testScope(3);
    await scope.cleanup();

    const res = await request.post('/api/leads/submit', {
      headers: scope.headers,
      data: payload(scope.source, { first_name: null, last_name: null }),
    });
    expect(res.status()).toBe(200);
    const row = await scope.newestRow('first_name,last_name');
    expect(row).toBeTruthy();
    expect(row!.first_name).toBe('Visitor');
    expect(row!.last_name).toBe('Visitor');

    await scope.cleanup();
  });

  test('AC4: whitespace-only email + no phone -> clean 400, no row', async ({ request }) => {
    const scope = testScope(4);
    await scope.cleanup();

    const res = await request.post('/api/leads/submit', {
      headers: scope.headers,
      data: payload(scope.source, { email: '   ', phone: null }),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/email or phone/i);
    const row = await scope.newestRow('id');
    expect(row).toBeUndefined();

    await scope.cleanup();
  });
});
