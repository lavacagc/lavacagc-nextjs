import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';
import http from 'http';
import { createHmac } from 'crypto';
import { currentSeason, SEASON_LABEL } from '@/lib/homecare/season';

const root = process.cwd();
const EVIDENCE_DIR = process.env.HC_EVIDENCE_DIR || join(root, 'test-results', 'hc-sticky-progress');

// ---------------------------------------------------------------------------
// Live portal E2E — real server + stubbed Supabase REST (wave-1 recipe):
//
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9417 \
//   SUPABASE_SECRET_KEY=sb-stub-secret \
//   LISTINGS_ACCESS_SECRET=hc-e2e-secret \
//   npx next dev -p 3100
//
//   HC_PORTAL_E2E=1 TEST_URL=http://127.0.0.1:3100 HC_E2E_STUB_PORT=9417 \
//   npx playwright test tests/home-care-sticky-progress.spec.ts --project=chromium
// ---------------------------------------------------------------------------

const RUN_PORTAL_E2E = process.env.HC_PORTAL_E2E === '1';
const STUB_PORT = Number(process.env.HC_E2E_STUB_PORT || 9417);
const ACCESS_SECRET = process.env.HC_E2E_ACCESS_SECRET || 'hc-e2e-secret';
const BASE = process.env.TEST_URL || 'http://localhost:3000';

const SEASON_NOW = currentSeason();
const LABEL_NOW = SEASON_LABEL[SEASON_NOW];
const PLAN_LABEL = `${LABEL_NOW} + essentials`;

const MEMBER_ID = 'dddddddd-4444-4444-8444-444444444444';

interface CatalogRow {
  key: string; title: string; blurb: string; applies_to: string[]; stages: string[];
  seasons: string[]; frequency: string; diy_or_pro: string; bookable: boolean;
  est_cost_low: number | null; est_cost_high: number | null; priority: number; starter: boolean;
}

// Three year-round seasonal tasks + two one-time essentials for a just_bought
// member: the plan bar must read "<Season> + essentials · n of 5 done".
const ALL_SEASONS = ['spring', 'summer', 'fall', 'winter'];
const SEASONAL: CatalogRow[] = [
  { key: 'test_smoke_co', title: 'Test smoke & CO detectors', blurb: 'Press test on every alarm and swap batteries.', applies_to: ['all'], stages: ['all'], seasons: ALL_SEASONS, frequency: 'quarterly', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 10, starter: false },
  { key: 'replace_hvac_filter', title: 'Replace the HVAC filter', blurb: 'A fresh filter every few months protects the system.', applies_to: ['all'], stages: ['all'], seasons: ALL_SEASONS, frequency: 'quarterly', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 8, starter: false },
  { key: 'clean_dryer_vent', title: 'Clean the dryer vent', blurb: 'Lint buildup is a top home-fire cause.', applies_to: ['all'], stages: ['all'], seasons: ALL_SEASONS, frequency: 'annual', diy_or_pro: 'pro', bookable: true, est_cost_low: 100, est_cost_high: 200, priority: 7, starter: false },
];
const ESSENTIALS: CatalogRow[] = [
  { key: 'find_main_water_shutoff', title: 'Find the main water shut-off', blurb: 'Know where it is before you need it.', applies_to: ['all'], stages: ['just_bought', 'new_construction'], seasons: [], frequency: 'annual', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 20, starter: true },
  { key: 'rekey_locks', title: 'Rekey the locks', blurb: 'You never know who has a copy of the old keys.', applies_to: ['all'], stages: ['just_bought', 'new_construction'], seasons: [], frequency: 'annual', diy_or_pro: 'pro', bookable: true, est_cost_low: 80, est_cost_high: 200, priority: 18, starter: true },
];
const CATALOG: CatalogRow[] = [...SEASONAL, ...ESSENTIALS];
const PLAN_TOTAL = SEASONAL.length + ESSENTIALS.length;

test.describe('Home Care: sticky plan header + essentials in the plan progress (live UI)', () => {
  test.skip(!RUN_PORTAL_E2E, 'Needs the stub-backed portal server — see the run recipe in this spec.');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  const HOMEOWNER = {
    id: MEMBER_ID, email: 'noah@example.com', first_name: 'Noah', phone: null, zip: '07901',
    home_type: 'single_family', status: 'active', verify_token: null, verify_token_expires_at: null,
    unsubscribe_token: 'tok-sticky', verified_at: new Date().toISOString(), unsubscribed_at: null,
    source: 'home_care', created_at: new Date().toISOString(),
    updated_at: null,
  };

  // (task_key|season) -> status, exactly like the homeowner_maintenance upsert key.
  const maintStore = new Map<string, string>();
  const maintWrites: Array<{ task_key: string; season: string; status: string }> = [];
  let stub: http.Server;

  test.beforeAll(async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    stub = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${STUB_PORT}`);
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        if (url.pathname === '/rest/v1/maintenance_catalog') return json(200, CATALOG);
        if (url.pathname === '/rest/v1/homeowners') {
          if (req.method === 'PATCH') return json(204, undefined); // last_seen_at touch
          return json(200, [HOMEOWNER]);
        }
        if (url.pathname === '/rest/v1/home_profiles') {
          // just_bought → the New Homeowner Essentials section shows.
          return json(200, [{ systems: { hvac: true }, stage: 'just_bought', homeowner_type: null }]);
        }
        if (url.pathname === '/rest/v1/homeowner_maintenance') {
          if (req.method === 'POST') {
            try {
              const b = JSON.parse(raw) as { task_key: string; season: string; status: string };
              maintStore.set(`${b.task_key}|${b.season}`, b.status);
              maintWrites.push({ task_key: b.task_key, season: b.season, status: b.status });
            } catch { /* ignore malformed */ }
            res.writeHead(201).end();
            return;
          }
          const rows = [...maintStore.entries()]
            .filter(([, status]) => status === 'done' || status === 'dismissed')
            .map(([k, status]) => {
              const [task_key, season] = k.split('|');
              return { task_key, season, status };
            });
          return json(200, rows);
        }
        json(404, { message: `stub: unhandled ${req.method} ${url.pathname}` });
      });
    });
    await new Promise<void>((resolve, reject) => {
      stub.once('error', reject);
      stub.listen(STUB_PORT, '127.0.0.1', resolve);
    });
  });

  test.afterAll(async () => {
    if (stub) await new Promise((resolve) => stub.close(resolve));
  });

  // Mint an hc_access cookie exactly the way accessCookie.ts signs it.
  const b64url = (b: Buffer) => b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  function mintCookie(homeownerId: string): string {
    const payload = b64url(Buffer.from(`${homeownerId}.${Math.floor(Date.now() / 1000)}`));
    const sig = b64url(createHmac('sha256', ACCESS_SECRET).update(payload).digest());
    return `${payload}.${sig}`;
  }

  async function openChecklist(page: Page) {
    await page.context().addCookies([{ name: 'hc_access', value: mintCookie(MEMBER_ID), url: BASE }]);
    await page.goto('/home-care/checklist', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await expect(page).toHaveURL(/home-care\/checklist/);
    await expect(page.getByText('Welcome back, Noah')).toBeVisible();
    // Hydration gate before clicking: SSR renders the plan header with
    // top: 0px; the mounted ResizeObserver effect swaps in the measured site
    // header height, so a non-zero top proves React handlers are attached.
    await expect(planHeader(page)).not.toHaveCSS('top', '0px', { timeout: 30_000 });
  }

  async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
    await page.evaluate(() => document.querySelector('nextjs-portal')?.remove()); // dev-only badge
    await page.screenshot({ path: join(EVIDENCE_DIR, name), fullPage: opts.fullPage ?? false });
  }

  const planHeader = (page: Page) => page.locator('div.sticky', { has: page.getByRole('progressbar') });
  const planText = (page: Page) => page.getByText(new RegExp(`${LABEL_NOW} \\+ essentials · \\d+ of \\d+ done`));
  const planBar = (page: Page) => page.getByRole('progressbar', { name: `${PLAN_LABEL} progress` });
  const taskRow = (page: Page, title: string) =>
    page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: title, exact: true }) });
  const markDone = async (page: Page, title: string) => {
    await taskRow(page, title).getByRole('button', { name: 'Mark done' }).click();
    await expect(taskRow(page, title).getByRole('button', { name: 'Mark not done' })).toBeVisible();
  };

  test('E1: essentials count toward the one plan progress bar', async ({ page }) => {
    await openChecklist(page);

    // Essentials render inside the checklist, and the single plan bar counts them.
    await expect(page.getByRole('heading', { name: 'New Homeowner Essentials' })).toBeVisible();
    await expect(planText(page)).toHaveText(`${PLAN_LABEL} · 0 of ${PLAN_TOTAL} done`);
    await expect(planBar(page)).toHaveAttribute('aria-valuenow', '0');
    await expect(page.getByText(`${PLAN_TOTAL} to go — progress is saved.`)).toBeVisible();
    await shot(page, '01-plan-bar-counts-essentials.png', { fullPage: true });

    // Checking an essential moves the same bar (1/5 = 20%).
    await markDone(page, ESSENTIALS[0].title);
    await expect(planText(page)).toHaveText(`${PLAN_LABEL} · 1 of ${PLAN_TOTAL} done`);
    await expect(planBar(page)).toHaveAttribute('aria-valuenow', '20');
    expect(maintWrites).toContainEqual({ task_key: ESSENTIALS[0].key, season: 'starter', status: 'done' });

    // A seasonal task moves the same bar too (2/5 = 40%).
    await markDone(page, SEASONAL[0].title);
    await expect(planText(page)).toHaveText(`${PLAN_LABEL} · 2 of ${PLAN_TOTAL} done`);
    await expect(planBar(page)).toHaveAttribute('aria-valuenow', '40');
    await shot(page, '02-essential-plus-seasonal-move-one-bar.png');

    // Persists across a full reload (served back from the stub, not local state).
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Welcome back, Noah')).toBeVisible();
    await expect(planText(page)).toHaveText(`${PLAN_LABEL} · 2 of ${PLAN_TOTAL} done`);
  });

  test('S1: plan header sticks below the site header while scrolling the list', async ({ page }) => {
    await openChecklist(page);
    await expect(planText(page)).toBeVisible();

    // Scroll deep into the list (last task centered) — the plan header must
    // stay pinned just below the sticky site header instead of scrolling away.
    await taskRow(page, SEASONAL[2].title).evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    await expect(planBar(page)).toBeInViewport();
    const siteHeader = await page.locator('header').boundingBox();
    const plan = await planHeader(page).boundingBox();
    expect(siteHeader).not.toBeNull();
    expect(plan).not.toBeNull();
    expect(Math.abs(plan!.y - (siteHeader!.y + siteHeader!.height))).toBeLessThanOrEqual(2);
    await shot(page, '03-sticky-plan-header-at-page-bottom.png');

    // Checking a task far down the list updates the bar that is still on screen.
    await taskRow(page, SEASONAL[2].title).scrollIntoViewIfNeeded();
    await markDone(page, SEASONAL[2].title);
    await expect(planText(page)).toHaveText(`${PLAN_LABEL} · 3 of ${PLAN_TOTAL} done`);
    await expect(planBar(page)).toBeInViewport();
    await shot(page, '04-check-off-while-scrolled-bar-visible.png');
  });

  test('S2: sticky plan header works on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openChecklist(page);
    await taskRow(page, SEASONAL[2].title).evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    await expect(planBar(page)).toBeInViewport();
    const siteHeader = await page.locator('header').boundingBox();
    const plan = await planHeader(page).boundingBox();
    expect(Math.abs(plan!.y - (siteHeader!.y + siteHeader!.height))).toBeLessThanOrEqual(2);
    await shot(page, '05-sticky-plan-header-mobile.png');
  });

  test('E2: finishing seasonal + essentials completes the plan with the combined celebration', async ({ page }) => {
    await openChecklist(page);
    await markDone(page, SEASONAL[1].title);
    await markDone(page, ESSENTIALS[1].title);

    await expect(planText(page)).toHaveText(`${PLAN_LABEL} · ${PLAN_TOTAL} of ${PLAN_TOTAL} done`);
    await expect(planBar(page)).toHaveAttribute('aria-valuenow', '100');
    await expect(page.getByText('Everything handled — progress is saved.')).toBeVisible();

    // Celebration copy acknowledges the essentials are part of the plan.
    const card = page.locator('div.rounded-2xl', { hasText: `${LABEL_NOW}: done.` });
    await expect(card).toBeVisible();
    await expect(card).toContainText('essentials and all');
    await shot(page, '06-plan-complete-essentials-and-all.png', { fullPage: true });
  });
});
