import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';
import http from 'http';
import { createHmac } from 'crypto';
import { completionCutoff, currentSeason, SEASON_LABEL } from '@/lib/homecare/season';

const root = process.cwd();
const EVIDENCE_DIR = process.env.HC_EVIDENCE_DIR || join(root, 'test-results', 'hc-checklist-ux');

// ---------------------------------------------------------------------------
// Live portal E2E — real server + stubbed Supabase REST (wave-1 recipe):
//
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9417 \
//   SUPABASE_SECRET_KEY=sb-stub-secret \
//   LISTINGS_ACCESS_SECRET=hc-e2e-secret \
//   npx next dev -p 3100
//
//   HC_PORTAL_E2E=1 TEST_URL=http://127.0.0.1:3100 HC_E2E_STUB_PORT=9417 \
//   npx playwright test tests/home-care-checklist-ux.spec.ts --project=chromium
// ---------------------------------------------------------------------------

const RUN_PORTAL_E2E = process.env.HC_PORTAL_E2E === '1';
const STUB_PORT = Number(process.env.HC_E2E_STUB_PORT || 9417);
const ACCESS_SECRET = process.env.HC_E2E_ACCESS_SECRET || 'hc-e2e-secret';
const BASE = process.env.TEST_URL || 'http://localhost:3000';

const SEASON_NOW = currentSeason();
const LABEL_NOW = SEASON_LABEL[SEASON_NOW];
const MEMBER_ID = 'eeeeeeee-5555-4555-8555-555555555555';

interface CatalogRow {
  key: string; title: string; blurb: string; applies_to: string[]; stages: string[];
  seasons: string[]; frequency: string; diy_or_pro: string; bookable: boolean;
  est_cost_low: number | null; est_cost_high: number | null; priority: number; starter: boolean;
}

const ALL_SEASONS = ['spring', 'summer', 'fall', 'winter'];
const LONG_BLURB =
  'Walk the whole exterior with a notepad: check every downspout extension actually carries water six feet away from the foundation, look for peeling paint or soft trim around windows and doors, probe sill plates and deck ledgers for rot, confirm grading still slopes away from the house, and photograph anything that changed since last season so you can compare year over year and catch slow problems while they are still cheap to fix.';

// Four year-round seasonal tasks + two one-time essentials (just_bought).
const SEASONAL: CatalogRow[] = [
  { key: 'stale_done_task', title: 'Clean the gutters', blurb: 'Clear leaves and grit so water drains.', applies_to: ['all'], stages: ['all'], seasons: ALL_SEASONS, frequency: 'annual', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 10, starter: false },
  { key: 'long_blurb_task', title: 'Inspect the exterior envelope', blurb: LONG_BLURB, applies_to: ['all'], stages: ['all'], seasons: ALL_SEASONS, frequency: 'annual', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 9, starter: false },
  { key: 'fresh_done_task', title: 'Test smoke & CO detectors', blurb: 'Press test on every alarm and swap batteries.', applies_to: ['all'], stages: ['all'], seasons: ALL_SEASONS, frequency: 'quarterly', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 8, starter: false },
  { key: 'bookable_task', title: 'Flush the water heater', blurb: 'Sediment shortens the tank life.', applies_to: ['all'], stages: ['all'], seasons: ALL_SEASONS, frequency: 'annual', diy_or_pro: 'pro', bookable: true, est_cost_low: 100, est_cost_high: 200, priority: 7, starter: false },
];
const ESSENTIALS: CatalogRow[] = [
  { key: 'find_main_water_shutoff', title: 'Find the main water shut-off', blurb: 'Know where it is before you need it.', applies_to: ['all'], stages: ['just_bought', 'new_construction'], seasons: [], frequency: 'annual', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 20, starter: true },
  { key: 'rekey_locks', title: 'Rekey the locks', blurb: 'You never know who has a copy of the old keys.', applies_to: ['all'], stages: ['just_bought', 'new_construction'], seasons: [], frequency: 'annual', diy_or_pro: 'pro', bookable: true, est_cost_low: 80, est_cost_high: 200, priority: 18, starter: true },
];
const CATALOG: CatalogRow[] = [...SEASONAL, ...ESSENTIALS];
const PLAN_TOTAL = SEASONAL.length + ESSENTIALS.length;

// Seeded homeowner_maintenance rows exercising the seasonal reset:
//  - stale_done_task: completed one day BEFORE this season's cutoff -> expired,
//    must render unchecked (the seasonal reset).
//  - fresh_done_task: completed now -> still counts.
//  - starter essential: completed two years ago -> starter never expires.
const CUTOFF = completionCutoff(SEASON_NOW);
const STALE_AT = new Date(CUTOFF.getTime() - 24 * 60 * 60 * 1000).toISOString();
const FRESH_AT = new Date().toISOString();
const OLD_STARTER_AT = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();

test.describe('Home Care: compact rows, done-to-bottom, all-done minimize, seasonal reset (live UI)', () => {
  test.skip(!RUN_PORTAL_E2E, 'Needs the stub-backed portal server — see the run recipe in this spec.');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  const HOMEOWNER = {
    id: MEMBER_ID, email: 'mia@example.com', first_name: 'Mia', phone: null, zip: '07901',
    home_type: 'single_family', status: 'active', verify_token: null, verify_token_expires_at: null,
    unsubscribe_token: 'tok-ux', verified_at: new Date().toISOString(), unsubscribed_at: null,
    source: 'home_care', created_at: new Date().toISOString(), updated_at: null,
  };

  // (task_key|season) -> { status, completed_at }, like the upsert key.
  const maintStore = new Map<string, { status: string; completed_at: string | null }>();
  let stub: http.Server;

  test.beforeAll(async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    maintStore.set(`stale_done_task|${SEASON_NOW}`, { status: 'done', completed_at: STALE_AT });
    maintStore.set(`fresh_done_task|${SEASON_NOW}`, { status: 'done', completed_at: FRESH_AT });
    maintStore.set('find_main_water_shutoff|starter', { status: 'done', completed_at: OLD_STARTER_AT });

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
          return json(200, [{ systems: { hvac: true }, stage: 'just_bought', homeowner_type: null }]);
        }
        if (url.pathname === '/rest/v1/homeowner_maintenance') {
          if (req.method === 'POST') {
            try {
              const b = JSON.parse(raw) as { task_key: string; season: string; status: string; completed_at?: string | null };
              maintStore.set(`${b.task_key}|${b.season}`, { status: b.status, completed_at: b.completed_at ?? null });
            } catch { /* ignore malformed */ }
            res.writeHead(201).end();
            return;
          }
          const rows = [...maintStore.entries()]
            .filter(([, v]) => v.status === 'done' || v.status === 'dismissed')
            .map(([k, v]) => {
              const [task_key, season] = k.split('|');
              return { task_key, season, status: v.status, completed_at: v.completed_at };
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

  const planHeader = (page: Page) => page.locator('div.sticky', { has: page.getByRole('progressbar') });
  const taskRow = (page: Page, title: string) =>
    page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: title, exact: true }) });

  async function openChecklist(page: Page) {
    await page.context().addCookies([{ name: 'hc_access', value: mintCookie(MEMBER_ID), url: BASE }]);
    await page.goto('/home-care/checklist', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await expect(page.getByText('Welcome back, Mia')).toBeVisible();
    // Hydration gate: the mounted effect swaps the SSR top: 0px for the
    // measured site-header height, proving React handlers are attached.
    await expect(planHeader(page)).not.toHaveCSS('top', '0px', { timeout: 30_000 });
  }

  async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
    await page.evaluate(() => document.querySelector('nextjs-portal')?.remove()); // dev-only badge
    await page.screenshot({ path: join(EVIDENCE_DIR, name), fullPage: opts.fullPage ?? false });
  }

  const markDone = async (page: Page, title: string) => {
    await taskRow(page, title).getByRole('button', { name: 'Mark done' }).click();
    await expect(taskRow(page, title).getByRole('button', { name: 'Mark not done' })).toBeVisible();
  };

  test('R1: seasonal reset — an expired completion renders unchecked, fresh + starter still count', async ({ page }) => {
    await openChecklist(page);

    // Expired seasonal completion starts the season fresh.
    await expect(taskRow(page, 'Clean the gutters').getByRole('button', { name: 'Mark done' })).toBeVisible();
    // A completion inside the current window still counts.
    await expect(taskRow(page, 'Test smoke & CO detectors').getByRole('button', { name: 'Mark not done' })).toBeVisible();
    // One-time starter work never expires.
    await expect(taskRow(page, 'Find the main water shut-off').getByRole('button', { name: 'Mark not done' })).toBeVisible();
    // Plan bar counts only the two live completions: fresh seasonal + starter.
    await expect(page.getByText(`${LABEL_NOW} + essentials · 2 of ${PLAN_TOTAL} done`)).toBeVisible();
    await shot(page, '01-seasonal-reset-stale-unchecked.png', { fullPage: true });
  });

  test('C1: long blurbs clamp to two lines with Read more, tap expands and collapses', async ({ page }) => {
    await openChecklist(page);
    const row = taskRow(page, 'Inspect the exterior envelope');
    const blurbToggle = row.locator('button[aria-expanded]');
    const blurbText = blurbToggle.locator('span').first();

    // Clamped: two-line clamp is active and the text actually overflows.
    await expect(blurbToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(row.getByText('Read more')).toBeVisible();
    const clamped = await blurbText.evaluate((el) => ({
      lineClamp: getComputedStyle(el).webkitLineClamp,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    }));
    expect(clamped.lineClamp).toBe('2');
    expect(clamped.scrollHeight).toBeGreaterThan(clamped.clientHeight + 1);
    await row.scrollIntoViewIfNeeded();
    await shot(page, '02-blurb-clamped-two-lines.png');

    // Expand: full text visible, taller than the clamped box.
    await blurbToggle.click();
    await expect(blurbToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(row.getByText('Show less')).toBeVisible();
    const expandedHeight = await blurbText.evaluate((el) => el.clientHeight);
    expect(expandedHeight).toBeGreaterThan(clamped.clientHeight + 1);
    await shot(page, '03-blurb-expanded.png');

    // Collapse again.
    await blurbToggle.click();
    await expect(blurbToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(row.getByText('Read more')).toBeVisible();

    // A short blurb is not a toggle at all.
    await expect(taskRow(page, 'Clean the gutters').locator('button[aria-expanded]')).toHaveCount(0);
  });

  test('M1: mobile rows are compact — title hugs the left edge, blurb runs full card width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openChecklist(page);

    const row = taskRow(page, 'Flush the water heater');
    await row.scrollIntoViewIfNeeded();
    const card = await row.boundingBox();
    const title = await row.getByRole('heading', { name: 'Flush the water heater' }).boundingBox();
    const blurb = await row.locator('span.line-clamp-2').boundingBox();
    expect(card).not.toBeNull();
    expect(title).not.toBeNull();
    expect(blurb).not.toBeNull();

    // Slim checkbox gutter: the checkbox button keeps its 44px WCAG minimum
    // width, but -ml-3/-mr-1 pull it toward the edge so the title starts
    // ~53px in, versus ~72px (16px padding + 44px button + 12px gap) before.
    expect(title!.x - card!.x).toBeLessThanOrEqual(56);
    // The description is NOT indented under the checkbox — it starts at the
    // card padding, left of the title, and spans (nearly) the full card width.
    expect(blurb!.x).toBeLessThan(title!.x);
    expect(blurb!.x - card!.x).toBeLessThanOrEqual(20);
    expect(blurb!.width).toBeGreaterThan(card!.width * 0.8);
    await shot(page, '04-mobile-compact-row.png');
  });

  test('D1: checking a task sinks it below the remaining to-dos', async ({ page }) => {
    await openChecklist(page);

    // fresh_done_task was seeded done, so it already sits at the bottom of the
    // seasonal group on load (priority order says it belongs 3rd of 4).
    const seasonalSet = new Set(SEASONAL.map((t) => t.title));
    const seasonalTitles = async () =>
      (await page.locator('h3').allTextContents()).filter((t) => seasonalSet.has(t));
    expect(await seasonalTitles()).toEqual([
      'Clean the gutters', 'Inspect the exterior envelope', 'Flush the water heater', 'Test smoke & CO detectors',
    ]);

    // Checking the top task drops it below every remaining to-do.
    await markDone(page, 'Clean the gutters');
    await expect
      .poll(async () => seasonalTitles())
      .toEqual(['Inspect the exterior envelope', 'Flush the water heater', 'Clean the gutters', 'Test smoke & CO detectors']);
    await shot(page, '05-done-task-sinks-to-bottom.png', { fullPage: true });
  });

  test('D2: completing everything minimizes the list to a summary strip, Show completed peeks', async ({ page }) => {
    await openChecklist(page);
    await markDone(page, 'Inspect the exterior envelope');
    await markDone(page, 'Flush the water heater');
    // The final check-off minimizes the list immediately, so the row's
    // "Mark not done" state never becomes visible — click and assert the strip.
    await taskRow(page, 'Rekey the locks').getByRole('button', { name: 'Mark done' }).click();

    // The plan is complete and the list minimizes into the quiet strip.
    await expect(page.getByText(`All ${PLAN_TOTAL} tasks handled — nothing left to do right now.`)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Clean the gutters' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'New Homeowner Essentials' })).toHaveCount(0);
    await expect(page.getByText(`${LABEL_NOW} + essentials · ${PLAN_TOTAL} of ${PLAN_TOTAL} done`)).toBeVisible();
    await shot(page, '06-all-done-minimized-strip.png', { fullPage: true });

    // Peek at the completed list on demand.
    await page.getByRole('button', { name: 'Show completed' }).click();
    await expect(page.getByRole('heading', { name: 'Clean the gutters' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'New Homeowner Essentials' })).toBeVisible();
    await shot(page, '07-show-completed-peek.png', { fullPage: true });

    // The minimized state is server-persisted: a fresh load lands minimized.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Welcome back, Mia')).toBeVisible();
    await expect(page.getByText(`All ${PLAN_TOTAL} tasks handled — nothing left to do right now.`)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Clean the gutters' })).toHaveCount(0);
  });
});
