import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import http from 'http';
import { createHmac } from 'crypto';
import {
  buildServiceQuoteEmail, buildVisitReminderEmail, buildServiceCompletedEmail,
} from '@/lib/homecare/serviceEmails';
import { buildVerificationEmail, buildWelcomeEmail } from '@/lib/homecare/lifecycleEmails';
import { BUSINESS_ADDRESS } from '@/lib/homecare/emailShell';
import { buildIcs } from '@/lib/homecare/ics';
import { easternVisitInstant } from '@/lib/homecare/visitSchedule';
import { currentSeason, seasonForTaskVisit } from '@/lib/homecare/season';

/**
 * Reviewer-visible evidence for the Home Care service-quote loop.
 *
 * Everything here is a CAPTURE, not a new assertion of behaviour - the 47
 * acceptance criteria are covered by service-quotes*.spec.ts. This renders the
 * surfaces a human actually sees so a reviewer can look at them:
 *
 *   A. the three service emails, rendered from the pure builders (no send),
 *   B. both .ics variants as files,
 *   C. (gated) the admin booking screen, the member's portal card and the
 *      night-before cron, driven against a stubbed Supabase.
 *
 * No email is ever sent: A and B call the builders directly, and C never
 * touches /send or /complete.
 *
 * Run recipe for C:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9415 \
 *   SUPABASE_SECRET_KEY=sb-stub-secret \
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb-stub-publishable \
 *   LISTINGS_ACCESS_SECRET=sq-e2e-secret CRON_SECRET=sq-e2e-cron \
 *   RESEND_API_KEY=re_stub npx next dev -p 3110
 *
 *   SQ_UI_E2E=1 TEST_URL=http://127.0.0.1:3110 \
 *   npx playwright test tests/service-quotes-evidence.spec.ts --project=chromium
 */
const root = process.cwd();
const EVIDENCE_DIR = process.env.SQ_EVIDENCE_DIR || join(root, 'test-results', 'service-quotes-evidence');

const UNSUB = 'https://www.lavacagc.com/api/home-care/unsubscribe?token=TOK';
const PREFS = 'https://www.lavacagc.com/preferences?token=PREF';

/**
 * The brand logo is absolute on the production host by design - a mail client
 * fetches it itself. Served from this checkout so the capture shows what the
 * recipient sees rather than the live site's bot filter 403ing the browser.
 */
async function serveBrandAssets(page: Page) {
  await page.route('https://www.lavacagc.com/**', (route) =>
    route.fulfill({ path: join(root, 'public', new URL(route.request().url()).pathname) }).catch(() => route.abort()),
  );
}

async function capture(page: Page, name: string, html: string) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(EVIDENCE_DIR, `${name}.html`), html);
  await serveBrandAssets(page);
  await page.setViewportSize({ width: 720, height: 1200 });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: join(EVIDENCE_DIR, `${name}.png`), fullPage: true });
}

// ---------------------------------------------------------------------------
// A. The three service emails, rendered. Pure builders - nothing is sent.
// ---------------------------------------------------------------------------

test('evidence: the service quote email as the customer receives it', async ({ page }) => {
  const mail = buildServiceQuoteEmail({
    recipientName: 'Jordan Caruso',
    scopeSummary: 'Gutter clearing and a dryer-vent clean',
    estimateUrl: 'https://app.qbo.intuit.com/app/estimate?txnId=1042',
    visitLength: 'About 2-3 hours, one visit',
    personalNote: 'Happy to do both in one trip while we have the ladders out.',
    unsubscribeUrl: UNSUB, preferencesUrl: PREFS,
    now: new Date(Date.UTC(2026, 6, 31, 15)),
  });
  // The claims the owner signed off on, and the ones deliberately left out.
  expect(mail.html).toContain('5.0 on Google');
  expect(mail.html).toContain('1-year workmanship warranty');
  expect(mail.html).toContain('NJ HIC# 13VH13373800');
  expect(mail.html).not.toMatch(/schluter|lifetime/i);
  expect(mail.html).not.toMatch(/\breview\b/i);
  await capture(page, '01-email-service-quote', mail.html);
  writeFileSync(join(EVIDENCE_DIR, '01-email-service-quote.txt'), `Subject: ${mail.subject}\n\n${mail.text}`);
});

test('evidence: the night-before visit reminder', async ({ page }) => {
  const mail = buildVisitReminderEmail({
    recipientName: 'Jordan Caruso',
    services: ['Clean gutters & downspouts', 'Clean the dryer vent'],
    address: '14 Maple Ave, West Orange, NJ 07052',
    timeWindow: '8:00 - 11:00am', visitDateLabel: 'Wed 5 Aug',
    portalUrl: 'https://www.lavacagc.com/home-care/checklist',
    unsubscribeUrl: UNSUB, preferencesUrl: PREFS,
  });
  expect(mail.html).toContain("We'll text you when we're on our way");
  await capture(page, '02-email-visit-reminder', mail.html);
  writeFileSync(join(EVIDENCE_DIR, '02-email-visit-reminder.txt'), `Subject: ${mail.subject}\n\n${mail.text}`);
});

test('evidence: the post-visit feedback email', async ({ page }) => {
  const mail = buildServiceCompletedEmail({
    recipientName: 'Jordan Caruso',
    services: ['the gutters', 'the dryer vent'],
    feedbackUrl: 'https://www.lavacagc.com/feedback?token=F',
    unsubscribeUrl: UNSUB, preferencesUrl: PREFS,
  });
  // CP6: the "we'll come back" promise precedes any mention of a public word.
  const fix = mail.html.indexOf("If anything isn't right");
  const word = mail.html.search(/other Northern NJ homeowners/i);
  expect(fix).toBeGreaterThan(-1);
  expect(fix).toBeLessThan(word);
  await capture(page, '03-email-service-completed', mail.html);
  writeFileSync(join(EVIDENCE_DIR, '03-email-service-completed.txt'), `Subject: ${mail.subject}\n\n${mail.text}`);
});

/**
 * The first commit on this branch moved verification and welcome off an older
 * 560px shell with a different header and no CAN-SPAM postal address. Captured
 * beside the quote above so the three read as one company.
 */
test('evidence: verification and welcome now share the same shell', async ({ page }) => {
  const verify = buildVerificationEmail({
    firstName: 'Jordan',
    verifyUrl: 'https://www.lavacagc.com/api/home-care/verify?token=V',
    unsubscribeUrl: UNSUB,
  });
  const welcome = buildWelcomeEmail({
    firstName: 'Jordan',
    checklistUrl: 'https://www.lavacagc.com/home-care/checklist',
    unsubscribeUrl: UNSUB, preferencesUrl: PREFS,
    baseUrl: 'https://www.lavacagc.com',
  });
  for (const mail of [verify, welcome]) {
    expect(mail.html).toContain(BUSINESS_ADDRESS);
    expect(mail.text).toContain(BUSINESS_ADDRESS);
    expect(mail.html).toContain('max-width:600px');
  }
  await capture(page, '18-email-verification', verify.html);
  await capture(page, '19-email-welcome', welcome.html);
});

// ---------------------------------------------------------------------------
// B. Both .ics variants, side by side, as files a reviewer can open.
// ---------------------------------------------------------------------------

test('evidence: the owner .ics carries the ops alarms, the customer .ics carries none', () => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const args = {
    uid: 'lavaca-visit-evidence-1',
    start: new Date('2026-08-05T12:00:00Z'),
    end: new Date('2026-08-05T15:00:00Z'),
    services: ['Clean gutters & downspouts', 'Clean the dryer vent'],
    address: '14 Maple Ave, West Orange, NJ 07052',
    customerName: 'Jordan Caruso',
    customerPhone: '(201) 555-0134',
    now: new Date('2026-07-31T12:00:00Z'),
  };

  const owner = buildIcs({ ...args, variant: 'owner' });
  const customer = buildIcs({ ...args, variant: 'customer' });

  expect(owner.match(/BEGIN:VALARM/g)?.length).toBe(2);
  expect(owner).toContain('TRIGGER;VALUE=DATE-TIME:');
  expect(owner).not.toContain('TRIGGER:-PT');
  expect(customer).not.toContain('VALARM');
  expect(customer).not.toMatch(/text the customer/i);

  writeFileSync(join(EVIDENCE_DIR, '04-owner-visit.ics'), owner);
  writeFileSync(join(EVIDENCE_DIR, '05-customer-visit.ics'), customer);
});

// ---------------------------------------------------------------------------
// C. Live UI - real Next server + stubbed Supabase REST. See the recipe above.
// ---------------------------------------------------------------------------

const RUN_UI = process.env.SQ_UI_E2E === '1';
const STUB_PORT = Number(process.env.SQ_STUB_PORT || 9415);
const ACCESS_SECRET = process.env.SQ_ACCESS_SECRET || 'sq-e2e-secret';
const CRON_SECRET = process.env.SQ_CRON_SECRET || 'sq-e2e-cron';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:3110';

const MEMBER_ID = 'dddddddd-4444-4444-8444-444444444444';
const MEMBER_EMAIL = 'jordan.caruso@example.com';

interface Row { [k: string]: unknown }

test.describe('service quotes: admin, portal and cron (live UI)', () => {
  test.skip(!RUN_UI, 'Needs the stub-backed server - see the run recipe at the top of this spec.');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  const CATALOG = [
    { key: 'clean_gutters', title: 'Clean gutters & downspouts', blurb: 'Clear the runs and flush the downspouts.', applies_to: ['all'], stages: ['all'], seasons: ['fall', 'spring'], frequency: 'biannual', diy_or_pro: 'pro', bookable: true, est_cost_low: 180, est_cost_high: 320, priority: 10, starter: false, active: true },
    { key: 'clean_dryer_vent', title: 'Clean the dryer vent', blurb: 'Lint buildup is a top home-fire cause.', applies_to: ['all'], stages: ['all'], seasons: ['spring', 'summer', 'fall', 'winter'], frequency: 'annual', diy_or_pro: 'pro', bookable: true, est_cost_low: 100, est_cost_high: 200, priority: 8, starter: false, active: true },
    { key: 'furnace_tune_up', title: 'Furnace tune-up', blurb: 'A pro service before the first cold snap.', applies_to: ['all'], stages: ['all'], seasons: ['fall'], frequency: 'annual', diy_or_pro: 'pro', bookable: true, est_cost_low: 150, est_cost_high: 250, priority: 7, starter: false, active: true },
    { key: 'test_smoke_co', title: 'Test smoke & CO detectors', blurb: 'Press test on every alarm.', applies_to: ['all'], stages: ['all'], seasons: ['spring', 'summer', 'fall', 'winter'], frequency: 'quarterly', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 6, starter: false, active: true },
    // Year-round so the completion labels below land on whatever season tab the
    // portal opens on, whenever this runs.
    { key: 'seal_deck', title: 'Seal the deck', blurb: 'A coat before the weather turns.', applies_to: ['all'], stages: ['all'], seasons: ['spring', 'summer', 'fall', 'winter'], frequency: 'annual', diy_or_pro: 'pro', bookable: false, est_cost_low: null, est_cost_high: null, priority: 5, starter: false, active: true },
  ];

  // The customer arrived through the Home Care booking form, which writes its
  // task keys into the lead message - that marker is what pre-fills the quote.
  const LEADS: Row[] = [{
    id: 'lead-1', first_name: 'Jordan', last_name: 'Caruso',
    // Stored exactly as typed (autofilled mixed case) - IN6.
    email: 'Jordan.Caruso@Example.com', phone: '(201) 555-0134',
    address: '14 Maple Ave', city: 'West Orange', zip_code: '07052',
    source: 'home_care_booking',
    message: 'Booking request from the Home Care checklist (tasks: clean_gutters, clean_dryer_vent)',
    created_at: '2026-07-28T14:02:00+00:00',
  }];

  const db: Record<string, Row[]> = {
    leads: LEADS,
    homeowners: [],
    homeowner_maintenance: [],
    follow_up_queue: [],
    maintenance_catalog: CATALOG as unknown as Row[],
    home_profiles: [],
  };

  let stub: http.Server;
  const requests: string[] = [];

  const TIMESTAMPS = ['scheduled_start', 'scheduled_end', 'scheduled_at', 'visit_start', 'created_at', 'sent_at', 'completed_at', 'updated_at'];
  /** PostgREST spells a timestamptz "…+00:00", not "….000Z". Same instant. */
  const asPostgrest = (row: Row): Row => {
    const out: Row = { ...row };
    for (const col of TIMESTAMPS) {
      const v = out[col];
      if (typeof v !== 'string') continue;
      const at = new Date(v);
      if (!Number.isNaN(at.getTime())) out[col] = at.toISOString().replace(/\.000Z$/, 'Z').replace(/Z$/, '+00:00');
    }
    return out;
  };

  const likeRegex = (pattern: string) => {
    const literal = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let rx = '';
    for (let i = 0; i < pattern.length; i += 1) {
      const c = pattern[i];
      if (c === '\\') { rx += literal(pattern[++i] ?? ''); continue; }
      rx += c === '%' || c === '*' ? '.*' : c === '_' ? '.' : literal(c);
    }
    return new RegExp(`^${rx}$`, 'i');
  };

  test.beforeAll(async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    stub = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${STUB_PORT}`);
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const json = (v: unknown, code = 200) => {
          res.writeHead(code, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(v));
        };
        // The admin session middleware verifies through Supabase auth.
        if (url.pathname === '/auth/v1/user') {
          return json({ id: 'admin-1', aud: 'authenticated', role: 'authenticated', email: 'alex@lavacagc.com' });
        }
        if (!url.pathname.startsWith('/rest/v1/')) return json({}, 404);

        const table = url.pathname.replace('/rest/v1/', '').split('?')[0];
        requests.push(`${req.method} ${table}${url.search}`);
        const rows = db[table] ?? (db[table] = []);

        const applyFilters = (input: Row[]) => {
          let out = [...input];
          for (const [k, v] of url.searchParams) {
            if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
            const [op, ...rest] = v.split('.');
            const val = rest.join('.');
            if (op === 'eq') {
              const wantedAt = new Date(val).getTime();
              out = out.filter((r) => {
                if (String(r[k]) === val) return true;
                if (Number.isNaN(wantedAt) || typeof r[k] !== 'string') return false;
                return new Date(r[k] as string).getTime() === wantedAt;
              });
            }
            if (op === 'ilike') out = out.filter((r) => likeRegex(val).test(String(r[k])));
            if (op === 'not' && val === 'is.null') out = out.filter((r) => r[k] !== null && r[k] !== undefined);
            if (op === 'gte') out = out.filter((r) => new Date(String(r[k])).getTime() >= new Date(val).getTime());
            if (op === 'lt') out = out.filter((r) => new Date(String(r[k])).getTime() < new Date(val).getTime());
            if (op === 'in') {
              const wanted = new Set(val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')));
              out = out.filter((r) => wanted.has(String(r[k])));
            }
          }
          return out;
        };

        if (req.method === 'GET') return json(applyFilters(rows).map(asPostgrest));
        if (req.method === 'POST') {
          const payload = JSON.parse(body || '[]') as Row | Row[];
          const arr = Array.isArray(payload) ? payload : [payload];
          const onConflict = url.searchParams.get('on_conflict');
          const written: Row[] = [];
          for (const r of arr) {
            if (onConflict) {
              const keys = onConflict.split(',');
              const idx = rows.findIndex((e) => keys.every((k) => String(e[k]) === String(r[k])));
              if (idx >= 0) { rows[idx] = { ...rows[idx], ...r }; written.push(rows[idx]); continue; }
            }
            const created = { id: `${table}-${rows.length + 1}`, ...r };
            rows.push(created);
            written.push(created);
          }
          return json(written.map(asPostgrest), 201);
        }
        if (req.method === 'PATCH') {
          const patch = JSON.parse(body || '{}') as Row;
          const targets = applyFilters(rows);
          for (const t of targets) Object.assign(t, patch);
          return json(targets.map(asPostgrest));
        }
        json([]);
      });
    });
    await new Promise<void>((r) => stub.listen(STUB_PORT, '127.0.0.1', r));
  });

  test.afterAll(async () => {
    if (stub) await new Promise((r) => stub.close(r));
  });

  const b64url = (b: Buffer) => b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  function mintCookie(homeownerId: string): string {
    const payload = b64url(Buffer.from(`${homeownerId}.${Math.floor(Date.now() / 1000)}`));
    const sig = b64url(createHmac('sha256', ACCESS_SECRET).update(payload).digest());
    return `${payload}.${sig}`;
  }

  /**
   * The admin pages sit behind a Supabase session. @supabase/ssr reads the
   * chunked `sb-<ref>-auth-token` cookie and verifies it against
   * `${SUPABASE_URL}/auth/v1/user`, which the stub answers above.
   */
  function adminCookie(): { name: string; value: string } {
    const ref = new URL(process.env.SQ_STUB_URL || `http://127.0.0.1:${STUB_PORT}`).hostname.split('.')[0];
    const session = {
      access_token: 'stub-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'stub-refresh-token',
      user: { id: 'admin-1', aud: 'authenticated', role: 'authenticated', email: 'alex@lavacagc.com' },
    };
    return {
      name: `sb-${ref}-auth-token`,
      value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64')}`,
    };
  }

  /** The dev badge and the floating chat bubble sit over the controls. */
  const declutter = async (page: Page) => {
    await page.evaluate(() => document.querySelector('nextjs-portal')?.remove()).catch(() => {});
    await page.addStyleTag({ content: '.z-\\[9999\\] { display: none !important; }' }).catch(() => {});
  };
  const shot = async (page: Page, name: string, full = true) => {
    await declutter(page);
    await page.screenshot({ path: join(EVIDENCE_DIR, name), fullPage: full });
  };

  // The visit is booked for tomorrow, Eastern, so the reminder cron's window
  // and the portal's "Tomorrow" state are both exercised for real.
  const easternToday = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)!.value;
    return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')) };
  };
  const visitDay = () => {
    const { y, m, d } = easternToday();
    const t = new Date(Date.UTC(y, m - 1, d + 1));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
  };

  /**
   * Open the admin form and look the customer up.
   *
   * The whole interaction retries: this is a client component behind a dev
   * server, and a click that lands before hydration is simply dropped - the
   * form then sits there looking filled in with no request in flight.
   */
  async function openAndLookUp(page: Page) {
    if (process.env.SQ_DEBUG) {
      page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 300)));
      page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 400)));
      page.on('requestfailed', (r) => console.log('REQFAILED', r.url().slice(0, 140), r.failure()?.errorText));
    }
    await page.context().addCookies([{ ...adminCookie(), url: BASE }]);
    await expect(async () => {
      // Re-navigated on each attempt: the dev server aborts a chunk fetch while
      // it recompiles, and a page that lost one never hydrates at all.
      await page.goto('/vaca-mgmt/send-service-quote', { waitUntil: 'load', timeout: 60_000 });
      await expect(page.getByText('Send a service quote')).toBeVisible({ timeout: 20_000 });
      // Round 7: the free-text box is gone - the typeahead is the only door.
      // The REST stub answers the search, so the member appears as a hit.
      await page.getByTestId('customer-search-input').fill(MEMBER_EMAIL);
      await page.locator('[data-testid^="customer-row-"]').first().click();
      // IN1+IN2: the task keys in the lead message resolved to catalog titles,
      // pre-selected, and rolled into the scope summary the email carries.
      await expect(page.getByTestId('sq-scope')).toHaveValue(/gutters/i, { timeout: 10_000 });
    }).toPass({ timeout: 150_000 });
  }

  test('SQ/IN: the quote form opens pre-filled from the customer\'s own request', async ({ page }) => {
    await page.context().addCookies([{ ...adminCookie(), url: BASE }]);
    await page.goto('/vaca-mgmt/send-service-quote', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await expect(page.getByText('Send a service quote')).toBeVisible({ timeout: 60_000 });
    await shot(page, '06-admin-quote-form-empty.png');

    // IN6: typed lowercase, stored mixed case - the lookup still finds them.
    await openAndLookUp(page);
    await expect(page.getByText('Their past requests')).toBeVisible();
    const scope = page.getByTestId('sq-scope');
    await shot(page, '07-admin-quote-prefilled.png');
    writeFileSync(join(EVIDENCE_DIR, '07-scope-summary.txt'), await scope.inputValue());
  });

  test('SC/RM: booking a visit creates a pending homeowner, books the window and queues one reminder', async ({ page }) => {
    await openAndLookUp(page);

    await page.getByTestId('sq-date').fill(visitDay());
    const posted = page.waitForResponse((r) => r.url().includes('/api/admin/service-quote/schedule') && r.request().method() === 'POST');
    await page.getByTestId('sq-schedule').click();
    const scheduleBody = await (await posted).json();
    writeFileSync(join(EVIDENCE_DIR, '08-schedule-response.json'), JSON.stringify(scheduleBody, null, 2));
    expect(scheduleBody.reminder).toBe('queued');

    // The toast is what the owner actually sees.
    await expect(page.getByText('Visit scheduled').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Reminder queued for 7:30pm the night before.', { exact: true })).toBeVisible();
    await shot(page, '08-admin-visit-scheduled-toast.png');

    // SC2+SC3: the record scheduling created can never receive marketing.
    const owner = db.homeowners[0];
    expect(owner).toBeTruthy();
    expect(owner.status).toBe('pending');
    expect(owner.source).toBe('service_quote');
    // SC5: no verification email - the customer never asked for one.
    expect(owner.verify_token ?? null).toBeNull();

    // SC4+SC8: window, address, status and a season the task renders in.
    const booked = db.homeowner_maintenance.filter((r) => r.scheduled_start);
    expect(booked.length).toBe(2);
    for (const r of booked) {
      expect(r.status).toBe('booked');
      expect(r.service_address).toContain('14 Maple Ave');
      expect(r.season).toBe(seasonForTaskVisit(
        new Date(`${visitDay()}T12:00:00Z`),
        CATALOG.find((c) => c.key === r.task_key)!.seasons,
      ));
    }

    // RM1+RM11: exactly one reminder row, keyed on the visit it belongs to.
    const queued = db.follow_up_queue.filter((r) => r.follow_up_type === 'visit_reminder_1d');
    expect(queued.length).toBe(1);
    expect(queued[0].status).toBe('pending');
    expect(new Date(String(queued[0].visit_start)).getTime())
      .toBe(easternVisitInstant(visitDay(), '08:00').getTime());

    writeFileSync(join(EVIDENCE_DIR, '09-persisted-state.json'), JSON.stringify({
      homeowners: db.homeowners,
      homeowner_maintenance: db.homeowner_maintenance,
      follow_up_queue: db.follow_up_queue,
    }, null, 2));

    // CP9/SC14: the booking is on screen with its own close-out controls.
    // Neither is clicked - /complete sends a real email, so it stays untouched.
    const bookings = page.getByTestId('sq-bookings');
    await expect(bookings).toBeVisible();
    await expect(page.getByTestId('sq-complete').first()).toBeVisible();
    await expect(page.getByTestId('sq-cancel').first()).toBeVisible();
    await page.locator('[toast-close]').first().click(); // else it covers the controls
    await expect(page.getByText('Visit scheduled')).toHaveCount(0);
    await declutter(page);
    await bookings.scrollIntoViewIfNeeded();
    await bookings.screenshot({ path: join(EVIDENCE_DIR, '10-admin-bookings-on-the-books.png') });
  });

  test('PT: the member sees the visit on their portal and can download the alarm-free .ics', async ({ page }) => {
    const owner = db.homeowners[0];
    owner.id = MEMBER_ID; // stable id for the signed cookie
    // The portal case is the OTHER half of SC1: an existing active member whose
    // visit was booked. The record scheduling created for a walk-in stays
    // 'pending' - that state is captured as it was written in
    // 09-persisted-state.json, and the task route refuses a write from it.
    owner.status = 'active';
    for (const r of db.homeowner_maintenance) r.homeowner_id = MEMBER_ID;

    // PT5: work La Vaca performed is labelled; a task the member ticked
    // themselves is not. Both are filed under the season on screen.
    const season = currentSeason();
    const stamp = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400_000).toISOString();
    db.homeowner_maintenance.push(
      { id: 'hm-hist-1', homeowner_id: MEMBER_ID, task_key: 'seal_deck', season, status: 'done', completed_at: stamp(3), completed_by: 'lavaca', updated_at: stamp(3), scheduled_start: null, scheduled_end: null, service_address: null },
      { id: 'hm-hist-2', homeowner_id: MEMBER_ID, task_key: 'test_smoke_co', season, status: 'done', completed_at: stamp(2), completed_by: 'homeowner', updated_at: stamp(2), scheduled_start: null, scheduled_end: null, service_address: null },
    );

    await page.context().addCookies([{ name: 'hc_access', value: mintCookie(MEMBER_ID), url: BASE }]);
    const card = page.getByTestId('upcoming-visit');
    await expect(async () => {
      await page.goto('/home-care/checklist', { waitUntil: 'load', timeout: 60_000 });
      await expect(page).toHaveURL(/home-care\/checklist/);
      await expect(card).toBeVisible({ timeout: 20_000 });
    }).toPass({ timeout: 150_000 });
    // PT2: tomorrow renders in the prominent state.
    await expect(card).toContainText('Coming up - tomorrow');
    await expect(card).toContainText('Clean gutters & downspouts');
    await expect(card).toContainText("We'll text you when we're on our way.");
    await declutter(page);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(EVIDENCE_DIR, '11-portal-visit-card.png'), fullPage: true });
    await card.screenshot({ path: join(EVIDENCE_DIR, '12-portal-visit-card-closeup.png') });

    // PT3: the .ics comes off the portal, and it is the customer variant.
    const download = page.waitForEvent('download');
    await card.getByRole('link', { name: 'Add to calendar' }).click();
    const file = await download;
    const path = join(EVIDENCE_DIR, '13-portal-downloaded.ics');
    await file.saveAs(path);
    const ics = await (await import('fs/promises')).readFile(path, 'utf8');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).not.toContain('VALARM');
    expect(ics).not.toMatch(/text the customer/i);

    // PT5: our work is credited, the member's own tick is not.
    const row = (title: string) =>
      page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: title, exact: true }) }).first();
    const lavacaRow = row('Seal the deck');
    await expect(lavacaRow.getByTestId('completed-by-lavaca')).toBeVisible();
    const ownRow = row('Test smoke & CO detectors');
    await expect(ownRow.getByTestId('completed-by-lavaca')).toHaveCount(0);
    // Scrolled clear of the sticky progress bar first, or it crops the row.
    const rowShot = async (target: typeof lavacaRow, name: string) => {
      await target.scrollIntoViewIfNeeded();
      await page.mouse.wheel(0, -160);
      await page.waitForTimeout(300);
      await target.screenshot({ path: join(EVIDENCE_DIR, name) });
    };
    await rowShot(lavacaRow, '15-portal-completed-by-lavaca.png');
    await rowShot(ownRow, '16-portal-self-ticked-no-label.png');

    // PT6/SC11: the member ticking a BOOKED task leaves the visit on the books.
    const bookedRow = row('Clean the dryer vent');
    const written = page.waitForResponse((r) => r.url().includes('/api/home-care/task') && r.request().method() === 'POST');
    await bookedRow.getByRole('button', { name: 'Mark done' }).click();
    expect((await written).status()).toBe(200);
    await expect(card).toBeVisible();
    // And it survives the reload, because the card keys on the window rather
    // than on the `status` column the member's checkbox just overwrote.
    await page.reload({ waitUntil: 'load' });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await declutter(page);
    await page.screenshot({ path: join(EVIDENCE_DIR, '17-portal-visit-survives-member-tick.png'), fullPage: true });
    // The tick was recorded as theirs, and the window it shares is untouched.
    const ticked = db.homeowner_maintenance.find((r) => r.task_key === 'clean_dryer_vent' && r.scheduled_start);
    expect(ticked?.status).toBe('done');
    expect(ticked?.completed_by).toBe('homeowner');
    expect(ticked?.scheduled_start).toBeTruthy();
  });

  test('RM: the night-before cron finds the visit and, on a dry run, sends nothing', async ({ request }) => {
    const res = await request.get('/api/cron/visit-reminders?dryRun=1', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    const body = await res.json();
    writeFileSync(join(EVIDENCE_DIR, '14-cron-dry-run.json'), JSON.stringify(body, null, 2));
    expect(res.status()).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(body.sent).toBe(0);
    // The visit is in the window and the recipient is classified as sendable.
    expect(body.visits).toBeGreaterThan(0);
    // Nothing was claimed: the ledger row is still pending after a dry run.
    expect(db.follow_up_queue.find((r) => r.follow_up_type === 'visit_reminder_1d')?.status).toBe('pending');
  });
});
