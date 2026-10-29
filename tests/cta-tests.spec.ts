/**
 * Slice C - homepage hero CTA multivariate test.
 * docs/home-services/acceptance-criteria.md: CT1-CT6, SEO3, SEC1, SEC5,
 * plus the six fixes from docs/home-services/reports/slice-c-review.md.
 *
 * Two halves:
 *  - Checks that run everywhere: source shape (CT6, SEO3, SEC5) and pure unit
 *    tests of the assignment hash (independence, evenness, pinned vectors) and
 *    of the pre-paint script (size, crypto-only seed).
 *  - Live-backend browser and API checks (CT1-CT5, SEC1, the signed visitor
 *    id). They write to the database `.env.local` names, so they refuse
 *    anything but a LOCAL Supabase, tag what they insert (`zztest-c` request
 *    and variant names), record every visitor id they cause or insert, and
 *    restore the hero experiments' variants in afterAll.
 *
 * Since Phase 2 slice H the buttons are the experiments `hero-primary` and
 * `hero-secondary` (variants in `experiments.variants`, events in
 * `experiment_events`); cta_variants and cta_events are read-only history.
 * The behaviour under test is unchanged; only where the spec looks it up moved.
 *
 * Run: TEST_URL=http://localhost:3103 E2E_LIVE_BACKEND=1 \
 *      node_modules/.bin/playwright test tests/cta-tests.spec.ts --project=chromium
 * The env is read from the shell, else from .env.local.
 */
import { test, expect, devices, request as pwRequest, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';
import { ctaIndex } from '../src/lib/cta/assign';
import { ctaBootstrap, heroCtaBootstrapScript } from '../src/lib/cta/bootstrap';
import { CTA_ASSIGN_COOKIE, FALLBACK_VARIANTS, type HeroCtaVariants } from '../src/lib/cta/types';

const ROOT = join(__dirname, '..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Deterministic 32-hex seeds (mulberry32), so the statistics below are exact and repeatable. */
function seeds(n: number, start = 20261029): string[] {
  let a = start;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: n }, () =>
    Array.from({ length: 16 }, () => Math.floor(next() * 256).toString(16).padStart(2, '0')).join(''),
  );
}

/** primary [A, B] -> these seeds give A and B respectively (pinned below). */
const SEED_A = 'a2d5dd73ae634ca142e73a6855878688';
const SEED_B = 'd9772b936b07f48751b6ab50a6aadfe7';

// ---------------------------------------------------------------------------
// Checks that run everywhere
// ---------------------------------------------------------------------------
test.describe('CTA test - source and units', () => {
  test('CT6: ABTesting.tsx is deleted and nothing imports it', () => {
    expect(existsSync(join(ROOT, 'src/components/ABTesting.tsx'))).toBe(false);
    expect(src('src/components/Hero.tsx') + src('src/app/page.tsx')).not.toMatch(/ABTesting/);
  });

  test('SEO3: the CTA buttons are next/link Links to the fixed destinations', () => {
    const cta = src('src/lib/cta/HeroCta.tsx');
    expect(cta).toMatch(/<Link\s+href=\{CTA_HREF\[button\]\}/);
    const types = src('src/lib/cta/types.ts');
    expect(types).toContain("primary: '/home-services#services'");
    expect(types).toContain("secondary: '/portfolio'");
    const hero = src('src/components/Hero.tsx');
    expect(hero).toContain('{cta}');
    expect(hero).not.toMatch(/scrollToEstimate|router\.push|cta_vid/);
    expect(src('src/app/page.tsx')).toContain('<Hero cta={<HeroCta variants={ctaVariants} />} />');
  });

  test('SEC5: admin CTA code reads with the secret key only', () => {
    const files = [
      'src/app/api/admin/cta/report/route.ts',
      'src/app/api/admin/cta/variants/route.ts',
      'src/app/api/admin/cta/settings/route.ts',
      'src/lib/cta/admin.server.ts',
      'src/lib/cta/activePairs.server.ts',
      'src/components/admin/home-services/CtaTestsDashboard.tsx',
      'src/components/admin/home-services/cta/ButtonReportCard.tsx',
      'src/components/admin/home-services/cta/ctaApi.ts',
    ];
    for (const f of files) expect(src(f), f).not.toMatch(/PUBLISHABLE_KEY|ANON_KEY|integrations\/supabase\/client/);
    expect(src('src/lib/cta/admin.server.ts')).toContain('supabaseRest');
  });

  test('fix 1: assignment hash is pinned (fixed vectors)', () => {
    // Any change to the hash reassigns visitors; these pin it. They also fail
    // for a Math.random pick.
    expect([ctaIndex(SEED_B, 'primary', 2), ctaIndex(SEED_B, 'secondary', 2), ctaIndex(SEED_B, 'primary', 7)]).toEqual([1, 0, 3]);
    expect([ctaIndex(SEED_A, 'primary', 2), ctaIndex(SEED_A, 'secondary', 2), ctaIndex(SEED_A, 'primary', 7)]).toEqual([0, 0, 5]);
    expect(ctaIndex('8e507a30f4acbef0beb9b53f3aa426fe', 'secondary', 2)).toBe(1);
  });

  test('fix 1: primary and secondary are independent - all four 2x2 combinations within 5% of even over 10,000 visitors', () => {
    const cells: Record<string, number> = { '00': 0, '01': 0, '10': 0, '11': 0 };
    for (const s of seeds(10_000)) cells[`${ctaIndex(s, 'primary', 2)}${ctaIndex(s, 'secondary', 2)}`] += 1;
    for (const [cell, count] of Object.entries(cells)) {
      // Even is 2,500; 5% of even is 125.
      expect(Math.abs(count - 2500), `cell ${cell} = ${count}`).toBeLessThanOrEqual(125);
    }
  });

  test('fix 1: each button alone is even for 2 to 7 variants over 10,000 visitors', () => {
    for (let n = 2; n <= 7; n++) {
      const counts = new Array(n).fill(0);
      for (const s of seeds(10_000)) counts[ctaIndex(s, 'primary', n)] += 1;
      const even = 10_000 / n;
      // 10% of even: at n = 7 an even share is 1,429, so 5% would sit inside ordinary sampling noise.
      for (const c of counts) expect(Math.abs(c - even), `n=${n} counts=${counts}`).toBeLessThanOrEqual(even * 0.1);
    }
  });

  test('fix 2: the pre-paint script is inline, under 1 KB, and seeds only from crypto.getRandomValues', () => {
    const live: HeroCtaVariants = {
      primary: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((k) => ({ button: 'primary', variant_key: k as 'A', wording: 'x', subtext: null, color: null })),
      secondary: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((k) => ({ button: 'secondary', variant_key: k as 'A', wording: 'x', subtext: null, color: null })),
    };
    const script = heroCtaBootstrapScript(live);
    expect(Buffer.byteLength(script), script).toBeLessThan(1024);
    expect(ctaBootstrap.toString()).toContain('crypto.getRandomValues');
    expect(CTA_ASSIGN_COOKIE).toBe('cta_v');
    expect(ctaBootstrap.toString()).toContain(`${CTA_ASSIGN_COOKIE}=`);
    expect(ctaBootstrap.toString()).not.toMatch(/Math\.random/);
    // compactJs is only sound while no string literal in the serialized code holds whitespace.
    // Scanned left to right, so each match is one whole literal.
    for (const fn of [ctaBootstrap, ctaIndex]) {
      const literals = [...fn.toString().matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`[^`]*`/g)].map((m) => m[0]);
      expect(literals.length, fn.name).toBeGreaterThan(0);
      expect(literals.filter((l) => /\s/.test(l)), fn.name).toEqual([]);
    }
    // A fallback button contributes no keys, so it is never assigned or counted.
    expect(heroCtaBootstrapScript(FALLBACK_VARIANTS)).toContain('{"p":"","s":"","a":15552000}');
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

const HERO_KEYS = { primary: 'hero-primary', secondary: 'hero-secondary' } as const;

/** The hero events of one visitor, in the Phase 1 shape (button, event_type). */
async function eventsFor(visitorId: string): Promise<EventRow[]> {
  const rows = await rest<Array<{ experiment_key: string; variant_key: string; event: string; visitor_id: string }>>(
    'GET',
    `experiment_events?select=experiment_key,variant_key,event,visitor_id&visitor_id=eq.${visitorId}&experiment_key=in.(hero-primary,hero-secondary)&limit=50`,
  );
  return rows.map((r) => ({ button: r.experiment_key.replace('hero-', ''), variant_key: r.variant_key, event_type: r.event, visitor_id: r.visitor_id }));
}

interface HeroVariant { key: string; label: string; active?: boolean; payload: Record<string, unknown> }
async function heroVariants(button: 'primary' | 'secondary'): Promise<HeroVariant[]> {
  return (await rest<Array<{ variants: HeroVariant[] }>>('GET', `experiments?select=variants&key=eq.${HERO_KEYS[button]}`))[0].variants;
}

/** Polls until the visitor has `n` rows matching `filter` (events are fire-and-forget). */
async function expectEventCount(visitorId: string, filter: (r: EventRow) => boolean, n: number) {
  await expect
    .poll(async () => (await eventsFor(visitorId)).filter(filter).length, { timeout: 10_000 })
    .toBe(n);
}

/** Every server-minted visitor id a test caused, for afterAll to delete. */
const createdVisitors = new Set<string>();

function uuidOfCookie(value: string | undefined): string | undefined {
  const uuid = value?.split('.')[0];
  return uuid && UUID.test(uuid) ? uuid : undefined;
}

/** The server-minted visitor id of a browser context, once its first event has been answered. */
async function visitorIdOf(ctx: BrowserContext): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(async () => {
      id = uuidOfCookie((await ctx.cookies()).find((c) => c.name === 'cta_vid')?.value);
      return id ?? null;
    }, { timeout: 10_000 })
    .not.toBeNull();
  createdVisitors.add(id!);
  return id!;
}

let ipCounter = 0;
/** Every browser context the spec opens, so afterAll can close any a failed test left open. */
const browserContexts: BrowserContext[] = [];
/** A fresh visitor. A unique client IP per context keeps the 60/min event limit out of the way. */
async function freshContext(browser: Browser, extra: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> {
  ipCounter += 1;
  const ctx = await browser.newContext({
    ...DESKTOP,
    baseURL: BASE,
    extraHTTPHeaders: { 'cf-connecting-ip': `10.203.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}` },
    ...extra,
  });
  browserContexts.push(ctx);
  // Record every visitor id the sink mints for this context as it happens, so
  // afterAll deletes its rows even when a test fails before asking for it.
  // Any response can set it: middleware mints one with the homepage itself.
  ctx.on('response', async (res) => {
    const id = uuidOfCookie((await res.headerValue('set-cookie').catch(() => null))?.match(/cta_vid=([^;]+)/)?.[1]);
    if (id) createdVisitors.add(id);
  });
  // Isolate this spec from the project gallery further down the homepage: on
  // the shared local database it renders whatever other slices seeded. The
  // hero never reads these tables.
  await ctx.route(/\/rest\/v1\/(projects|project_images)(\?|$)/, (route) => route.fulfill({ json: [] }));
  return ctx;
}

async function withAssignment(ctx: BrowserContext, value: string) {
  await ctx.addCookies([{ name: 'cta_v', value: encodeURIComponent(value), url: BASE }]);
}

async function openHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-cta-p'), null, { timeout: 30_000 });
  // The pre-paint script sets data-cta-p about 100 ms before React hydrates the
  // hero; a click in that gap is a plain link navigation with no click beacon,
  // which made CT3 fail about half its runs. Wait for React to own the links.
  await page.waitForFunction(
    () => {
      const link = document.querySelector('.hero-cta a[data-cta-button]');
      return !!link && Object.keys(link).some((k) => k.startsWith('__reactProps'));
    },
    null,
    { timeout: 30_000 },
  );
}

/**
 * The inline pre-paint <script> in served HTML. Parameter names are matched
 * loosely because the production build minifies them; the body is matched up
 * to the first </script>, which the script itself never contains.
 */
const BOOTSTRAP_TAG = /<script>(\(function\(\w+,\w+\)\{try\{(?:(?!<\/script>)[\s\S])*?cta_v=(?:(?!<\/script>)[\s\S])*?)<\/script>/;

/** The one link of a button that CSS shows. */
const shown = (page: Page, button: 'primary' | 'secondary') => page.locator(`a[data-cta-button="${button}"]:visible`);

async function shownKey(page: Page, button: 'primary' | 'secondary'): Promise<string | null> {
  await expect(shown(page, button)).toHaveCount(1);
  return shown(page, button).getAttribute('data-cta-variant');
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
  // The production CSP keeps the browser off the rig's 127.0.0.1 Supabase; only the admin sign-in needs it lifted (docs/local-rig.md).
  const ctx = await freshContext(browser, { bypassCSP: true });
  const page = await ctx.newPage();
  await page.goto('/auth');
  await page.locator('input[type=email]').fill(ADMIN.email);
  await page.locator('input[type=password]').fill(ADMIN.password);
  await page.locator('button[type=submit]').first().click();
  await page.waitForURL(/\/vaca-mgmt/, { timeout: 30_000 });
  return { ctx, page };
}

/** An API client with its own cookie jar and client IP, for the event sink tests. */
const apiClients: APIRequestContext[] = [];
async function apiClient(ip: string, headers: Record<string, string> = {}): Promise<APIRequestContext> {
  const api = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { 'cf-connecting-ip': ip, ...headers } });
  apiClients.push(api);
  return api;
}

async function jarVisitor(api: APIRequestContext): Promise<string | undefined> {
  const id = uuidOfCookie((await api.storageState()).cookies.find((c) => c.name === 'cta_vid')?.value);
  if (id) createdVisitors.add(id);
  return id;
}

function setCookieOf(res: { headersArray(): { name: string; value: string }[] }): string | undefined {
  return res.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith('cta_vid='))?.value;
}

/** The seeded state: primary A and B on, C to E off; secondary A on. */
const SEED_ACTIVE: Record<'primary' | 'secondary', Record<string, boolean>> = {
  primary: { A: true, B: true, C: false, D: false, E: false },
  secondary: { A: true },
};

/**
 * Put the homepage buttons back to the seeded state AND refresh what serves
 * them. The variant rows are rewritten directly (the admin route cannot delete
 * a variant), then one admin-route write per button (which expires the
 * experiments cache, the event sink's active-pair cache and revalidates '/')
 * and an explicit revalidate of '/', so a failed run can never leave its test
 * variant on the cached homepage for the next one. Idempotent; called from
 * CT5's finally and again from afterAll.
 */
async function restoreHeroButtons(adminApi: APIRequestContext) {
  for (const button of ['primary', 'secondary'] as const) {
    const variants = (await heroVariants(button))
      .filter((v) => !String(v.label).startsWith(TAG))
      .map((v) => (v.key in SEED_ACTIVE[button] ? { ...v, active: SEED_ACTIVE[button][v.key] } : v));
    await rest('PATCH', `experiments?key=eq.${HERO_KEYS[button]}`, { variants }, 'return=minimal');
    const touched = await adminApi.patch('/api/admin/cta/variants', { data: { button, variant_key: 'A', active: true } });
    expect(touched.status(), `restore ${button} through the admin route`).toBe(200);
  }
  expect((await adminApi.post('/api/admin/revalidate', { data: { paths: ['/'] } })).status()).toBe(200);
  // The cached homepage is regenerated within seconds; wait until it no longer shows a test variant.
  await expect
    .poll(async () => {
      const html = await (await adminApi.get('/')).text();
      // Rendered links only: the inline CSS names every key A to G for both buttons.
      return html.includes(TAG) || /<a[^>]*data-cta-button="secondary"[^>]*data-cta-variant="[B-G]"/.test(html);
    }, { timeout: 10_000, intervals: [250, 500, 1000] })
    .toBe(false);
}

test.describe('CTA test - live backend', () => {
  test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
  test.skip(!SB_KEY || !IS_LOCAL_DB, `needs SUPABASE_SECRET_KEY and a LOCAL NEXT_PUBLIC_SUPABASE_URL (got "${SB_URL}"); these tests write rows`);
  // Shared state (variants, min visitors, report totals): one at a time.
  test.describe.configure({ mode: 'serial' });

  let originalMinVisitors = 100;

  test.beforeAll(async () => {
    const rows = await rest<{ cta_min_visitors: number }[]>('GET', 'site_settings?select=cta_min_visitors&id=eq.1');
    originalMinVisitors = rows[0]?.cta_min_visitors ?? 100;
  });

  test.afterAll(async ({ browser }) => {
    // Contexts a failed test left open: close them, then give in-flight event
    // posts time to land (and their minted ids to be recorded) before deleting.
    for (const c of browserContexts) await c.close().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 2000));
    // API clients a failed test never disposed: collect their minted ids first.
    for (const api of apiClients) {
      await jarVisitor(api).catch(() => undefined);
      await api.dispose().catch(() => undefined);
    }
    const ids = [...createdVisitors];
    for (let i = 0; i < ids.length; i += 50) {
      await rest('DELETE', `experiment_events?experiment_key=in.(hero-primary,hero-secondary)&visitor_id=in.(${ids.slice(i, i + 50).join(',')})`, undefined, 'return=minimal');
    }
    await rest('DELETE', `home_service_requests?first_name=eq.${TAG}`, undefined, 'return=minimal');
    await rest('PATCH', 'site_settings?id=eq.1', { cta_min_visitors: originalMinVisitors }, 'return=minimal');
    // Variants this spec added are dropped and the seeded ones switched back,
    // through the admin route so the cached homepage is refreshed too.
    const { ctx } = await adminContext(browser);
    try {
      await restoreHeroButtons(ctx.request);
    } finally {
      await ctx.close();
    }
  });

  test('CT1 + SEO3: every active variant is a real link in the server HTML; one shows per button', async ({ browser }) => {
    const ctx = await freshContext(browser);
    const page = await ctx.newPage();

    // Crawlable: present as <a href> in the HTML the server sends, before any JS.
    const html = await (await page.request.get('/')).text();
    for (const key of ['A', 'B']) {
      expect(html).toMatch(new RegExp(`<a[^>]*data-cta-button="primary"[^>]*data-cta-variant="${key}"[^>]*href="/home-services#services"`));
    }
    expect(html).toMatch(/<a[^>]*data-cta-button="secondary"[^>]*data-cta-variant="A"[^>]*href="\/portfolio"/);
    // The pre-paint script is inline (no src) and under 1 KB as served.
    const script = BOOTSTRAP_TAG.exec(html)?.[1];
    expect(script, 'inline bootstrap script').toBeTruthy();
    expect(Buffer.byteLength(script!)).toBeLessThan(1024);

    await openHome(page);
    await expect(shown(page, 'primary')).toHaveCount(1);
    await expect(shown(page, 'secondary')).toHaveCount(1);
    await expect(shown(page, 'primary')).toHaveAttribute('href', '/home-services#services');
    await expect(shown(page, 'secondary')).toHaveAttribute('href', '/portfolio');
    await expect(shown(page, 'primary')).toContainText(/^(Explore My Service Options|Get a Starting Price)/);
    await expect(shown(page, 'secondary')).toContainText('See Our Projects');
    await visitorIdOf(ctx);
    await ctx.close();
  });

  test('fix 4: a known seed gets exactly the hash-computed keys (fails for a random pick)', async ({ browser }) => {
    for (const seed of [SEED_A, SEED_B, ...seeds(4, 7)]) {
      const ctx = await freshContext(browser);
      await withAssignment(ctx, `R=${seed}`);
      const page = await ctx.newPage();
      await openHome(page);
      const expected = ['A', 'B'][ctaIndex(seed, 'primary', 2)];
      expect(await shownKey(page, 'primary'), seed).toBe(expected);
      expect(await shownKey(page, 'secondary')).toBe('A');
      expect(decodeURIComponent((await cookieValue(ctx, 'cta_v'))!)).toBe(`P=${expected};S=A;R=${seed}`);
      await visitorIdOf(ctx);
      await ctx.close();
    }
  });

  test('fix 4: a stored key beats the hash (fails if the cookie is ignored); an inactive one is reassigned', async ({ browser }) => {
    const cases = [
      { cookie: `P=B;S=A;R=${SEED_A}`, expected: 'B' }, // SEED_A alone would give A
      { cookie: `P=A;S=A;R=${SEED_B}`, expected: 'A' }, // SEED_B alone would give B
      { cookie: `P=E;S=A;R=${SEED_B}`, expected: 'B' }, // E is inactive: back to the hash
    ];
    for (const c of cases) {
      const ctx = await freshContext(browser);
      await withAssignment(ctx, c.cookie);
      const page = await ctx.newPage();
      await openHome(page);
      expect(await shownKey(page, 'primary'), c.cookie).toBe(c.expected);
      expect(decodeURIComponent((await cookieValue(ctx, 'cta_v'))!)).toBe(`P=${c.expected};S=A;R=${c.cookie.split('R=')[1]}`);
      await visitorIdOf(ctx);
      await ctx.close();
    }
  });

  test('CT2: a fresh visitor is sticky across reloads, and views are recorded once under one server-minted id', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await freshContext(browser);
    const page = await ctx.newPage();
    await openHome(page);
    const vid = await visitorIdOf(ctx);
    const cookie = (await ctx.cookies()).find((c) => c.name === 'cta_vid')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    expect(cookie.value).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    const firstCookie = await cookieValue(ctx, 'cta_v');
    const parsed = decodeURIComponent(firstCookie!);
    expect(parsed).toMatch(/^P=[AB];S=A;R=[0-9a-f]{32}$/);
    const firstKey = await shownKey(page, 'primary');
    // The fresh assignment is the hash of the seed the browser drew.
    expect(firstKey).toBe(['A', 'B'][ctaIndex(parsed.split('R=')[1], 'primary', 2)]);
    for (let i = 0; i < 3; i++) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-cta-p'));
      expect(await cookieValue(ctx, 'cta_v')).toBe(firstCookie);
      expect(await shownKey(page, 'primary')).toBe(firstKey);
    }
    // One view per button for this visitor, despite four page loads, and the id never changed.
    await expectEventCount(vid, (r) => r.event_type === 'view' && r.button === 'primary' && r.variant_key === firstKey, 1);
    await expectEventCount(vid, (r) => r.event_type === 'view', 2);
    expect(await visitorIdOf(ctx)).toBe(vid);
    await ctx.close();

    // Over twenty fresh visitors both A and B are served (exact evenness is the unit test's job).
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const c = await freshContext(browser);
      const p = await c.newPage();
      await openHome(p);
      seen.add((await shownKey(p, 'primary'))!);
      await visitorIdOf(c);
      await c.close();
    }
    expect([...seen].sort()).toEqual(['A', 'B']);
  });

  test('fix 2: the variant is chosen before first paint, even on a throttled phone', async ({ browser }) => {
    test.setTimeout(120_000);
    for (const seed of [SEED_A, SEED_B]) {
      const phone = devices['iPhone 13'];
      const ctx = await freshContext(browser, {
        viewport: phone.viewport,
        userAgent: phone.userAgent,
        deviceScaleFactor: phone.deviceScaleFactor,
        isMobile: phone.isMobile,
        hasTouch: phone.hasTouch,
      });
      await withAssignment(ctx, `R=${seed}`);
      await ctx.addInitScript(() => {
        const w = window as unknown as { __ctaFrames: string[] };
        w.__ctaFrames = [];
        const tick = () => {
          const a = Array.from(document.querySelectorAll('a[data-cta-button="primary"]'))
            .find((el) => getComputedStyle(el).display !== 'none') as HTMLElement | undefined;
          const s = a ? `${a.dataset.ctaVariant}@${getComputedStyle(a).opacity}` : '-';
          if (w.__ctaFrames[w.__ctaFrames.length - 1] !== s) w.__ctaFrames.push(s);
          if (performance.now() < 30000) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      // The reviewer's slow-phone profile: CPU 6x and slow 4G.
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      });
      await page.goto('/', { waitUntil: 'load', timeout: 90_000 });
      await page.waitForTimeout(1500);
      const frames = await page.evaluate(() => (window as unknown as { __ctaFrames: string[] }).__ctaFrames);
      const expected = ['A', 'B'][ctaIndex(seed, 'primary', 2)];
      // Every frame that showed a primary button showed the assigned one, fully opaque.
      expect(frames.filter((f) => f !== '-'), frames.join(' ')).toEqual([`${expected}@1`]);
      await visitorIdOf(ctx);
      await ctx.close();
    }
  });

  test('fix 2: if the inline script never ran (client-rendered page), the same assignment is applied after hydration', async ({ browser }) => {
    const ctx = await freshContext(browser);
    await withAssignment(ctx, `R=${SEED_B}`);
    // Serve the homepage without the pre-paint script, as when React renders the page on the client.
    await ctx.route(/\/$/, async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue();
      const res = await route.fetch();
      const body = (await res.text()).replace(BOOTSTRAP_TAG, '');
      await route.fulfill({ response: res, body });
    });
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-cta-p'));
    expect(await shownKey(page, 'primary')).toBe(['A', 'B'][ctaIndex(SEED_B, 'primary', 2)]);
    const vid = await visitorIdOf(ctx);
    await expectEventCount(vid, (r) => r.event_type === 'view', 2);
    await ctx.close();
  });

  test('fix 2: without JavaScript the first variant of each button shows at once, and links work', async ({ browser }) => {
    const ctx = await freshContext(browser, { javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(shown(page, 'primary')).toHaveCount(1);
    expect(await shown(page, 'primary').getAttribute('data-cta-variant')).toBe('A');
    expect(await shown(page, 'secondary').getAttribute('data-cta-variant')).toBe('A');
    expect(await shown(page, 'primary').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    await shown(page, 'secondary').click();
    await page.waitForURL(/\/portfolio/);
    // Middleware issues the signed id with the page itself, JavaScript or not,
    // but a visitor who runs no script sends no beacons: nothing is counted.
    const noJsCookie = await cookieValue(ctx, 'cta_vid');
    if (noJsCookie) {
      const noJsVid = noJsCookie.slice(0, 36);
      createdVisitors.add(noJsVid);
      expect((await eventsFor(noJsVid)).length).toBe(0);
    }
    await ctx.close();
  });

  test('CT3: a click records one click event per visitor per variant', async ({ browser }) => {
    const ctx = await freshContext(browser);
    const page = await ctx.newPage();
    await openHome(page);
    const vid = await visitorIdOf(ctx);
    const key = await shownKey(page, 'primary');

    await shown(page, 'primary').click();
    await page.waitForURL(/\/home-services/);
    await expectEventCount(vid, (r) => r.event_type === 'click' && r.button === 'primary' && r.variant_key === key, 1);

    // Clicking again on a later visit is free: still one row.
    await openHome(page);
    await shown(page, 'primary').click();
    await page.waitForURL(/\/home-services/);
    await page.waitForTimeout(1500);
    await expectEventCount(vid, (r) => r.event_type === 'click' && r.button === 'primary', 1);

    // Secondary is tracked independently.
    await openHome(page);
    await shown(page, 'secondary').click();
    await page.waitForURL(/\/portfolio/);
    await expectEventCount(vid, (r) => r.event_type === 'click' && r.button === 'secondary' && r.variant_key === 'A', 1);
    await ctx.close();
  });

  test('fix 3: the event sink mints a signed httpOnly id and ignores forged ids, unknown keys and orphan clicks', async () => {
    const ip = (n: number) => `10.206.${Date.now() % 250}.${n}`;
    const view = { button: 'primary', variant_key: 'A', event_type: 'view' };
    const click = { ...view, event_type: 'click' };

    // No cookie: minted, recorded, httpOnly, signed.
    const a = await apiClient(ip(1));
    const first = await a.post('/api/cta/event', { data: view });
    expect(first.status()).toBe(200);
    const setCookie = setCookieOf(first)!;
    expect(setCookie).toMatch(/^cta_vid=[0-9a-f-]{36}\.[A-Za-z0-9_-]{43};/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Max-Age=15552000/i);
    const vid = (await jarVisitor(a))!;
    expect((await eventsFor(vid)).length).toBe(1);
    // Same id again: no new cookie, repeat is free.
    const again = await a.post('/api/cta/event', { data: view });
    expect(again.status()).toBe(200);
    expect(setCookieOf(again)).toBeUndefined();
    expect((await eventsFor(vid)).length).toBe(1);
    // A click with its view: recorded.
    expect((await a.post('/api/cta/event', { data: click })).status()).toBe(200);
    expect((await eventsFor(vid)).filter((r) => r.event_type === 'click').length).toBe(1);
    // Unknown and inactive pairs: dropped.
    for (const bad of [{ ...view, variant_key: 'E' }, { ...view, button: 'secondary', variant_key: 'G' }]) {
      expect((await a.post('/api/cta/event', { data: bad })).status()).toBe(204);
    }
    expect((await eventsFor(vid)).length).toBe(2);
    // A click from a visitor whose cookie came in with the request, on a variant
    // with no view yet: the view is recorded alongside the click (the two beacons
    // race the navigation; a lost view must not lose the click).
    const clickFirst = await a.post('/api/cta/event', { data: { button: 'secondary', variant_key: 'A', event_type: 'click' } });
    expect(clickFirst.status()).toBe(200);
    const secondaryRows = (await eventsFor(vid)).filter((r) => r.button === 'secondary' && r.variant_key === 'A');
    expect(secondaryRows.map((r) => r.event_type).sort()).toEqual(['click', 'view']);
    await a.dispose();

    // A click with no view first (fresh visitor): minted, but not recorded.
    const b = await apiClient(ip(2));
    const orphan = await b.post('/api/cta/event', { data: click });
    expect(orphan.status()).toBe(204);
    expect(setCookieOf(orphan)).toBeTruthy();
    const bVid = (await jarVisitor(b))!;
    expect((await eventsFor(bVid)).length).toBe(0);
    await b.dispose();

    // A forged signature, and an old-style unsigned id: 204, nothing recorded, a fresh signed cookie issued.
    for (const forged of [`${vid}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`, '00000000-0000-4000-8000-0000000000aa']) {
      const c = await apiClient(ip(3), { Cookie: `cta_vid=${forged}` });
      const res = await c.post('/api/cta/event', { data: { ...view, variant_key: 'B' } });
      expect(res.status()).toBe(204);
      const fresh = setCookieOf(res)!;
      expect(fresh).toMatch(/^cta_vid=[0-9a-f-]{36}\./);
      createdVisitors.add(fresh.slice('cta_vid='.length, fresh.indexOf('.')));
      expect((await eventsFor(vid)).filter((r) => r.variant_key === 'B').length).toBe(0);
      await c.dispose();
    }
    expect((await eventsFor('00000000-0000-4000-8000-0000000000aa')).length).toBe(0);

    // The visitor id is no longer accepted from the body.
    const d = await apiClient(ip(4));
    const withId = await d.post('/api/cta/event', { data: { ...view, visitor_id: vid } });
    expect(withId.status()).toBe(400);
    await d.dispose();
  });

  test('fix 3b: the homepage response issues the signed id (middleware), and the event sink accepts it as its own', async ({ browser }) => {
    const ctx = await freshContext(browser);
    // The page's own view beacons would land under the same id; only the
    // event posted below may count, so the id must come from middleware alone.
    await ctx.route('**/api/cta/event', (route) => route.abort());
    const page = await ctx.newPage();
    await openHome(page);
    const cookie = (await ctx.cookies()).find((c) => c.name === 'cta_vid');
    expect(cookie, 'middleware sets cta_vid on the first homepage response').toBeTruthy();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.value).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    const vid = cookie!.value.slice(0, 36);
    createdVisitors.add(vid);
    await ctx.close();

    const api = await apiClient(`10.207.${Date.now() % 250}.9`, { Cookie: `cta_vid=${cookie!.value}` });
    const res = await api.post('/api/cta/event', { data: { button: 'primary', variant_key: 'A', event_type: 'view' } });
    expect(res.status(), 'the node verifier accepts the WebCrypto signature').toBe(200);
    expect(setCookieOf(res), 'no re-mint for a valid cookie').toBeUndefined();
    expect((await eventsFor(vid)).length).toBe(1);
    await api.dispose();
  });

  test('SEC1: the event sink caps, validates, never echoes errors, and rate limits per IP', async () => {
    const api = await apiClient(`10.204.${Date.now() % 250}.${Math.floor(Math.random() * 250) + 1}`);
    const ok = { button: 'primary', variant_key: 'A', event_type: 'view' };

    const big = await api.post('/api/cta/event', {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ ...ok, pad: 'x'.repeat(2000) }),
    });
    expect(big.status()).toBe(413);

    const bad = await api.post('/api/cta/event', { data: { ...ok, event_type: 'hover' } });
    expect(bad.status()).toBe(400);
    expect(await bad.json()).toEqual({ error: 'Invalid event' });

    const extra = await api.post('/api/cta/event', { data: { ...ok, injected: 1 } });
    expect(extra.status()).toBe(400);

    const notJson = await api.post('/api/cta/event', { headers: { 'Content-Type': 'application/json' }, data: '{nope' });
    expect(notJson.status()).toBe(400);

    // Duplicates are free (unique index): same answer twice, one row.
    for (let i = 0; i < 2; i++) expect((await api.post('/api/cta/event', { data: ok })).status()).toBe(200);
    const vid = (await jarVisitor(api))!;
    expect((await eventsFor(vid)).length).toBe(1);

    // 60 per minute per IP: the six calls above count, so the 61st overall is refused.
    const statuses: number[] = [];
    for (let i = 0; i < 56; i++) statuses.push((await api.post('/api/cta/event', { data: ok })).status());
    expect(statuses.filter((s) => s === 200).length).toBe(54);
    expect(statuses.slice(-2)).toEqual([429, 429]);
    const limited = await api.post('/api/cta/event', { data: ok });
    expect(limited.status()).toBe(429);
    expect(limited.headers()['retry-after']).toBeTruthy();
    await api.dispose();
    // A different IP is unaffected.
    const other = await apiClient(`10.205.${Date.now() % 250}.9`);
    expect((await other.post('/api/cta/event', { data: ok })).status()).toBe(200);
    await jarVisitor(other);
    await other.dispose();
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
    const ids = (n: number) => Array.from({ length: n }, () => { const id = randomUUID(); createdVisitors.add(id); return id; });
    const aIds = ids(10);
    const bIds = ids(10);
    const ev = (variant: string, event: string, visitor: string) => ({ experiment_key: 'hero-primary', variant_key: variant, event, visitor_id: visitor });
    for (let i = 0; i < 10; i++) {
      events.push(ev('A', 'view', aIds[i]));
      events.push(ev('B', 'view', bIds[i]));
    }
    for (let i = 0; i < 4; i++) events.push(ev('A', 'click', aIds[i]));
    for (let i = 0; i < 2; i++) events.push(ev('B', 'click', bIds[i]));
    await rest('POST', 'experiment_events', events, 'return=minimal');
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
    await page.getByRole('button', { name: 'Experiments' }).first().click({ force: true });
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
      // The Experiments tab has its own Refresh; this one belongs to the homepage buttons.
      await page.getByRole('region', { name: /Homepage buttons/ }).getByRole('button', { name: /Refresh/ }).click();
      await expect(callout).toContainText(`Leader: ${best[0].variant_key}`);
    } else {
      expect(at.buttons.primary.leader_status).toBe('tied');
    }

    // Validation: not a positive integer.
    const invalid = await ctx.request.patch('/api/admin/cta/settings', { data: { cta_min_visitors: 0 } });
    expect(invalid.status()).toBe(400);
    await ctx.close();
  });

  test('CT5 + fix 6: variants are created, edited and switched in admin, within the limits', async ({ browser }) => {
    test.setTimeout(150_000);
    const { ctx, page: adminPage } = await adminContext(browser);
    const api = ctx.request;
    try {
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

      // A variant with no events yet: wording, subtext and colour all edit in place.
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
      // The admin write revalidates '/', and the cached homepage is regenerated
      // within a few seconds, not always by the very next request: a fresh
      // visitor is tried until it is served B, for up to 10 seconds.
      let vid = '';
      await expect(async () => {
        const visitor = await freshContext(browser);
        try {
          const home = await visitor.newPage();
          await openHome(home);
          vid = await visitorIdOf(visitor);
          const sec = shown(home, 'secondary');
          await expect(sec).toHaveAttribute('data-cta-variant', 'B', { timeout: 1_000 });
          await expect(sec).toContainText(`${TAG} edited`);
          await expect(sec).toContainText('Small line');
          expect(await sec.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(31, 122, 77)');
          // B now has a recorded view.
          await expectEventCount(vid, (r) => r.button === 'secondary' && r.variant_key === 'B' && r.event_type === 'view', 1);
        } finally {
          await visitor.close();
        }
      }).toPass({ timeout: 10_000, intervals: [500, 1000, 2000] });

      // Fix 6: B has events, so its wording is frozen; subtext and colour still edit.
      const frozen = await api.patch('/api/admin/cta/variants', { data: { button: 'secondary', variant_key: 'B', wording: `${TAG} renamed` } });
      expect(frozen.status()).toBe(409);
      expect((await frozen.json()).error).toMatch(/Deactivate it and add a new variant/);
      const sameWording = await api.patch('/api/admin/cta/variants', { data: { button: 'secondary', variant_key: 'B', wording: `${TAG} edited` } });
      expect(sameWording.status()).toBe(200);
      expect((await api.patch('/api/admin/cta/variants', { data: { button: 'secondary', variant_key: 'B', subtext: 'Other line', color: '' } })).status()).toBe(200);

      // Fix 6 in the tab: a new wording on B becomes "deactivate B and add a new variant".
      // Free a slot first (seven exist): the new variant needs a key.
      const withoutG = (await heroVariants('secondary')).filter((v) => !(v.key === 'G' && String(v.label).startsWith(TAG)));
      await rest('PATCH', `experiments?key=eq.${HERO_KEYS.secondary}`, { variants: withoutG }, 'return=minimal');
      await adminPage.getByRole('button', { name: 'Marketing' }).first().click({ force: true });
      await adminPage.getByRole('button', { name: 'Experiments' }).first().click({ force: true });
      await adminPage.getByRole('button', { name: 'Edit secondary variant B' }).click();
      const editor = adminPage.locator('form').filter({ has: adminPage.getByText('Colour (blank = default)') }).first();
      await editor.getByLabel('Wording').fill(`${TAG} replacement`);
      await expect(editor.getByRole('status')).toContainText('cannot change');
      await editor.getByRole('button', { name: 'Deactivate B and add new variant' }).click();
      await expect(adminPage.getByTestId('cta-row-secondary-G')).toContainText(`${TAG} replacement`);
      const after = (await (await api.get('/api/admin/cta/variants')).json()).variants as { button: string; variant_key: string; active: boolean; wording: string }[];
      const sec2 = (k: string) => after.find((v) => v.button === 'secondary' && v.variant_key === k)!;
      expect(sec2('G')).toMatchObject({ wording: `${TAG} replacement`, active: true });
      expect(sec2('B')).toMatchObject({ wording: `${TAG} edited`, active: false });

      // Restore: A back on, G off (the finally below drops the created variants).
      expect((await api.patch('/api/admin/cta/variants', { data: { button: 'secondary', variant_key: 'A', active: true } })).status()).toBe(200);
      expect((await api.patch('/api/admin/cta/variants', { data: { button: 'secondary', variant_key: 'G', active: false } })).status()).toBe(200);
    } finally {
      // Whatever failed above, the homepage buttons go back to the seed and the cached homepage is refreshed.
      await restoreHeroButtons(api);
      await ctx.close();
    }
  });
});
