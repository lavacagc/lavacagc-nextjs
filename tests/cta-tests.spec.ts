/**
 * Slice C - homepage hero CTA multivariate test.
 * docs/home-services/acceptance-criteria.md: CT1-CT6, SEO3, SEC1, SEC5.
 *
 * Two halves:
 *  - Source checks that run everywhere (CT6, SEO3 shape, SEC5 shape).
 *  - Live-backend browser and API checks (CT1-CT5, SEC1). They write to the
 *    database `.env.local` names, so they refuse anything but a LOCAL Supabase,
 *    tag every row they create (`zztest-c-` visitor ids, `zztest-c` request and
 *    variant names) and restore the seeded variant state in afterAll.
 *
 * Run: TEST_URL=http://localhost:3103 E2E_LIVE_BACKEND=1 \
 *      node_modules/.bin/playwright test tests/cta-tests.spec.ts --project=chromium
 * The env is read from the shell, else from .env.local.
 */
import { test, expect, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';

const ROOT = join(__dirname, '..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');

// ---------------------------------------------------------------------------
// Source checks (run in every mode)
// ---------------------------------------------------------------------------
test.describe('CTA test - source', () => {
  test('CT6: ABTesting.tsx is deleted and nothing imports it', () => {
    expect(existsSync(join(ROOT, 'src/components/ABTesting.tsx'))).toBe(false);
    const hero = src('src/components/Hero.tsx');
    const page = src('src/app/page.tsx');
    expect(hero + page).not.toMatch(/ABTesting/);
  });

  test('SEO3: the hero buttons are next/link Links to the fixed destinations', () => {
    const hero = src('src/components/Hero.tsx');
    expect(hero).toMatch(/<Link\s+href=\{CTA_HREF\.primary\}/);
    expect(hero).toMatch(/<Link\s+href=\{CTA_HREF\.secondary\}/);
    const types = src('src/lib/cta/types.ts');
    expect(types).toContain("primary: '/home-services#services'");
    expect(types).toContain("secondary: '/portfolio'");
    // The old JS-only behaviours are gone.
    expect(hero).not.toMatch(/scrollToEstimate|router\.push/);
  });

  test('SEC5: admin CTA code reads with the secret key only', () => {
    const files = [
      'src/app/api/admin/cta/report/route.ts',
      'src/app/api/admin/cta/variants/route.ts',
      'src/app/api/admin/cta/settings/route.ts',
      'src/lib/cta/admin.server.ts',
      'src/components/admin/home-services/CtaTestsDashboard.tsx',
      'src/components/admin/home-services/cta/ButtonReportCard.tsx',
      'src/components/admin/home-services/cta/ctaApi.ts',
    ];
    for (const f of files) {
      const s = src(f);
      expect(s, f).not.toMatch(/PUBLISHABLE_KEY|ANON_KEY|integrations\/supabase\/client/);
    }
    expect(src('src/lib/cta/admin.server.ts')).toContain('supabaseRest');
  });
});

// ---------------------------------------------------------------------------
// Live backend
// ---------------------------------------------------------------------------

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const file = join(ROOT, '.env.local');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return { ...env, ...(process.env as Record<string, string>) };
}

const ENV = loadEnv();
const SB_URL = (ENV.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SB_KEY = (ENV.SUPABASE_SECRET_KEY || '').trim();
const IS_LOCAL_DB = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(SB_URL);
const BASE = process.env.TEST_URL || 'http://localhost:3000';
const ADMIN = { email: 'admin-c@local.test', password: 'LocalAdmin!2026' };
const TAG = 'zztest-c';
const DESKTOP = devices['Desktop Chrome'];

async function rest<T = unknown>(method: string, path: string, body?: unknown, prefer = 'return=representation'): Promise<T> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

interface EventRow { button: string; variant_key: string; event_type: string; visitor_id: string }

async function eventsFor(visitorId: string): Promise<EventRow[]> {
  return rest<EventRow[]>('GET', `cta_events?select=button,variant_key,event_type,visitor_id&visitor_id=eq.${visitorId}&limit=50`);
}

/** Polls until the visitor has `n` rows matching `filter` (events are fire-and-forget). */
async function expectEventCount(visitorId: string, filter: (r: EventRow) => boolean, n: number) {
  await expect
    .poll(async () => (await eventsFor(visitorId)).filter(filter).length, { timeout: 10_000 })
    .toBe(n);
}

let ipCounter = 0;
/** A fresh visitor. A unique client IP per context keeps the 60/min event limit out of the way. */
async function freshContext(browser: Browser, extra: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> {
  ipCounter += 1;
  const ctx = await browser.newContext({
    ...DESKTOP,
    baseURL: BASE,
    extraHTTPHeaders: { 'cf-connecting-ip': `10.203.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}` },
    ...extra,
  });
  // Isolate this spec from the project gallery further down the homepage: on
  // the shared local database it renders whatever other slices seeded, and a
  // row whose image host next/image does not allow raises a dev runtime error
  // that has nothing to do with the hero. The hero never reads these tables.
  await ctx.route(/\/rest\/v1\/(projects|project_images)(\?|$)/, (route) => route.fulfill({ json: [] }));
  return ctx;
}

async function openHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-cta-ready="true"]').waitFor({ timeout: 30_000 });
}

async function cookieValue(ctx: BrowserContext, name: string): Promise<string | undefined> {
  return (await ctx.cookies()).find((c) => c.name === name)?.value;
}

async function ensureAdminUser() {
  const res = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...ADMIN, email_confirm: true }),
  });
  // 422 = already registered, which is fine.
  if (!res.ok && res.status !== 422) throw new Error(`admin user: ${res.status} ${await res.text()}`);
}

async function adminContext(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  await ensureAdminUser();
  const ctx = await freshContext(browser);
  const page = await ctx.newPage();
  await page.goto('/auth');
  await page.locator('input[type=email]').fill(ADMIN.email);
  await page.locator('input[type=password]').fill(ADMIN.password);
  await page.locator('button[type=submit]').first().click();
  await page.waitForURL(/\/vaca-mgmt/, { timeout: 30_000 });
  return { ctx, page };
}

const SEED = [
  { button: 'primary', variant_key: 'A', active: true },
  { button: 'primary', variant_key: 'B', active: true },
  { button: 'primary', variant_key: 'C', active: false },
  { button: 'primary', variant_key: 'D', active: false },
  { button: 'primary', variant_key: 'E', active: false },
  { button: 'secondary', variant_key: 'A', active: true },
];

test.describe('CTA test - live backend', () => {
  test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
  test.skip(!SB_KEY || !IS_LOCAL_DB, `needs SUPABASE_SECRET_KEY and a LOCAL NEXT_PUBLIC_SUPABASE_URL (got "${SB_URL}"); these tests write rows`);
  // Shared state (variants, min visitors, report totals): one at a time.
  test.describe.configure({ mode: 'serial' });

  const browserVisitors: string[] = [];
  let originalMinVisitors = 100;

  test.beforeAll(async () => {
    const rows = await rest<{ cta_min_visitors: number }[]>('GET', 'site_settings?select=cta_min_visitors&id=eq.1');
    originalMinVisitors = rows[0]?.cta_min_visitors ?? 100;
  });

  test.afterAll(async () => {
    await rest('DELETE', `cta_events?visitor_id=like.${TAG}-*`, undefined, 'return=minimal');
    for (let i = 0; i < browserVisitors.length; i += 50) {
      const ids = browserVisitors.slice(i, i + 50).join(',');
      await rest('DELETE', `cta_events?visitor_id=in.(${ids})`, undefined, 'return=minimal');
    }
    await rest('DELETE', `home_service_requests?first_name=eq.${TAG}`, undefined, 'return=minimal');
    await rest('DELETE', `cta_variants?wording=like.${TAG}*`, undefined, 'return=minimal');
    for (const s of SEED) {
      await rest('PATCH', `cta_variants?button=eq.${s.button}&variant_key=eq.${s.variant_key}`, { active: s.active }, 'return=minimal');
    }
    await rest('PATCH', 'site_settings?id=eq.1', { cta_min_visitors: originalMinVisitors }, 'return=minimal');
  });

  test('CT1 + SEO3: two buttons with seeded wording, real links, in the server HTML', async ({ browser }) => {
    const ctx = await freshContext(browser);
    const page = await ctx.newPage();

    // Crawlable: present as <a href> in the HTML the server sends, before any JS.
    const html = await (await page.request.get('/')).text();
    expect(html).toMatch(/<a[^>]*data-cta-button="primary"[^>]*href="\/home-services#services"/);
    expect(html).toMatch(/<a[^>]*data-cta-button="secondary"[^>]*href="\/portfolio"/);

    await openHome(page);
    browserVisitors.push((await cookieValue(ctx, 'cta_vid'))!);
    const primary = page.locator('a[data-cta-button="primary"]');
    const secondary = page.locator('a[data-cta-button="secondary"]');
    await expect(primary).toBeVisible();
    await expect(secondary).toBeVisible();
    await expect(primary).toHaveAttribute('href', '/home-services#services');
    await expect(secondary).toHaveAttribute('href', '/portfolio');
    await expect(primary).toContainText(/^(Explore My Service Options|Get a Starting Price)/);
    await expect(secondary).toContainText('See Our Projects');
    await ctx.close();
  });

  test('CT2: assignment is sticky, even across visitors, and a view is recorded once', async ({ browser }) => {
    test.setTimeout(180_000);
    // Sticky across reloads.
    const ctx = await freshContext(browser);
    const page = await ctx.newPage();
    await openHome(page);
    const vid = (await cookieValue(ctx, 'cta_vid'))!;
    browserVisitors.push(vid);
    expect(vid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const firstCookie = await cookieValue(ctx, 'cta_v');
    const firstKey = await page.locator('a[data-cta-button="primary"]').getAttribute('data-cta-variant');
    expect(decodeURIComponent(firstCookie!)).toBe(`P=${firstKey};S=A`);
    for (let i = 0; i < 3; i++) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-cta-ready="true"]').waitFor();
      expect(await cookieValue(ctx, 'cta_v')).toBe(firstCookie);
      expect(await page.locator('a[data-cta-button="primary"]').getAttribute('data-cta-variant')).toBe(firstKey);
    }
    // One view per button for this visitor, despite four page loads.
    await expectEventCount(vid, (r) => r.event_type === 'view' && r.button === 'primary' && r.variant_key === firstKey, 1);
    await expectEventCount(vid, (r) => r.event_type === 'view', 2);
    await ctx.close();

    // Even: over twenty fresh visitors both A and B are served.
    const seen = new Map<string, number>();
    for (let i = 0; i < 20; i++) {
      const c = await freshContext(browser);
      const p = await c.newPage();
      await openHome(p);
      const key = (await p.locator('a[data-cta-button="primary"]').getAttribute('data-cta-variant'))!;
      seen.set(key, (seen.get(key) ?? 0) + 1);
      const id = (await cookieValue(c, 'cta_vid'))!;
      browserVisitors.push(id);
      // The served key is the one the cookie and the view event carry.
      expect(decodeURIComponent((await cookieValue(c, 'cta_v'))!)).toContain(`P=${key}`);
      await expectEventCount(id, (r) => r.event_type === 'view' && r.button === 'primary' && r.variant_key === key, 1);
      await c.close();
    }
    expect([...seen.keys()].sort()).toEqual(['A', 'B']);
  });

  test('CT2: a deactivated stored key is reassigned to an active one', async ({ browser }) => {
    const ctx = await freshContext(browser);
    await ctx.addCookies([
      { name: 'cta_vid', value: '00000000-0000-4000-8000-000000000001', url: BASE },
      { name: 'cta_v', value: encodeURIComponent('P=E;S=A'), url: BASE },
    ]);
    browserVisitors.push('00000000-0000-4000-8000-000000000001');
    const page = await ctx.newPage();
    await openHome(page);
    const key = await page.locator('a[data-cta-button="primary"]').getAttribute('data-cta-variant');
    expect(['A', 'B']).toContain(key);
    expect(decodeURIComponent((await cookieValue(ctx, 'cta_v'))!)).toBe(`P=${key};S=A`);
    await ctx.close();
  });

  test('CT3: a click records one click event per visitor per variant', async ({ browser }) => {
    const ctx = await freshContext(browser);
    const page = await ctx.newPage();
    await openHome(page);
    const vid = (await cookieValue(ctx, 'cta_vid'))!;
    browserVisitors.push(vid);
    const key = await page.locator('a[data-cta-button="primary"]').getAttribute('data-cta-variant');

    await page.locator('a[data-cta-button="primary"]').click();
    await page.waitForURL(/\/home-services/);
    await expectEventCount(vid, (r) => r.event_type === 'click' && r.button === 'primary' && r.variant_key === key, 1);

    // Clicking again on a later visit is free: still one row.
    await openHome(page);
    await page.locator('a[data-cta-button="primary"]').click();
    await page.waitForURL(/\/home-services/);
    await page.waitForTimeout(1500);
    await expectEventCount(vid, (r) => r.event_type === 'click' && r.button === 'primary', 1);

    // Secondary is tracked independently.
    await openHome(page);
    await page.locator('a[data-cta-button="secondary"]').click();
    await page.waitForURL(/\/portfolio/);
    await expectEventCount(vid, (r) => r.event_type === 'click' && r.button === 'secondary' && r.variant_key === 'A', 1);
    await ctx.close();
  });

  test('SEC1: the event sink caps, validates, never echoes errors, and rate limits per IP', async ({ request }) => {
    const ok = { button: 'primary', variant_key: 'A', event_type: 'view', visitor_id: '00000000-0000-4000-8000-0000000000aa' };
    browserVisitors.push(ok.visitor_id);
    const ip = { 'cf-connecting-ip': `10.204.${Date.now() % 250}.${Math.floor(Math.random() * 250) + 1}` };

    const big = await request.post('/api/cta/event', {
      headers: { ...ip, 'Content-Type': 'application/json' },
      data: JSON.stringify({ ...ok, pad: 'x'.repeat(2000) }),
    });
    expect(big.status()).toBe(413);

    const bad = await request.post('/api/cta/event', { headers: ip, data: { ...ok, visitor_id: 'not-a-uuid' } });
    expect(bad.status()).toBe(400);
    expect(await bad.json()).toEqual({ error: 'Invalid event' });

    const extra = await request.post('/api/cta/event', { headers: ip, data: { ...ok, injected: 1 } });
    expect(extra.status()).toBe(400);

    const notJson = await request.post('/api/cta/event', {
      headers: { ...ip, 'Content-Type': 'application/json' },
      data: '{nope',
    });
    expect(notJson.status()).toBe(400);

    // Duplicates are free (unique index): same answer twice, one row.
    for (let i = 0; i < 2; i++) {
      const r = await request.post('/api/cta/event', { headers: ip, data: ok });
      expect(r.status()).toBe(200);
    }
    expect((await eventsFor(ok.visitor_id)).length).toBe(1);

    // 60 per minute per IP: the six calls above count, so the 61st overall is refused.
    const statuses: number[] = [];
    for (let i = 0; i < 56; i++) {
      statuses.push((await request.post('/api/cta/event', { headers: ip, data: ok })).status());
    }
    expect(statuses.filter((s) => s === 200).length).toBe(54);
    expect(statuses.slice(-2)).toEqual([429, 429]);
    const limited = await request.post('/api/cta/event', { headers: ip, data: ok });
    expect(limited.status()).toBe(429);
    expect(limited.headers()['retry-after']).toBeTruthy();
    // A different IP is unaffected.
    const other = await request.post('/api/cta/event', {
      headers: { 'cf-connecting-ip': `10.205.${Date.now() % 250}.9` },
      data: ok,
    });
    expect(other.status()).toBe(200);
  });

  test('CT4: the report counts events and requests, and gates the leader on min visitors', async ({ browser }) => {
    test.setTimeout(120_000);
    const { ctx, page } = await adminContext(browser);
    type Report = {
      min_visitors: number;
      sms_verification_in_use: boolean;
      valid_lead_rule: string;
      buttons: Record<string, {
        sample_size: number;
        leader: { variant_key: string } | null;
        leader_status: string;
        variants: { variant_key: string; active: boolean; views: number; clicks: number; requests: number; valid_leads: number; won: number; request_rate: number | null }[];
      }>;
    };
    const getReport = async (): Promise<Report> => {
      const res = await ctx.request.get('/api/admin/cta/report');
      expect(res.status()).toBe(200);
      return res.json();
    };
    const row = (r: Report, key: string) => r.buttons.primary.variants.find((v) => v.variant_key === key)!;

    // Unauthenticated callers are refused.
    const anonCtx = await freshContext(browser);
    const anon = await anonCtx.request.get('/api/admin/cta/report');
    expect(anon.status()).toBe(401);
    await anonCtx.close();

    const before = await getReport();
    expect(before.valid_lead_rule).toMatch(/Valid lead/);

    // Known data: A 10 views / 4 clicks / 1 request; B 10 views / 2 clicks / 3 requests (new, won, lost).
    const events: object[] = [];
    for (let i = 0; i < 10; i++) {
      events.push({ button: 'primary', variant_key: 'A', event_type: 'view', visitor_id: `${TAG}-a-${i}` });
      events.push({ button: 'primary', variant_key: 'B', event_type: 'view', visitor_id: `${TAG}-b-${i}` });
    }
    for (let i = 0; i < 4; i++) events.push({ button: 'primary', variant_key: 'A', event_type: 'click', visitor_id: `${TAG}-a-${i}` });
    for (let i = 0; i < 2; i++) events.push({ button: 'primary', variant_key: 'B', event_type: 'click', visitor_id: `${TAG}-b-${i}` });
    await rest('POST', 'cta_events', events, 'return=minimal');
    const req = (key: string, status: string) => ({ first_name: TAG, cta_variant_primary: key, cta_variant_secondary: 'A', status });
    await rest('POST', 'home_service_requests', [req('A', 'new'), req('B', 'new'), req('B', 'won'), req('B', 'lost')], 'return=minimal');

    const after = await getReport();
    const d = (key: string, field: 'views' | 'clicks' | 'requests' | 'valid_leads' | 'won') => row(after, key)[field] - row(before, key)[field];
    expect([d('A', 'views'), d('A', 'clicks'), d('A', 'requests'), d('A', 'won')]).toEqual([10, 4, 1, 0]);
    expect([d('B', 'views'), d('B', 'clicks'), d('B', 'requests'), d('B', 'won')]).toEqual([10, 2, 3, 1]);
    // Valid leads: our rows are not phone verified, so they count only while SMS is not in use,
    // and then by status (new and won yes, lost no).
    if (after.sms_verification_in_use) {
      expect([d('A', 'valid_leads'), d('B', 'valid_leads')]).toEqual([0, 0]);
    } else {
      expect([d('A', 'valid_leads'), d('B', 'valid_leads')]).toEqual([1, 2]);
    }
    expect(row(after, 'B').request_rate).toBeCloseTo(row(after, 'B').requests / row(after, 'B').views, 6);
    // Secondary A got all four requests.
    const secA = (r: Report) => r.buttons.secondary.variants.find((v) => v.variant_key === 'A')!.requests;
    expect(secA(after) - secA(before)).toBe(4);

    const sample = after.buttons.primary.sample_size;
    expect(sample).toBe(Math.min(row(after, 'A').views, row(after, 'B').views));

    // Below the threshold: no leader, and the tab says so with n of N.
    const set = async (n: number) => {
      const res = await ctx.request.patch('/api/admin/cta/settings', { data: { cta_min_visitors: n } });
      expect(res.status()).toBe(200);
    };
    await set(sample + 1);
    const below = await getReport();
    expect(below.buttons.primary.leader_status).toBe('not_enough_visitors');
    expect(below.buttons.primary.leader).toBeNull();

    await page.getByRole('button', { name: 'Marketing' }).first().click({ force: true });
    await page.getByRole('button', { name: 'CTA Tests' }).first().click({ force: true });
    const callout = page.getByTestId('cta-card-primary').getByTestId('cta-leader');
    await expect(callout).toContainText(`Not enough visitors yet (${sample} of ${sample + 1})`);

    // At the threshold: the leader is the best request rate (B, when the table held only our rows).
    await set(sample);
    const at = await getReport();
    const active = at.buttons.primary.variants.filter((v) => v.active);
    const best = [...active].sort((a, b) => (b.request_rate ?? 0) - (a.request_rate ?? 0));
    if (best[0].request_rate !== best[1]?.request_rate) {
      expect(at.buttons.primary.leader_status).toBe('leader');
      expect(at.buttons.primary.leader?.variant_key).toBe(best[0].variant_key);
      if (before.buttons.primary.variants.every((v) => v.views === 0)) expect(at.buttons.primary.leader?.variant_key).toBe('B');
      await page.getByRole('button', { name: /Refresh/ }).click();
      await expect(callout).toContainText(`Leader: ${best[0].variant_key}`);
    } else {
      expect(at.buttons.primary.leader_status).toBe('tied');
    }

    // Validation: not a positive integer.
    const invalid = await ctx.request.patch('/api/admin/cta/settings', { data: { cta_min_visitors: 0 } });
    expect(invalid.status()).toBe(400);
    await ctx.close();
  });

  test('CT5: variants are created, edited and switched in admin, within the limits', async ({ browser }) => {
    test.setTimeout(120_000);
    const { ctx } = await adminContext(browser);
    const api = ctx.request;

    const list = await api.get('/api/admin/cta/variants');
    expect(list.status()).toBe(200);
    const existing = (await list.json()).variants as { button: string; variant_key: string }[];
    const secondaryCount = existing.filter((v) => v.button === 'secondary').length;

    // Create secondary variants up to seven; keys are assigned in order.
    const created: string[] = [];
    for (let i = secondaryCount; i < 7; i++) {
      const res = await api.post('/api/admin/cta/variants', { data: { button: 'secondary', wording: `${TAG} wording ${i}` } });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.variant.active).toBe(false);
      created.push(body.variant.variant_key);
    }
    expect(created[0]).toBe('B');
    const eighth = await api.post('/api/admin/cta/variants', { data: { button: 'secondary', wording: `${TAG} eighth` } });
    expect(eighth.status()).toBe(409);
    expect((await eighth.json()).error).toMatch(/7 variants/);

    // Edit wording, subtext and colour.
    const upd = await api.patch('/api/admin/cta/variants', {
      data: { button: 'secondary', variant_key: 'B', wording: `${TAG} edited`, subtext: 'Small line', color: '#1f7a4d' },
    });
    expect(upd.status()).toBe(200);
    expect(await upd.json()).toMatchObject({ variant: { wording: `${TAG} edited`, subtext: 'Small line', color: '#1f7a4d' } });
    const badColor = await api.patch('/api/admin/cta/variants', {
      data: { button: 'secondary', variant_key: 'B', color: 'red; background:url(x)' },
    });
    expect(badColor.status()).toBe(400);
    const empty = await api.patch('/api/admin/cta/variants', { data: { button: 'secondary', variant_key: 'B', wording: '  ' } });
    expect(empty.status()).toBe(400);

    // The last active variant cannot be switched off.
    const lastOff = await api.patch('/api/admin/cta/variants', { data: { button: 'secondary', variant_key: 'A', active: false } });
    expect(lastOff.status()).toBe(409);
    expect((await lastOff.json()).error).toMatch(/only active/);

    // With B active, A may go off; the homepage then serves B with its colour and subtext.
    expect((await api.patch('/api/admin/cta/variants', { data: { button: 'secondary', variant_key: 'B', active: true } })).status()).toBe(200);
    expect((await api.patch('/api/admin/cta/variants', { data: { button: 'secondary', variant_key: 'A', active: false } })).status()).toBe(200);
    const visitor = await freshContext(browser);
    const home = await visitor.newPage();
    await openHome(home);
    browserVisitors.push((await cookieValue(visitor, 'cta_vid'))!);
    const sec = home.locator('a[data-cta-button="secondary"]');
    await expect(sec).toHaveAttribute('data-cta-variant', 'B');
    await expect(sec).toContainText(`${TAG} edited`);
    await expect(sec).toContainText('Small line');
    expect(await sec.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(31, 122, 77)');
    await visitor.close();

    // Restore: A back on, B off (afterAll deletes the created rows).
    expect((await api.patch('/api/admin/cta/variants', { data: { button: 'secondary', variant_key: 'A', active: true } })).status()).toBe(200);
    expect((await api.patch('/api/admin/cta/variants', { data: { button: 'secondary', variant_key: 'B', active: false } })).status()).toBe(200);
    await ctx.close();
  });
});
