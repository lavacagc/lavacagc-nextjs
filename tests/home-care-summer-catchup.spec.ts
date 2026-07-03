import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import http from 'http';
import { createHmac } from 'crypto';
import { currentSeason, nextSeason, prevSeason, seasonStart, SEASON_LABEL, type Season } from '@/lib/homecare/season';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const SUMMER_MIGRATION = 'supabase/migrations/20260802000000_summer_catalog_additions.sql';
const NEW_SUMMER_KEYS = [
  'rinse_ac_condenser',
  'flush_ac_condensate',
  'summer_gutter_check',
  'prune_trees_house',
  'washing_machine_hoses',
  'wasp_nest_check',
  'basement_humidity',
  'bath_fan_clean',
];

interface CatalogRow {
  key: string;
  title: string;
  blurb: string;
  applies_to: string[];
  stages: string[];
  seasons: string[];
  frequency: string;
  diy_or_pro: string;
  bookable: boolean;
  est_cost_low: number | null;
  est_cost_high: number | null;
  priority: number;
  starter: boolean;
}

/** Parse the INSERT tuples of the summer migration so the E2E stub serves the
 *  exact rows production will get — not a hand-copied fixture that can drift. */
function parseSummerRows(sql: string): CatalogRow[] {
  const tuple =
    /\('([a-z_]+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*ARRAY\[([^\]]*)\],\s*ARRAY\[([^\]]*)\],\s*ARRAY\[([^\]]*)\],\s*'([a-z]+)',\s*'([a-z]+)',\s*(TRUE|FALSE),\s*(NULL|\d+),\s*(NULL|\d+),\s*(\d+),\s*(TRUE|FALSE)\)/g;
  const str = (s: string) => s.replace(/''/g, "'");
  const arr = (s: string) => [...s.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const num = (s: string) => (s === 'NULL' ? null : Number(s));
  const rows: CatalogRow[] = [];
  for (const m of sql.matchAll(tuple)) {
    rows.push({
      key: m[1], title: str(m[2]), blurb: str(m[3]),
      applies_to: arr(m[4]), stages: arr(m[5]), seasons: arr(m[6]),
      frequency: m[7], diy_or_pro: m[8], bookable: m[9] === 'TRUE',
      est_cost_low: num(m[10]), est_cost_high: num(m[11]),
      priority: Number(m[12]), starter: m[13] === 'TRUE',
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Season helpers (pure) — the boundaries the catch-up gate hangs off.
// ---------------------------------------------------------------------------

test('prevSeason / nextSeason are inverse walks of the same season order', () => {
  const seasons: Season[] = ['winter', 'spring', 'summer', 'fall'];
  for (const s of seasons) {
    expect(prevSeason(nextSeason(s))).toBe(s);
    expect(nextSeason(prevSeason(s))).toBe(s);
  }
  expect(prevSeason('summer')).toBe('spring'); // the July catch-up case
  expect(prevSeason('winter')).toBe('fall');
});

test('seasonStart returns the UTC first-of-month the current season began', () => {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  expect(iso(seasonStart(new Date('2026-07-02T12:00:00Z')))).toBe('2026-06-01'); // mid-summer
  expect(iso(seasonStart(new Date('2026-06-01T00:00:00Z')))).toBe('2026-06-01'); // first day of summer
  expect(iso(seasonStart(new Date('2026-01-15T00:00:00Z')))).toBe('2025-12-01'); // winter wraps the year
  expect(iso(seasonStart(new Date('2026-12-25T00:00:00Z')))).toBe('2026-12-01');
  expect(iso(seasonStart(new Date('2026-05-31T23:59:59Z')))).toBe('2026-03-01'); // last day of spring
});

test('currentSeason boundaries agree with seasonStart months', () => {
  expect(currentSeason(new Date('2026-05-31T00:00:00Z'))).toBe('spring');
  expect(currentSeason(new Date('2026-06-01T00:00:00Z'))).toBe('summer');
  expect(currentSeason(new Date('2026-08-31T00:00:00Z'))).toBe('summer');
  expect(currentSeason(new Date('2026-09-01T00:00:00Z'))).toBe('fall');
  expect(currentSeason(new Date('2026-12-01T00:00:00Z'))).toBe('winter');
  expect(currentSeason(new Date('2026-02-28T00:00:00Z'))).toBe('winter');
});

// ---------------------------------------------------------------------------
// Summer catalog migration — file-level guards in the catalog-v2 spec style.
// ---------------------------------------------------------------------------

test('summer migration adds the 8 NJ tasks, all summer-tagged with matchable applies_to', () => {
  const sql = read(SUMMER_MIGRATION);
  const rows = parseSummerRows(sql);
  expect(rows.map((r) => r.key).sort()).toEqual([...NEW_SUMMER_KEYS].sort());
  const VALID = new Set(['all', 'roof', 'water_heater', 'windows', 'exterior', 'plumbing', 'gutters', 'hvac', 'lawn', 'deck', 'sump_pump', 'fireplace', 'driveway', 'pool', 'septic', 'garage']);
  for (const r of rows) {
    expect(r.seasons, r.key).toContain('summer');
    expect(r.stages, r.key).toEqual(['all']);
    expect(r.starter, r.key).toBe(false);
    for (const a of r.applies_to) expect(VALID.has(a), `${r.key} applies_to '${a}'`).toBe(true);
  }
  // Idempotent for the by-hand prod apply followed by db push.
  expect(sql).toContain('ON CONFLICT (key) DO NOTHING');
});

test('summer migration shows dryer-vent cleaning in summer as well as fall (idempotently)', () => {
  const sql = read(SUMMER_MIGRATION);
  expect(sql).toMatch(/UPDATE public\.maintenance_catalog\s+SET seasons = array_append\(seasons, 'summer'\)\s+WHERE key = 'clean_dryer_vent' AND NOT \('summer' = ANY\(seasons\)\)/);
});

// ---------------------------------------------------------------------------
// No-emoji rule + catch-up wiring — file-level guards.
// ---------------------------------------------------------------------------

test('portal stage UI carries no emoji: lucide icons only', () => {
  const pictograph = /\p{Extended_Pictographic}/u;
  const profile = read('src/lib/homecare/profile.ts');
  expect(profile).not.toContain('emoji');
  expect(profile).not.toMatch(pictograph);
  const wizard = read('src/components/homecare/HomeCareSetupWizard.tsx');
  expect(wizard).not.toMatch(pictograph);
  expect(wizard).toContain('STAGE_ICONS');
  expect(read('src/app/home-care/checklist/page.tsx')).not.toMatch(pictograph);
});

test('checklist page gates catch-up on membership predating the season start', () => {
  const src = read('src/app/home-care/checklist/page.tsx');
  expect(src).toContain('memberSince.getTime() < seasonStart().getTime()');
  expect(src).toContain('showCatchUp={showCatchUp}');
});

// ---------------------------------------------------------------------------
// Live portal E2E — real server + stubbed Supabase REST serving the actual
// migration rows. Needs a running app whose server env points at the stub:
//
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9412 \
//   SUPABASE_SECRET_KEY=sb-stub-secret \
//   LISTINGS_ACCESS_SECRET=hc-e2e-secret \
//   npx next dev -p 3100
//
//   HC_PORTAL_E2E=1 TEST_URL=http://127.0.0.1:3100 \
//   npx playwright test tests/home-care-summer-catchup.spec.ts --project=chromium
// ---------------------------------------------------------------------------

const RUN_PORTAL_E2E = process.env.HC_PORTAL_E2E === '1';
const STUB_PORT = Number(process.env.HC_E2E_STUB_PORT || 9412);
const ACCESS_SECRET = process.env.HC_E2E_ACCESS_SECRET || 'hc-e2e-secret';
const BASE = process.env.TEST_URL || 'http://localhost:3000';
const EVIDENCE_DIR = process.env.HC_EVIDENCE_DIR || join(root, 'test-results', 'hc-summer-catchup');

const SEASON_NOW = currentSeason();
const SEASON_PREV = prevSeason(SEASON_NOW);
const LABEL_NOW = SEASON_LABEL[SEASON_NOW];
const LABEL_PREV = SEASON_LABEL[SEASON_PREV];

const RETURNING_ID = 'aaaaaaaa-1111-4111-8111-111111111111'; // member since last season
const BRAND_NEW_ID = 'bbbbbbbb-2222-4222-8222-222222222222'; // signed up this season

// Real rows from earlier catalog migrations (phase1 / onboarding), post-
// summer-migration state for clean_dryer_vent. Kept to keys the profiled
// stub homeowner (hvac + lawn) can see.
const BASE_CATALOG: CatalogRow[] = [
  { key: 'clean_gutters', title: 'Clean gutters & downspouts', blurb: 'Clear leaves and debris so winter melt and spring rain drain away from your foundation.', applies_to: ['all'], stages: ['all'], seasons: ['fall', 'spring'], frequency: 'seasonal', diy_or_pro: 'pro', bookable: true, est_cost_low: 150, est_cost_high: 525, priority: 9, starter: false },
  { key: 'hvac_ac_tuneup', title: 'Service the A/C before summer', blurb: 'A spring tune-up keeps cooling efficient and catches problems before the first heat wave.', applies_to: ['hvac'], stages: ['all'], seasons: ['spring'], frequency: 'annual', diy_or_pro: 'pro', bookable: true, est_cost_low: 100, est_cost_high: 250, priority: 8, starter: false },
  { key: 'replace_hvac_filter', title: 'Replace the HVAC filter', blurb: 'A fresh filter every few months protects the system and your air quality.', applies_to: ['hvac', 'all'], stages: ['all'], seasons: ['spring', 'summer', 'fall', 'winter'], frequency: 'quarterly', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 6, starter: false },
  { key: 'test_smoke_co', title: 'Test smoke & CO detectors', blurb: 'Press test on every alarm and swap batteries. Two minutes that matter most.', applies_to: ['all'], stages: ['all'], seasons: ['spring', 'fall'], frequency: 'seasonal', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 10, starter: false },
  { key: 'roof_inspect', title: 'Inspect the roof', blurb: 'Look for lifted shingles, flashing gaps, and winter damage twice a year.', applies_to: ['roof'], stages: ['all'], seasons: ['spring', 'fall'], frequency: 'seasonal', diy_or_pro: 'pro', bookable: true, est_cost_low: 0, est_cost_high: 250, priority: 7, starter: false },
  { key: 'power_wash', title: 'Power-wash siding & walkways', blurb: "Knock off a winter's grime and spot any siding that needs attention.", applies_to: ['exterior'], stages: ['all'], seasons: ['spring'], frequency: 'annual', diy_or_pro: 'pro', bookable: true, est_cost_low: 250, est_cost_high: 600, priority: 4, starter: false },
  { key: 'test_gfci', title: 'Test GFCI outlets', blurb: 'Press test/reset on kitchen, bath, and exterior outlets to confirm they trip.', applies_to: ['all'], stages: ['all'], seasons: ['spring'], frequency: 'annual', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 5, starter: false },
  { key: 'fridge_coils', title: 'Vacuum refrigerator coils', blurb: 'Dusty coils make the fridge run hot and waste energy.', applies_to: ['all'], stages: ['all'], seasons: ['spring'], frequency: 'annual', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 3, starter: false },
  { key: 'lawn_spring_prep', title: 'Spring lawn prep & aeration', blurb: 'Aerate, seed, and feed for a healthier lawn all season.', applies_to: ['lawn'], stages: ['all'], seasons: ['spring'], frequency: 'annual', diy_or_pro: 'pro', bookable: true, est_cost_low: 150, est_cost_high: 400, priority: 3, starter: false },
  { key: 'winterize_spigots', title: 'Winterize outdoor faucets', blurb: 'Disconnect hoses and shut off exterior water lines before the first hard freeze.', applies_to: ['plumbing'], stages: ['all'], seasons: ['fall'], frequency: 'annual', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 8, starter: false },
  { key: 'clean_dryer_vent', title: 'Clean the dryer vent', blurb: 'Lint buildup is a top home-fire cause and makes the dryer work harder.', applies_to: ['all'], stages: ['all'], seasons: ['fall', 'summer'], frequency: 'annual', diy_or_pro: 'pro', bookable: true, est_cost_low: 100, est_cost_high: 200, priority: 7, starter: false },
];

test.describe('Home Care portal: summer catalog + season catch-up (live UI)', () => {
  test.skip(!RUN_PORTAL_E2E, 'Needs the stub-backed portal server — see the run recipe in this spec.');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  const CATALOG: CatalogRow[] = [...BASE_CATALOG, ...parseSummerRows(read(SUMMER_MIGRATION))];
  // Sorted like the page query (priority desc).
  CATALOG.sort((a, b) => b.priority - a.priority);

  const prevSeasonTasks = CATALOG.filter((t) => !t.starter && t.seasons.includes(SEASON_PREV));
  // The member checked off the two highest-priority tasks last season and let the rest slip.
  const doneKeys = prevSeasonTasks.slice(0, 2).map((t) => t.key);
  const missedAtStart = prevSeasonTasks.length - doneKeys.length;

  const doneStore = new Map<string, Set<string>>([
    [RETURNING_ID, new Set(doneKeys.map((k) => `${k}|${SEASON_PREV}`))],
    [BRAND_NEW_ID, new Set()],
  ]);

  const HOMEOWNERS: Record<string, object> = {
    [RETURNING_ID]: {
      id: RETURNING_ID, email: 'dana@example.com', first_name: 'Dana', phone: null, zip: '07901',
      home_type: 'single_family', status: 'active', verify_token: null, verify_token_expires_at: null,
      unsubscribe_token: 'tok-returning', verified_at: '2026-04-12T14:00:00Z', unsubscribed_at: null,
      source: 'home_care', created_at: new Date(seasonStart().getTime() - 45 * 24 * 3600 * 1000).toISOString(),
      updated_at: null,
    },
    [BRAND_NEW_ID]: {
      id: BRAND_NEW_ID, email: 'riley@example.com', first_name: 'Riley', phone: null, zip: '07039',
      home_type: 'single_family', status: 'active', verify_token: null, verify_token_expires_at: null,
      unsubscribe_token: 'tok-new', verified_at: new Date().toISOString(), unsubscribed_at: null,
      source: 'home_care', created_at: new Date(seasonStart().getTime() + 24 * 3600 * 1000).toISOString(),
      updated_at: null,
    },
  };

  let stub: http.Server;

  test.beforeAll(async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    stub = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${STUB_PORT}`);
      const eq = (param: string) => (url.searchParams.get(param) ?? '').replace(/^eq\./, '');
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
          const row = HOMEOWNERS[eq('id')];
          return json(200, row ? [row] : []);
        }
        if (url.pathname === '/rest/v1/home_profiles') {
          return json(200, [{ systems: { hvac: true, lawn: true }, stage: 'established', homeowner_type: null }]);
        }
        if (url.pathname === '/rest/v1/homeowner_maintenance') {
          if (req.method === 'POST') {
            try {
              const b = JSON.parse(raw);
              const set = doneStore.get(b.homeowner_id) ?? new Set<string>();
              if (b.status === 'done') set.add(`${b.task_key}|${b.season}`);
              else set.delete(`${b.task_key}|${b.season}`);
              doneStore.set(b.homeowner_id, set);
            } catch { /* ignore malformed */ }
            res.writeHead(201).end();
            return;
          }
          // The page selects task_key,season,status and keeps rows with
          // status === 'done' (Wave 1) — this store only ever holds done rows.
          const rows = [...(doneStore.get(eq('homeowner_id')) ?? [])].map((k) => {
            const [task_key, season] = k.split('|');
            return { task_key, season, status: 'done' };
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

  async function openChecklist(page: Page, homeownerId: string, path = '/home-care/checklist') {
    await page.context().addCookies([{ name: 'hc_access', value: mintCookie(homeownerId), url: BASE }]);
    await page.goto(path, { waitUntil: 'networkidle', timeout: 120_000 });
    await expect(page).toHaveURL(new RegExp(path.replace('?', '\\?'))); // no bounce to /home-care means the cookie verified
  }

  async function shot(page: Page, name: string) {
    await page.evaluate(() => document.querySelector('nextjs-portal')?.remove()); // dev-only badge
    await page.screenshot({ path: join(EVIDENCE_DIR, name), fullPage: true });
  }

  const noEmoji = async (page: Page) => {
    const text = (await page.locator('main').innerText()) ?? '';
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  };

  test('returning member lands on a catch-up card for last season', async ({ page }) => {
    await openChecklist(page, RETURNING_ID);
    await expect(page.getByText('Welcome back, Dana')).toBeVisible();

    const card = page.locator('div.rounded-2xl').filter({ hasText: `Left over from ${LABEL_PREV}` });
    await expect(page.getByRole('heading', { name: `Left over from ${LABEL_PREV}: ${missedAtStart} tasks` })).toBeVisible();
    // First 4 missed tasks as chips, the rest folded into "+n more".
    for (const t of prevSeasonTasks.filter((x) => !doneKeys.includes(x.key)).slice(0, 4)) {
      await expect(card.getByText(t.title, { exact: true }).first()).toBeVisible();
    }
    if (missedAtStart > 4) await expect(card.getByText(`+${missedAtStart - 4} more`)).toBeVisible();

    // Condensed program bar: one-line <details> summary, Edit always visible, chips only when expanded.
    const program = page.locator('details', { hasText: 'Your program' });
    await expect(program.locator('summary')).toContainText('Your program · Established owner · 2 home details');
    await expect(program.getByRole('link', { name: 'Edit' })).toBeVisible();
    await expect(program).not.toHaveAttribute('open', '');
    await noEmoji(page);
    await shot(page, '01-returning-member-catchup-card.png');

    await program.locator('summary').click();
    await expect(program.locator('span.rounded-full').first()).toBeVisible(); // system chips only when expanded
    await shot(page, '02-program-bar-expanded.png');
  });

  test('Review-last-season jumps tabs, and checking a task shrinks the catch-up list', async ({ page }) => {
    await openChecklist(page, RETURNING_ID);
    await page.getByRole('button', { name: `Review ${LABEL_PREV}` }).click();
    // Card hides off the current-season tab; last season's list is shown with saved progress.
    await expect(page.getByRole('heading', { name: `Left over from ${LABEL_PREV}` })).toBeHidden();
    await expect(page.getByText(`${LABEL_PREV} · ${doneKeys.length} of ${prevSeasonTasks.length} done`)).toBeVisible();
    await shot(page, '03-review-previous-season-tab.png');

    // Knock out the first missed task.
    const firstMissed = prevSeasonTasks.find((t) => !doneKeys.includes(t.key))!;
    const row = page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: firstMissed.title, exact: true }) });
    await row.getByRole('button', { name: 'Mark done' }).click();
    await expect(page.getByText(`${LABEL_PREV} · ${doneKeys.length + 1} of ${prevSeasonTasks.length} done`)).toBeVisible();

    // Back on the current season the card recounts live.
    await page.getByRole('button', { name: `${LABEL_NOW} · now` }).click();
    await expect(page.getByRole('heading', { name: `Left over from ${LABEL_PREV}: ${missedAtStart - 1} task` })).toBeVisible();
    await shot(page, '04-catchup-count-shrinks-after-checkoff.png');
  });

  test('dismissing the catch-up card sticks across reloads (season-scoped localStorage)', async ({ page }) => {
    await openChecklist(page, RETURNING_ID);
    await expect(page.getByRole('heading', { name: `Left over from ${LABEL_PREV}` })).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss catch-up' }).click();
    await expect(page.getByRole('heading', { name: `Left over from ${LABEL_PREV}` })).toBeHidden();

    const key = `hc-catchup-dismissed:${seasonStart().getUTCFullYear()}-${SEASON_NOW}`;
    expect(await page.evaluate((k) => window.localStorage.getItem(k), key)).toBe('1');

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByText('Welcome back, Dana')).toBeVisible();
    await expect(page.getByRole('heading', { name: `Left over from ${LABEL_PREV}` })).toBeHidden();
    await shot(page, '05-catchup-dismissed-persists-after-reload.png');
  });

  test('brand-new member (joined this season) gets no catch-up card', async ({ page }) => {
    await openChecklist(page, BRAND_NEW_ID);
    await expect(page.getByText('Welcome back, Riley')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Left over from' })).toHaveCount(0);
    await shot(page, '06-new-member-no-catchup.png');
  });

  test('summer tab shows the 8 new NJ tasks plus dryer-vent cleaning', async ({ page }) => {
    await openChecklist(page, RETURNING_ID);
    await page.getByRole('button', { name: /^Summer/ }).click();
    const summerRows = parseSummerRows(read(SUMMER_MIGRATION));
    expect(summerRows).toHaveLength(8);
    for (const t of summerRows) {
      await expect(page.getByRole('heading', { name: t.title, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Clean the dryer vent', exact: true })).toBeVisible();
    await noEmoji(page);
    await shot(page, '07-summer-tab-new-catalog.png');
  });

  test('setup wizard stage picker renders lucide icons, no emoji', async ({ page }) => {
    await openChecklist(page, RETURNING_ID, '/home-care/setup?edit=1');
    const justBought = page.getByRole('button', { name: /Just bought this home/ });
    await expect(justBought).toBeVisible();
    await expect(justBought.locator('svg')).toHaveCount(1);
    await noEmoji(page);
    await shot(page, '08-setup-wizard-lucide-stages.png');
  });
});
