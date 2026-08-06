import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';
import http from 'http';
import { createHmac } from 'crypto';
import { AFFILIATE_DISCLOSURE, amazonProductUrl } from '@/lib/homecare/products';

const root = process.cwd();
const EVIDENCE_DIR = process.env.HC_EVIDENCE_DIR || join(root, 'test-results', 'hc-diy-kit-shelf');

/**
 * The DIY Kit shelf as a MEMBER meets it, on the real /home-care/checklist page.
 *
 * The other three DIY Kit specs stop short of this on purpose - the contract
 * spec asserts the pure functions, the route spec asks the running admin routes,
 * and the browser spec drives the admin SCREEN and then measures the shelf's
 * arithmetic on a hand-built div. None of them ever renders `DiyKitShelf`
 * itself, so the one surface the whole slice exists for - a tinted strip on a
 * task, expanding into a swipe shelf with tagged links and a disclosure - was
 * the only part never rendered by a test. This file renders it.
 *
 * WHY IT IS GATED. /home-care/checklist needs an `hc_access` cookie signed with
 * LISTINGS_ACCESS_SECRET, a homeowner behind it, and a catalog to filter, so it
 * needs a server whose Supabase URL points at a stub this file controls. That
 * URL is baked at BUILD time, and the build the rest of the suite runs against
 * bakes 127.0.0.1:9099 with nothing but the GoTrue stub behind it, so under
 * `npm run test:e2e` this spec would only ever assert a redirect to /home-care.
 * It therefore skips unless HC_SHELF_E2E says the recipe below has been set up,
 * exactly as home-care-checklist-ux.spec.ts does for the same reason.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9418 \
 *   NEXT_PUBLIC_RECAPTCHA_SITE_KEY=test-placeholder-site-key \
 *   NEXT_PUBLIC_RECAPTCHA_V2_SITE_KEY=test-placeholder-v2-site-key \
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=placeholder-anon-key \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
 *   npm run build                       # NOT with SUPABASE_SECRET_KEY set - see CLAUDE.md
 *
 *   SUPABASE_SECRET_KEY=sb-stub-secret LISTINGS_ACCESS_SECRET=hc-e2e-secret \
 *   AMAZON_ASSOCIATES_TAG=lavacagc-20 npm run start -- -p 3100
 *
 *   HC_SHELF_E2E=1 TEST_URL=http://127.0.0.1:3100 HC_SHELF_STUB_PORT=9418 \
 *   node_modules/.bin/playwright test tests/home-care-diy-kit-shelf.spec.ts --project=chromium
 *
 * A BUILD, NOT `next dev`, and that is not incidental. next/image validates its
 * src against `images.remotePatterns` in DEVELOPMENT ONLY, and next.config.ts
 * lists exactly one remote host: the production Supabase storage origin. Under
 * `next dev` a stub host therefore throws out of the render and the checklist
 * 500s before the shelf exists; a production build renders the card and lets the
 * optimizer answer 400 for the photo. That 400 is the ONE thing this file fakes,
 * with a route interception that hands back a stand-in photo. Everything else -
 * the page, the catalog filter, the one-query shelf read, the affiliate tag, the
 * layout - is the real thing.
 *
 * Note this recipe leaves `.next` built against 9418. Run `npm run test:build`
 * before going back to the rest of the suite.
 */

const RUN_SHELF_E2E = process.env.HC_SHELF_E2E === '1';
const STUB_PORT = Number(process.env.HC_SHELF_STUB_PORT || 9418);
const ACCESS_SECRET = process.env.HC_E2E_ACCESS_SECRET || 'hc-e2e-secret';
const BASE = process.env.TEST_URL || 'http://localhost:3000';
/** Must match AMAZON_ASSOCIATES_TAG on the server under test - the link is composed there. */
const TAG = process.env.HC_SHELF_TAG || 'lavacagc-20';

const MEMBER_ID = 'eeeeeeee-7777-4777-8777-777777777777';

interface CatalogRow {
  key: string; title: string; blurb: string; applies_to: string[]; stages: string[];
  seasons: string[]; frequency: string; diy_or_pro: string; bookable: boolean;
  /** The catalog still carries these; the member surfaces stopped reading them. */
  est_cost_low: number | null; est_cost_high: number | null; priority: number; starter: boolean;
  /** 20260828000000. A `diy` task La Vaca will also do on request. */
  pro_optional: boolean;
}

const ALL_SEASONS = ['spring', 'summer', 'fall', 'winter'];

/**
 * Four tasks, each carrying one question this file has to answer:
 *  - a stocked DIY task with FOUR picks, which is the swipe shelf;
 *  - a stocked DIY task with TWO, which is the plain grid;
 *  - a stocked PRO-OPTIONAL DIY task, whose shelf must stay off screen until
 *    the member says they are doing it themselves;
 *  - an eligible task nobody has stocked, which must look untouched;
 *  - a PRO task, which can never carry a shelf at all.
 * The two guide-backed keys are real summer guide keys, so "Learn more" renders
 * from the same `hasGuideItem` the page uses rather than from a fixture.
 */
const CATALOG: CatalogRow[] = [
  { key: 'replace_hvac_filter', title: 'Replace the HVAC filter', blurb: 'A clogged filter makes the system work harder and cost more.', applies_to: ['all'], stages: ['all'], seasons: ALL_SEASONS, frequency: 'quarterly', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 30, starter: false, pro_optional: false },
  { key: 'audit_alarms', title: 'Check every smoke & CO alarm', blurb: 'Press test on every alarm and swap the batteries.', applies_to: ['all'], stages: ['all'], seasons: ALL_SEASONS, frequency: 'annual', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 20, starter: false, pro_optional: false },
  { key: 'seal_deck', title: 'Clean & seal the deck', blurb: 'Wash it, let it dry, then seal or stain while the weather is warm.', applies_to: ['all'], stages: ['all'], seasons: ALL_SEASONS, frequency: 'annual', diy_or_pro: 'either', bookable: true, est_cost_low: 400, est_cost_high: 900, priority: 15, starter: false, pro_optional: false },
  { key: 'chimney_inspect', title: 'Chimney inspection & sweep', blurb: 'Creosote buildup is a chimney-fire hazard.', applies_to: ['all'], stages: ['all'], seasons: ALL_SEASONS, frequency: 'annual', diy_or_pro: 'pro', bookable: true, est_cost_low: 200, est_cost_high: 400, priority: 10, starter: false, pro_optional: false },
  // The slice's own case: a DIY task the owner will also send a crew to. Its
  // gear is stocked, so "the shelf is hidden" can only be about the choice.
  { key: 'flush_ac_condensate', title: 'Clear the A/C condensate drain line', blurb: 'A clogged line overflows the drain pan - that is a ceiling stain in August.', applies_to: ['all'], stages: ['all'], seasons: ALL_SEASONS, frequency: 'annual', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 25, starter: false, pro_optional: true },
];

interface StubProduct {
  id: string; asin: string; display_name: string; brand: string | null; pitch: string | null;
  images: string[]; price_band: string; category: string | null; active: boolean; link_status: string;
}

/** task_key -> the shelf, in the order the join table's sort_order gives it. */
const SHELVES: Record<string, StubProduct[]> = {
  replace_hvac_filter: [
    { id: 'p1', asin: 'B01FILTER1', display_name: 'MERV 11 filters, 4-pack', brand: 'Filterbuy', pitch: 'Match the size printed on the one you pull out.', images: ['B01FILTER1/1.png'], price_band: 'under_25', category: 'consumable', active: true, link_status: 'ok' },
    { id: 'p2', asin: 'B02VENTBR1', display_name: 'Vent & register brush', brand: null, pitch: 'For the grille the filter sits behind.', images: ['B02VENTBR1/1.png'], price_band: '25_50', category: 'tool', active: true, link_status: 'ok' },
    { id: 'p3', asin: 'B03MAGVNT1', display_name: 'Magnetic vent covers, 6-pack', brand: 'Vent-Wise', pitch: 'Close off the rooms nobody is using.', images: ['B03MAGVNT1/1.png'], price_band: '50_100', category: 'tool', active: true, link_status: 'ok' },
    // link_status 'suspect' still renders: it means "we could not tell", and
    // emptying a shelf on an inconclusive answer is the failure the three-state
    // design exists to prevent.
    { id: 'p4', asin: 'B04PURIFR1', display_name: 'HEPA air purifier', brand: 'Levoit', pitch: 'Worth it if anyone in the house has allergies.', images: ['B04PURIFR1/1.png'], price_band: '100_plus', category: 'monitor', active: true, link_status: 'suspect' },
    // Neither of these two may reach the member: one is a draft, one is known
    // dead. They sit on the same shelf so the filter is proved where it matters.
    { id: 'p5', asin: 'B05DRAFT01', display_name: 'Draft product nobody approved', brand: null, pitch: null, images: ['B05DRAFT01/1.png'], price_band: 'under_25', category: null, active: false, link_status: 'ok' },
    { id: 'p6', asin: 'B06GONE001', display_name: 'Delisted product', brand: null, pitch: null, images: ['B06GONE001/1.png'], price_band: 'under_25', category: null, active: true, link_status: 'gone' },
  ],
  flush_ac_condensate: [
    { id: 'p9', asin: 'B09VINEGR1', display_name: 'Distilled white vinegar, 1 gal', brand: 'Iberia', pitch: 'A cup down the line, twice a season.', images: ['B09VINEGR1/1.png'], price_band: 'under_25', category: 'consumable', active: true, link_status: 'ok' },
    { id: 'p10', asin: 'B10DRAINB1', display_name: 'Condensate drain brush, 48 in', brand: 'Gulfmew', pitch: 'Reaches the trap without pulling the line apart.', images: ['B10DRAINB1/1.png'], price_band: '25_50', category: 'tool', active: true, link_status: 'ok' },
  ],
  audit_alarms: [
    { id: 'p7', asin: 'B07ALARM01', display_name: 'Combination smoke & CO alarm', brand: 'First Alert', pitch: 'One per floor, plus outside every bedroom.', images: ['B07ALARM01/1.png'], price_band: '25_50', category: 'safety', active: true, link_status: 'ok' },
    { id: 'p8', asin: 'B08BATTRY1', display_name: '9V lithium batteries, 4-pack', brand: null, pitch: 'Ten-year cells, so this is a one-time job.', images: ['B08BATTRY1/1.png'], price_band: 'under_25', category: 'consumable', active: true, link_status: 'ok' },
  ],
};

/** What a member must be able to see and tap, once the strip is open. */
const VISIBLE_ON_HVAC = SHELVES.replace_hvac_filter.filter((p) => p.active && p.link_status !== 'gone');

test.describe('DIY Kit: the shelf a member actually sees', () => {
  test.skip(!RUN_SHELF_E2E, 'Needs the stub-backed portal server - see the run recipe at the top of this spec.');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  const HOMEOWNER = {
    id: MEMBER_ID, email: 'mia@example.com', first_name: 'Mia', phone: null, zip: '07901',
    home_type: 'single_family', status: 'active', verify_token: null, verify_token_expires_at: null,
    unsubscribe_token: 'tok-shelf', verified_at: new Date().toISOString(), unsubscribed_at: null,
    source: 'home_care', created_at: new Date().toISOString(), updated_at: null,
  };

  const maintStore = new Map<string, { status: string; completed_at: string | null; mode: string | null }>();
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
          if (req.method === 'PATCH') return json(204, undefined);
          return json(200, [HOMEOWNER]);
        }
        if (url.pathname === '/rest/v1/home_profiles') {
          return json(200, [{ systems: { hvac: true }, stage: 'just_bought', homeowner_type: null }]);
        }
        if (url.pathname === '/rest/v1/home_records') return json(200, []);
        if (url.pathname === '/rest/v1/homeowner_maintenance') {
          if (req.method === 'POST') {
            try {
              const b = JSON.parse(raw) as { task_key: string; season: string; status: string; mode?: string | null; completed_at?: string | null };
              const k = `${b.task_key}|${b.season}`;
              // merge-duplicates: a body that does not carry a column leaves it
              // alone, exactly as PostgREST would. Without this the mode write
              // would blank a completion and the test would prove the opposite
              // of what the route is careful to do.
              const held = maintStore.get(k);
              maintStore.set(k, {
                status: b.status,
                completed_at: 'completed_at' in b ? (b.completed_at ?? null) : held?.completed_at ?? null,
                mode: 'mode' in b ? (b.mode ?? null) : held?.mode ?? null,
              });
            } catch { /* ignore malformed */ }
            res.writeHead(201).end();
            return;
          }
          const rows = [...maintStore.entries()].map(([k, v]) => {
            const [task_key, season] = k.split('|');
            return { task_key, season, status: v.status, completed_at: v.completed_at, updated_at: null, completed_by: null, scheduled_start: null, scheduled_end: null, service_address: null, mode: v.mode };
          });
          // The page reads every row for the member; the task route reads ONE,
          // by task and season, before it rewrites that row's status. Answering
          // the second read with the whole table hands it row zero - some other
          // task's - so the stub decides what the route writes and the test
          // proves nothing about the route. Honour the filters PostgREST would.
          // `searchParams.get` has already decoded the value, so `eq.` is all
          // there is left to strip.
          const eq = (col: string) => {
            const val = url.searchParams.get(col);
            return val?.startsWith('eq.') ? val.slice(3) : null;
          };
          const wantKey = eq('task_key');
          const wantSeason = eq('season');
          const limit = Number(url.searchParams.get('limit') || 0);
          const filtered = rows
            .filter((r) => (wantKey === null || r.task_key === wantKey)
              && (wantSeason === null || r.season === wantSeason));
          return json(200, limit > 0 ? filtered.slice(0, limit) : filtered);
        }
        // The shelf read, embedded exactly as PostgREST answers it. Scoped to
        // the keys the page asked for, so a shelf leaking onto a task the query
        // never named would show up here rather than passing unnoticed.
        if (url.pathname === '/rest/v1/home_care_product_tasks') {
          // The whole in-list arrives percent-encoded, commas included, so it
          // has to be decoded before it can be split rather than after.
          const inList = decodeURIComponent(/task_key=in\.\(([^)]*)\)/.exec(url.search)?.[1] ?? '');
          const asked = inList.split(',').map((k) => k.replace(/"/g, '').trim()).filter(Boolean);
          const rows: unknown[] = [];
          for (const key of asked) {
            (SHELVES[key] ?? []).forEach((p, i) => rows.push({
              task_key: key, sort_order: i, home_care_products: { ...p },
            }));
          }
          return json(200, rows);
        }
        if (url.pathname.startsWith('/storage/v1/object/public/home-care-products/')) {
          res.writeHead(200, { 'Content-Type': 'image/png' });
          res.end();
          return;
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

  const b64url = (b: Buffer) => b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  function mintCookie(homeownerId: string): string {
    const payload = b64url(Buffer.from(`${homeownerId}.${Math.floor(Date.now() / 1000)}`));
    const sig = b64url(createHmac('sha256', ACCESS_SECRET).update(payload).digest());
    return `${payload}.${sig}`;
  }

  /** A stand-in product photo, because the optimizer will not serve the stub host. */
  const PHOTO = (label: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">`
    + `<rect width="240" height="240" fill="#fff"/>`
    + `<rect x="34" y="46" width="172" height="148" rx="14" fill="#e8eef5" stroke="#b8c6d6" stroke-width="3"/>`
    + `<rect x="58" y="74" width="124" height="92" rx="8" fill="#ffffff" stroke="#9fb3c8" stroke-width="3"/>`
    + `<text x="120" y="130" font-family="Helvetica,Arial" font-size="34" font-weight="700" fill="#5b7086" text-anchor="middle">${label}</text>`
    + `</svg>`;

  const taskRow = (page: Page, title: string) =>
    page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: title, exact: true }) });

  async function openChecklist(page: Page, { width = 390, height = 900 } = {}) {
    await page.setViewportSize({ width, height });
    // next/image cannot be pointed at the stub host (see the header), so the
    // optimizer's request is answered here with a stand-in photo.
    await page.route('**/_next/image**', async (route) => {
      const src = decodeURIComponent(new URL(route.request().url()).searchParams.get('url') ?? '');
      // Only the product bucket. Everything else on the page - the logo, the
      // seasonal art - is a local asset the optimizer serves for real, and
      // faking those would hide a broken one.
      if (!src.includes('home-care-products')) return route.continue();
      await route.fulfill({
        status: 200, contentType: 'image/svg+xml',
        body: PHOTO(/\/([A-Z0-9]{10})\//.exec(src)?.[1]?.slice(0, 4) ?? 'ITEM'),
      });
    });
    await page.context().addCookies([{ name: 'hc_access', value: mintCookie(MEMBER_ID), url: BASE }]);
    await page.goto('/home-care/checklist', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await expect(page.getByText('Welcome back, Mia')).toBeVisible();
    // Hydration gate: the mounted effect replaces the SSR top: 0px on the sticky
    // header with the measured site-header height, so React is attached.
    await expect(page.locator('div.sticky', { has: page.getByRole('progressbar') }))
      .not.toHaveCSS('top', '0px', { timeout: 30_000 });
  }

  async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
    // The product photos ON SCREEN decoded first, or a card that is fine gets
    // captured empty. Only the ones on screen: `next/image` is lazy by default,
    // so the cards still off to the right of a swipe shelf have not started
    // loading and never will until something scrolls to them.
    await page.waitForFunction(() => Array.from(document.images)
      .filter((i) => i.src.includes('home-care-products'))
      .filter((i) => {
        const r = i.getBoundingClientRect();
        return r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight;
      })
      .every((i) => i.complete), null, { timeout: 10_000 },
    ).catch(() => { /* a photo that never decodes is the screenshot's problem to show */ });
    await page.evaluate(() => document.querySelector('nextjs-portal')?.remove()); // dev-only badge
    await page.screenshot({ path: join(EVIDENCE_DIR, name), fullPage: opts.fullPage ?? false });
  }

  test('S1: the shelf is a collapsed strip that states its count, and only where something is stocked', async ({ page }) => {
    await openChecklist(page);

    const strip = page.getByTestId('diy-kit-toggle-replace_hvac_filter');
    await strip.scrollIntoViewIfNeeded();
    await expect(strip).toBeVisible();
    await expect(strip).toHaveAttribute('aria-expanded', 'false');
    // Four picks: the draft and the delisted product are filtered out of the six.
    await expect(strip).toContainText("What you'll need");
    await expect(strip).toContainText('4 picks');
    // Collapsed means collapsed: not one outbound link is in the DOM yet.
    await expect(taskRow(page, 'Replace the HVAC filter').getByTestId('diy-kit-link')).toHaveCount(0);

    // An eligible task nobody stocked, and a pro task, both render exactly as
    // they did before the feature existed: no strip, no zero count.
    await expect(page.getByTestId('diy-kit-toggle-seal_deck')).toHaveCount(0);
    await expect(page.getByTestId('diy-kit-toggle-chimney_inspect')).toHaveCount(0);
    await shot(page, '01-shelf-collapsed-strip.png');
  });

  test('S2: expanding shows the picks, tagged links and the disclosure - and no pricing', async ({ page }) => {
    await openChecklist(page);
    const row = taskRow(page, 'Replace the HVAC filter');
    await page.getByTestId('diy-kit-toggle-replace_hvac_filter').scrollIntoViewIfNeeded();
    await page.getByTestId('diy-kit-toggle-replace_hvac_filter').click();

    // Exactly the four renderable picks, in sort_order.
    const links = row.getByTestId('diy-kit-link');
    await expect(links).toHaveCount(VISIBLE_ON_HVAC.length);
    await expect(row.getByText('MERV 11 filters, 4-pack')).toBeVisible();
    await expect(row.getByText('Draft product nobody approved')).toHaveCount(0);
    await expect(row.getByText('Delisted product')).toHaveCount(0);

    // NO pricing of any kind (owner, 2026-08-06). The band was retired because
    // maintaining one per product was manual labour, so a card is name, pitch,
    // photo and link. Asserted as an absence because the failure this guards is
    // a band creeping back onto a card nobody chose one for - and because the
    // stub still SERVES bands on some rows, so this only passes while the
    // component genuinely ignores them.
    await expect(row.getByText('Under $25')).toHaveCount(0);
    await expect(row.getByText('$25 - $50')).toHaveCount(0);
    await expect(row.getByText('$100 and up')).toHaveCount(0);
    await expect(row.getByText(/\$\d/)).toHaveCount(0);
    for (const [i, product] of VISIBLE_ON_HVAC.entries()) {
      const link = links.nth(i);
      await expect(link).toHaveAttribute('href', amazonProductUrl(product.asin, TAG));
      await expect(link).toHaveAttribute('rel', 'sponsored nofollow noopener');
      await expect(link).toHaveAttribute('target', '_blank');
    }

    // The disclosure is in the same block as the links, not in a footer.
    await expect(row.getByText(AFFILIATE_DISCLOSURE)).toBeVisible();
    await shot(page, '02-shelf-expanded.png');
  });

  test('S3: past two picks it swipes, with a bar that is drawn instead of the platform scrollbar', async ({ page }) => {
    await openChecklist(page);
    await page.getByTestId('diy-kit-toggle-replace_hvac_filter').scrollIntoViewIfNeeded();
    await page.getByTestId('diy-kit-toggle-replace_hvac_filter').click();

    const counter = page.getByTestId('diy-kit-count-replace_hvac_filter');
    await expect(counter).toContainText('1 - 2 of 4');
    await expect(counter).toContainText('swipe for more');

    const scroller = page.locator('#diy-kit-replace_hvac_filter > div').first();
    // The platform scrollbar is suppressed, which is exactly why a bar of our
    // own has to be drawn: with both hidden a four-pick shelf reads as two.
    expect(await scroller.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe('none');
    const bar = page.locator('#diy-kit-replace_hvac_filter div[aria-hidden="true"] > div');
    /**
     * The thumb, relative to its track.
     *
     * POLLED WHEREVER IT IS ASSERTED, never sampled once. The thumb starts at
     * the full width its state is initialised to and animates to the measured
     * fraction over 150ms, and it animates again on every scroll - so a single
     * read taken the instant the counter updates catches it mid-flight and
     * reports a bar that covers the whole track, or one that stops short of the
     * end, when neither is where it comes to rest.
     */
    const thumb = () => bar.evaluate((el) => {
      const track = (el.parentElement as HTMLElement).getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return { width: box.width, track: track.width, left: box.left - track.left, gap: track.right - box.right };
    });
    await expect.poll(async () => (await thumb()).width).toBeLessThan((await thumb()).track);
    const atRest = await thumb();
    expect(atRest.width).toBeGreaterThan(0);
    expect(atRest.left).toBeLessThan(1);
    await shot(page, '03-shelf-swipe-start.png');

    // Swipe to the end: the counter reaches the last card and the bar is flush
    // with the right of its track.
    await scroller.evaluate((el) => { el.scrollLeft = 99999; });
    await expect(counter).toContainText('3 - 4 of 4');
    await expect.poll(async () => (await thumb()).gap).toBeLessThan(1.5);
    expect((await thumb()).left).toBeGreaterThan(1);
    await expect(page.getByText('HEPA air purifier')).toBeVisible();
    await shot(page, '04-shelf-swiped-to-end.png');
  });

  test('S4: two picks is a plain grid - no bar, no counter, nothing to swipe', async ({ page }) => {
    await openChecklist(page);
    const strip = page.getByTestId('diy-kit-toggle-audit_alarms');
    await strip.scrollIntoViewIfNeeded();
    await expect(strip).toContainText('2 picks');
    await strip.click();

    const row = taskRow(page, 'Check every smoke & CO alarm');
    await expect(row.getByTestId('diy-kit-link')).toHaveCount(2);
    await expect(page.getByTestId('diy-kit-count-audit_alarms')).toHaveCount(0);
    // Both cards are on screen side by side, which is what makes a slider bar
    // meaningless here.
    const first = await row.getByText('Combination smoke & CO alarm').boundingBox();
    const second = await row.getByText('9V lithium batteries, 4-pack').boundingBox();
    expect(first!.y).toBeCloseTo(second!.y, 0);
    await shot(page, '05-shelf-two-picks-grid.png');
  });

  test('S5: the badge line sits under the blurb, and the icon-only hide is undoable', async ({ page }) => {
    await openChecklist(page);
    const row = taskRow(page, 'Replace the HVAC filter');
    await row.scrollIntoViewIfNeeded();

    // Three rows, not six (owner, 6 Aug 2026). Title, then one line of blurb,
    // then everything that is neither: the DIY verdict, the frequency and the
    // guide link share the last row. "Learn more" used to sit above the blurb
    // beside the badge; the badge came down instead of the blurb going up.
    const badge = await row.getByText('DIY', { exact: true }).boundingBox();
    const learn = await row.getByRole('link', { name: 'Learn more' }).boundingBox();
    const blurb = await row.getByText('A clogged filter', { exact: false }).first().boundingBox();
    expect(Math.abs(learn!.y - badge!.y)).toBeLessThan(4);
    expect(badge!.y).toBeGreaterThan(blurb!.y);

    // Icon-only, but named - and still a 44px target under the global rule.
    const hide = page.getByTestId('hide-task-replace_hvac_filter');
    await expect(hide).toHaveAttribute('aria-label', 'Not relevant - hide Replace the HVAC filter');
    await expect(hide).toHaveAttribute('title', 'Not relevant - hide for me');
    await expect(hide).toHaveText('');
    const box = await hide.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);

    // A mis-tap has to be recoverable in the same breath, from the sticky header.
    await hide.click();
    await expect(row).toHaveCount(0);
    const undoBar = page.getByText('Hidden: Replace the HVAC filter');
    await expect(undoBar).toBeVisible();
    await shot(page, '06-hide-undo-bar.png');

    await page.getByTestId('undo-hide').click();
    await expect(taskRow(page, 'Replace the HVAC filter')).toHaveCount(1);
    await expect(page.getByTestId('diy-kit-toggle-replace_hvac_filter')).toBeVisible();
    await expect(undoBar).toHaveCount(0);
  });

  test('S6: a pro-optional task hides its gear until the member says they are doing it', async ({ page }) => {
    await openChecklist(page);
    const row = taskRow(page, 'Clear the A/C condensate drain line');
    await row.scrollIntoViewIfNeeded();

    // Stocked, and still not on screen. This is the whole slice: the shelf is
    // the reward for an intent we know, not the default state of a DIY task.
    await expect(page.getByTestId('diy-kit-toggle-flush_ac_condensate')).toHaveCount(0);
    // The choice is offered instead - and it has replaced the badge, so there
    // is no static DIY label competing with it.
    await expect(page.getByTestId('choose-diy-flush_ac_condensate')).toBeVisible();
    await expect(page.getByTestId('choose-pro-flush_ac_condensate')).toBeVisible();
    await shot(page, '07-choice-undecided.png');

    await page.getByTestId('choose-diy-flush_ac_condensate').click();
    const strip = page.getByTestId('diy-kit-toggle-flush_ac_condensate');
    await expect(strip).toBeVisible();
    await expect(strip).toContainText('2 picks');
    // Decided, so the toggle folds into a chip and the card loses a row.
    await expect(page.getByTestId('choice-chip-flush_ac_condensate')).toContainText("You've got this");
    await shot(page, '08-choice-diy-shelf.png');
  });

  test('S7: handing it to La Vaca puts it on the request and takes the gear away', async ({ page }) => {
    await openChecklist(page);
    const row = taskRow(page, 'Clear the A/C condensate drain line');
    await row.scrollIntoViewIfNeeded();

    // S6 left this task decided, which is exactly the state a returning member
    // arrives in - so this also proves the way back. The chip IS the way to
    // change your mind: tapping it reopens the toggle it collapsed into.
    await expect(page.getByTestId('choice-chip-flush_ac_condensate')).toContainText("You've got this");
    await page.getByTestId('choice-chip-flush_ac_condensate').click();

    await page.getByTestId('choose-pro-flush_ac_condensate').click();
    // Picking Pro IS adding it to the request - one tap, not two.
    await expect(page.getByTestId('choice-chip-flush_ac_condensate')).toContainText('On your request');
    await expect(page.getByTestId('diy-kit-toggle-flush_ac_condensate')).toHaveCount(0);

    // "On your request" has to mean a request that EXISTS. The pill is the only
    // way to send one, and it carries the keys, so both are asserted rather
    // than the chip's wording alone.
    const pill = page.getByRole('link', { name: /^Review your request/ });
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('href', /[?&]tasks=(.*,)?flush_ac_condensate(,|$)/);
    await shot(page, '09-choice-pro-on-request.png');

    // And it survives a reload, because the choice is stored rather than held
    // in a tab. A member who picks on their phone and opens the portal on a
    // laptop must not be asked again.
    //
    // The pill is re-asserted here for a reason: the chip is rendered from the
    // rehydrated mode while the request used to be seeded from the ?add= deep
    // link alone, so this was exactly where the two came apart - card saying
    // the job was on the request, no pill on screen to send it, and this spec
    // passing over it because it only ever checked the wording.
    await openChecklist(page);
    await expect(page.getByTestId('choice-chip-flush_ac_condensate')).toContainText('On your request');
    await expect(page.getByTestId('diy-kit-toggle-flush_ac_condensate')).toHaveCount(0);
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('href', /[?&]tasks=(.*,)?flush_ac_condensate(,|$)/);

    // The chip is the way back, and a real one: it writes the reversal, so the
    // task leaves the request and STAYS off across a reload rather than the
    // card quietly re-growing a chip the server still believed in.
    await page.getByTestId('choice-chip-flush_ac_condensate').click();
    await expect(page.getByTestId('choose-pro-flush_ac_condensate')).toBeVisible();
    await expect(pill).toHaveCount(0);
    await openChecklist(page);
    await expect(page.getByTestId('choice-chip-flush_ac_condensate')).toHaveCount(0);
    await expect(page.getByTestId('choose-pro-flush_ac_condensate')).toBeVisible();
    await expect(pill).toHaveCount(0);
  });

  test('S8: no price appears anywhere on the checklist', async ({ page }) => {
    await openChecklist(page);
    // The catalog still carries est_cost on two of these fixtures, and the page
    // used to render "Pro est. $400-$900" from them. Choosing who does a job is
    // not the moment to anchor on a number (owner, 6 Aug 2026), so the page
    // stopped reading those columns at all.
    const main = page.locator('main');
    await expect(main).not.toContainText('Pro est.');
    await expect(main).not.toContainText('Consult with our team');
    // Nor does the shelf carry a price of its own. The product price band was
    // retired one commit earlier (#100) and the component stopped reading the
    // column, so "no pricing" now covers the open shelf too - which is the only
    // reading that matches S2. The stub still SERVES a band on these rows, so
    // this only passes while the component genuinely ignores them.
    await page.getByTestId('diy-kit-toggle-replace_hvac_filter').click();
    const shelf = taskRow(page, 'Replace the HVAC filter');
    await expect(shelf.getByTestId('diy-kit-link').first()).toBeVisible();
    await expect(shelf.getByText('Under $25')).toHaveCount(0);
    await expect(main.getByText(/\$\d/)).toHaveCount(0);
    await shot(page, '10-no-pricing-anywhere.png', { fullPage: true });
  });

  test('S9: changing who does a task does not erase a completion', async ({ page }) => {
    await openChecklist(page);
    const row = taskRow(page, 'Clear the A/C condensate drain line');
    await row.scrollIntoViewIfNeeded();

    // The member who cleared the line themselves in June, and in August decides
    // we should take it over next time. Both facts are one row, and the mode
    // write touches only one of them.
    await row.getByRole('button', { name: 'Mark done' }).click();
    await expect(row.getByRole('button', { name: 'Mark not done' })).toBeVisible();

    await page.getByTestId('choose-pro-flush_ac_condensate').click();
    await expect(page.getByTestId('choice-chip-flush_ac_condensate')).toContainText('On your request');

    // Asserted across a RELOAD, because that is the only place the damage would
    // show: the mode write upserts with merge-duplicates, so a hardcoded
    // status:'todo' would blank the completion server-side while the tab kept
    // rendering the tick it never re-read. The route reads the status back and
    // writes it again for exactly this.
    await openChecklist(page);
    const after = taskRow(page, 'Clear the A/C condensate drain line');
    await expect(after.getByRole('button', { name: 'Mark not done' })).toBeVisible();
    await expect(page.getByTestId('choice-chip-flush_ac_condensate')).toContainText('On your request');
    await shot(page, '11-completion-survives-mode-change.png');
  });
});
