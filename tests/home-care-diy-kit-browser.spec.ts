import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { shelfPosition, shelfRangeLabel, SHELF_GAP } from '@/lib/homecare/shelfPosition';

/**
 * Home Care DIY Kit - the admin screen and the member shelf, in a real browser.
 *
 * The static spec proves the contract and the route spec proves the answers;
 * this one proves the SCREEN, because the parts the owner will actually judge -
 * a pro task that refuses to open, a blocked photo pull that turns into an
 * upload box, a swipe shelf whose counter tracks the scroll - only exist once
 * React has mounted. A string match on the source cannot tell you any of them
 * work, and a rename is not a regression.
 *
 * The shop's data comes through page.route, so these run under the ordinary
 * stub build with no database: what is being tested is the screen's behaviour
 * given an answer, not the answer.
 *
 * Auth follows the house pattern: the fabricated session cookie whose name
 * derives from the baked NEXT_PUBLIC_SUPABASE_URL, against the GoTrue stub.
 *
 * The shelf half at the bottom takes a different route to the same place, for a
 * reason worth stating: /home-care/checklist needs an `hc_access` cookie signed
 * with LISTINGS_ACCESS_SECRET and a real homeowner behind it, and the stub build
 * has neither, so a route-level render test would only ever assert a redirect.
 * What it does instead is lay out the shelf's real geometry in a real browser
 * and ask `shelfPosition` - the arithmetic the component runs on every scroll
 * event - what the counter says about it.
 */

const SHOP = '/vaca-mgmt/home-care-shop';

const TASKS = [
  { key: 'basement_humidity', title: 'Keep the basement under 60% humidity', diy_or_pro: 'diy', seasons: ['summer'], frequency: 'quarterly', eligible: true, product_count: 2 },
  { key: 'audit_alarms', title: 'Check every smoke & CO alarm', diy_or_pro: 'diy', seasons: ['spring', 'summer', 'fall', 'winter'], frequency: 'annual', eligible: true, product_count: 0 },
  { key: 'winterize_faucets', title: 'Shut off & drain outdoor faucets', diy_or_pro: 'either', seasons: ['fall'], frequency: 'annual', eligible: true, product_count: 0 },
  { key: 'chimney_inspect', title: 'Chimney inspection & sweep', diy_or_pro: 'pro', seasons: ['fall'], frequency: 'annual', eligible: false, product_count: 0 },
];

const PRODUCTS = [
  {
    id: 'p1', asin: 'B01H1R0K5C', display_name: 'Digital hygrometer, 2-pack', brand: 'ThermoPro',
    pitch: 'One at each end of the basement.', images: ['B01H1R0K5C/1.png'], image_source: 'manual',
    price_band: 'under_25', category: 'monitor', active: true, link_status: 'ok', checked_at: null,
    task_keys: ['basement_humidity'],
  },
  {
    id: 'p2', asin: 'B08KFRZL3B', display_name: '50-pint dehumidifier', brand: null,
    pitch: 'Set it to 55% and run the hose to the sump.', images: ['B08KFRZL3B/1.png'], image_source: 'manual',
    price_band: '100_plus', category: 'tool', active: true, link_status: 'ok', checked_at: null,
    task_keys: ['basement_humidity'],
  },
  {
    id: 'p3', asin: 'B07YFCB4RD', display_name: 'Wet/dry shop vac', brand: null, pitch: null,
    images: [], image_source: null, price_band: '50_100', category: 'tool', active: false,
    link_status: 'ok', checked_at: null, task_keys: [],
  },
];

async function signInAsAdmin(context: BrowserContext, baseURL: string) {
  const session = {
    access_token: 'stub-access-token',
    refresh_token: 'stub-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated' },
  };
  await context.addCookies([{
    name: 'sb-127-auth-token',
    value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'),
    url: baseURL,
  }]);
}

/**
 * Serve the shop payload, and let each test say what the mutating calls answer.
 *
 * `onWrite` is handed the parsed request BODY as well as the method, because
 * what the screen asks for is half of what these tests are about: an attach that
 * restates the whole shelf set is a silent data loss that looks identical from
 * the outside to one that asks for a single shelf.
 */
async function serveShop(
  page: Page,
  opts: {
    status?: number;
    body?: unknown;
    onWrite?: (method: string, body: unknown) => { status: number; json: unknown };
  } = {},
) {
  await page.route('**/api/admin/home-care/products**', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: opts.status ?? 200,
        json: opts.body ?? { tasks: TASKS, products: PRODUCTS },
      });
      return;
    }
    let sent: unknown = null;
    try { sent = route.request().postDataJSON(); } catch { sent = route.request().postData(); }
    const answer = opts.onWrite?.(method, sent) ?? { status: 200, json: { ok: true } };
    await route.fulfill({ status: answer.status, json: answer.json });
  });
}

test.describe('DIY Kit admin screen', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signInAsAdmin(context, baseURL!);
  });

  test('happy: the screen opens on the maintenance catalog with its counts', async ({ page }) => {
    await serveShop(page);
    await page.goto(SHOP);
    await expect(page.getByRole('heading', { name: 'Home Care Shop' })).toBeVisible();
    // Task-first: the first thing on screen is the catalog, not a product form.
    await expect(page.getByText('Keep the basement under 60% humidity')).toBeVisible();
    await expect(page.getByText('2 items')).toBeVisible();
    await expect(page.getByText('Add items').first()).toBeVisible();
    // The header states the eligible split, so the gate is legible before anyone clicks.
    await expect(page.getByText('3 of 4 tasks can carry a DIY shelf')).toBeVisible();
  });

  test('unhappy: a pro-only task is visibly locked and cannot be opened', async ({ page }) => {
    await serveShop(page);
    await page.goto(SHOP);

    const pro = page.getByRole('button', { name: /Chimney inspection/ });
    await expect(pro).toBeVisible();
    await expect(pro).toBeDisabled();
    await expect(pro).toContainText('We do this one');

    // Clicking it must do nothing at all - not open, not error.
    await pro.click({ force: true });
    await expect(page.getByRole('heading', { name: 'Home Care Shop' })).toBeVisible();
    await expect(page.getByText('Paste an Amazon link')).toHaveCount(0);
  });

  test('happy: opening a task shows its shelf and the two ways to add', async ({ page }) => {
    await serveShop(page);
    await page.goto(SHOP);
    await page.getByRole('button', { name: /Keep the basement/ }).click();

    await expect(page.getByRole('heading', { name: 'Keep the basement under 60% humidity' })).toBeVisible();
    await expect(page.getByText('2 products, shown in this order.')).toBeVisible();
    await expect(page.getByText('Digital hygrometer, 2-pack')).toBeVisible();
    await expect(page.getByRole('button', { name: /Paste an Amazon link/ })).toBeVisible();
    // The library offers the products that are NOT already on this task.
    await expect(page.getByRole('button', { name: /Pick from my library \(1\)/ })).toBeVisible();
  });

  test('happy: an empty task says so rather than showing an empty grid', async ({ page }) => {
    await serveShop(page);
    await page.goto(SHOP);
    await page.getByRole('button', { name: /Check every smoke/ }).click();
    await expect(page.getByText('Members see no shelf on this task until you add something.')).toBeVisible();
  });

  test('unhappy: a link the server refuses surfaces the server sentence', async ({ page }) => {
    await serveShop(page);
    await page.route('**/api/admin/home-care/parse-amazon', async (route) => {
      await route.fulfill({
        status: 422,
        json: { error: "That link doesn't name a product. Open the item on Amazon and copy the URL from the address bar (it contains /dp/)." },
      });
    });
    await page.goto(SHOP);
    await page.getByRole('button', { name: /Keep the basement/ }).click();
    await page.getByLabel('Amazon product URL').fill('https://www.amazon.com/s?k=hygrometer');
    await page.getByRole('button', { name: 'Parse' }).click();

    await expect(page.getByText('That link did not work').first()).toBeVisible();
    await expect(page.getByText(/it contains \/dp\//).first()).toBeVisible();
    // And the form does not advance to a draft it could not build.
    await expect(page.getByText('Display name')).toHaveCount(0);
  });

  test('unhappy: a blocked photo pull becomes an upload box and a draft, not an error', async ({ page }) => {
    await serveShop(page);
    await page.route('**/api/admin/home-care/parse-amazon', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          asin: 'B01H1R0K5C', title: 'ThermoPro TP49 Digital Hygrometer', brand: 'ThermoPro',
          images: [], imageSource: null,
          reason: 'Amazon blocked the request (it does that to servers). Add a photo below.',
        },
      });
    });
    await page.goto(SHOP);
    await page.getByRole('button', { name: /Keep the basement/ }).click();
    await page.getByLabel('Amazon product URL').fill('https://www.amazon.com/dp/B01H1R0K5C');
    await page.getByRole('button', { name: 'Parse' }).click();

    // The ASIN and the title still arrived - the paste was not wasted.
    await expect(page.getByText('B01H1R0K5C')).toBeVisible();
    await expect(page.getByText('photo needed')).toBeVisible();
    await expect(page.getByText(/Amazon blocked the request/)).toBeVisible();
    await expect(page.getByText('Upload a photo')).toBeVisible();
    // With no photo the only thing on offer is a draft, and it says so.
    await expect(page.getByRole('button', { name: 'Save as draft' })).toBeVisible();
  });

  test('happy: a parse with photos offers to add it to the task', async ({ page }) => {
    await serveShop(page);
    await page.route('**/api/admin/home-care/parse-amazon', async (route) => {
      await route.fulfill({
        status: 200,
        json: { asin: 'B0NEWITEM1', title: 'Moisture absorber tubs', brand: 'DampRid', images: ['B0NEWITEM1/1.png'], imageSource: 'listing' },
      });
    });
    await page.goto(SHOP);
    await page.getByRole('button', { name: /Keep the basement/ }).click();
    await page.getByLabel('Amazon product URL').fill('https://www.amazon.com/dp/B0NEWITEM1');
    await page.getByRole('button', { name: 'Parse' }).click();

    await expect(page.getByText('1 photo pulled')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to this item' })).toBeVisible();
    // The name came pre-filled from the listing, which is the point of the paste.
    await expect(page.locator('input[placeholder="Digital hygrometer, 2-pack"]')).toHaveValue('Moisture absorber tubs');
    // Pro tasks are absent from the "also show on" chips entirely.
    await expect(page.getByRole('button', { name: /Chimney inspection/ })).toHaveCount(0);
  });

  test('unhappy: a save the server rejects keeps the draft on screen', async ({ page }) => {
    await serveShop(page, {
      onWrite: (method) => method === 'POST'
        ? { status: 409, json: { error: 'That product is already in your library.' } }
        : { status: 200, json: { ok: true } },
    });
    await page.route('**/api/admin/home-care/parse-amazon', async (route) => {
      await route.fulfill({ status: 200, json: { asin: 'B0NEWITEM1', title: 'Moisture absorber tubs', brand: null, images: ['B0NEWITEM1/1.png'], imageSource: 'listing' } });
    });
    await page.goto(SHOP);
    await page.getByRole('button', { name: /Keep the basement/ }).click();
    await page.getByLabel('Amazon product URL').fill('https://www.amazon.com/dp/B0NEWITEM1');
    await page.getByRole('button', { name: 'Parse' }).click();
    await page.getByRole('button', { name: 'Add to this item' }).click();

    await expect(page.getByText('Not saved').first()).toBeVisible();
    await expect(page.getByText('That product is already in your library.').first()).toBeVisible();
    // The work is not thrown away: the draft is still there to correct.
    await expect(page.getByRole('button', { name: 'Add to this item' })).toBeVisible();
  });

  test('unhappy: a database without the migration says so, and offers a retry', async ({ page }) => {
    await serveShop(page, {
      status: 503,
      body: { error: 'The Home Care Shop tables are not in this database yet. Apply the migration first.' },
    });
    await page.goto(SHOP);
    await expect(page.getByText(/tables are not in this database yet/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('happy: the library lists every product with where it is shown', async ({ page }) => {
    await serveShop(page);
    await page.goto(SHOP);
    await page.getByRole('button', { name: /Product library \(3\)/ }).click();
    await expect(page.getByText('Wet/dry shop vac')).toBeVisible();
    // A product on no task is visible in the library and says it is on none -
    // that is the state the coverage panel will act on in slice 2.
    await expect(page.getByText('on no item')).toBeVisible();
    // Drafts are labelled as drafts rather than looking live.
    await expect(page.getByRole('button', { name: 'Draft' })).toBeVisible();
  });

  test('the retired price band is nowhere on the admin screen, on any of its three surfaces', async ({ page }) => {
    // Owner, 2026-08-06: the band is retired. The contract spec asserts that
    // over the SOURCE, which a rename would satisfy without the screen changing,
    // so the screen itself is asked here.
    //
    // What makes this worth its runtime: the mocked payload above still carries
    // `price_band` on all three products, exactly as a database full of bands
    // chosen before today does. So this passes only while the component
    // genuinely ignores a band it was handed, not merely because none arrived.
    await serveShop(page);
    await page.route('**/api/admin/home-care/parse-amazon', async (route) => {
      await route.fulfill({
        status: 200,
        json: { asin: 'B0NEWITEM1', title: 'Moisture absorber tubs', brand: 'DampRid', images: ['B0NEWITEM1/1.png'], imageSource: 'listing' },
      });
    });
    await page.goto(SHOP);

    /**
     * Swept on EACH surface rather than once at the end, which is the whole
     * difference between this test and a vacuous one: these three are separate
     * renders of the same screen and only one of them is mounted at a time, so
     * a single sweep after the last navigation says nothing about the first
     * two. Written this way because the one-sweep version passed with a band
     * deliberately put back on the shelf row.
     */
    const noPricingOnScreen = async () => expect(page.getByText(/\$\d/)).toHaveCount(0);

    // 1. The shelf on an open task, where a band used to sit under each name.
    await page.getByRole('button', { name: /Keep the basement/ }).click();
    await expect(page.getByText('Digital hygrometer, 2-pack')).toBeVisible();
    await expect(page.getByText('On this item only').first()).toBeVisible();
    await noPricingOnScreen();

    // 2. The drafting form, which no longer asks for one. The control's absence
    // is asserted as well as its text: a select nobody can see still posts a
    // band.
    await page.getByLabel('Amazon product URL').fill('https://www.amazon.com/dp/B0NEWITEM1');
    await page.getByRole('button', { name: 'Parse' }).click();
    await expect(page.getByText('Display name')).toBeVisible();
    await expect(page.getByText('Price band')).toHaveCount(0);
    await expect(page.locator('select')).toHaveCount(1); // Category, and only Category.
    await expect(page.locator('select')).not.toContainText('Under $25');
    await noPricingOnScreen();

    // 3. The library, the other list that carried a band per row. It lives on
    // the catalog screen, so the open task has to be closed to get back to it.
    await page.getByRole('button', { name: /All items/ }).click();
    await page.getByRole('button', { name: /Product library \(3\)/ }).click();
    await expect(page.getByText('Wet/dry shop vac')).toBeVisible();
    await expect(page.getByText('On no item')).toBeVisible();
    await noPricingOnScreen();
  });

  test('happy: adding from the library asks for ONE shelf, never the whole set', async ({ page }) => {
    // The failure being ruled out: this screen has been open a while, another
    // tab put the same product on two more tasks, and an "add" that restates
    // the set from what this screen last loaded takes those two away without
    // ever saying so. The request body is where that is visible, so that is
    // what this asserts.
    const writes: Array<{ method: string; body: unknown }> = [];
    await serveShop(page, {
      onWrite: (method, body) => {
        writes.push({ method, body });
        return { status: 200, json: { ok: true, task_keys: ['audit_alarms'] } };
      },
    });
    await page.goto(SHOP);
    await page.getByRole('button', { name: /Check every smoke/ }).click();
    await page.getByRole('button', { name: /Pick from my library/ }).click();
    await page.getByRole('button', { name: 'Add' }).first().click();

    await expect(page.getByText(/is on this item now/).first()).toBeVisible();
    const patch = writes.find((w) => w.method === 'PATCH');
    // Exactly this, and nothing else: no task_keys field at all.
    expect(patch?.body).toEqual({ attach_task_key: 'audit_alarms' });
  });

  test('happy: removing asks for that one shelf, and the count comes from the answer', async ({ page }) => {
    const writes: Array<{ method: string; body: unknown }> = [];
    await serveShop(page, {
      onWrite: (method, body) => {
        writes.push({ method, body });
        // The server says this product is still on two other shelves. The
        // screen's own copy says it is on none, so a toast reading "2 other
        // items" can only have come from this answer.
        return { status: 200, json: { ok: true, task_keys: ['audit_alarms', 'winterize_faucets'] } };
      },
    });
    await page.goto(SHOP);
    await page.getByRole('button', { name: /Keep the basement/ }).click();
    await page.getByRole('button', { name: /Remove Digital hygrometer, 2-pack from this item/ }).click();

    await expect(page.getByText('Still shown on 2 other items.').first()).toBeVisible();
    const patch = writes.find((w) => w.method === 'PATCH');
    expect(patch?.body).toEqual({ detach_task_key: 'basement_humidity' });
  });

  test('the PA-API reminder is on the screen where the manual work happens', async ({ page }) => {
    await serveShop(page);
    await page.goto(SHOP);
    await expect(page.getByText('Photos are manual for now.')).toBeVisible();
    await expect(page.getByText(/Product Advertising API access opens/)).toBeVisible();
  });
});

// ------------------------------------------------------------- the member shelf

/**
 * The shelf's own layout, in the browser: a 320px viewport (a small phone), the
 * cards at the 44% the component gives them so two fit with a sliver of the
 * third, and the same gap. Nothing here is React - what is under test is the
 * arithmetic, and the browser's job is to produce the fractional widths and the
 * clamped end-of-scroll position that a hand-written fixture gets wrong.
 */
const SHELF_HARNESS = (count: number, shelf = 320, card = '44%') => `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    #scroller { display: flex; gap: ${SHELF_GAP}px; overflow-x: auto; width: ${shelf}px; }
    #scroller > div { width: ${card}; flex: 0 0 auto; height: 120px; background: #eee; }
  </style>
  <div id="scroller">${'<div></div>'.repeat(count)}</div>
`;

async function readShelf(page: Page) {
  return page.evaluate(() => {
    const el = document.getElementById('scroller')!;
    const card = el.firstElementChild as HTMLElement | null;
    return {
      scrollLeft: el.scrollLeft,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      cardWidth: card?.offsetWidth ?? el.clientWidth,
      count: el.children.length,
    };
  });
}

/** The counter exactly as DiyKitShelf composes it: the label, then " of N". */
const counter = (position: ReturnType<typeof shelfPosition>, count: number) =>
  `${shelfRangeLabel(position.range)} of ${count}`;

test.describe('DIY Kit member shelf', () => {
  test('happy: the counter tracks the scroll, and reaches the last card at the end', async ({ page }) => {
    await page.setContent(SHELF_HARNESS(4));

    const atRest = await readShelf(page);
    expect(atRest.scrollWidth, 'four 44% cards must overflow a 320px shelf').toBeGreaterThan(atRest.clientWidth);
    const start = shelfPosition(atRest);
    expect(counter(start, 4)).toBe('1 - 2 of 4');
    // The bar starts at the left and covers the fraction that is on screen.
    expect(start.thumb.left).toBe(0);
    expect(start.thumb.width).toBeGreaterThan(40);
    expect(start.thumb.width).toBeLessThan(70);

    // All the way right. The browser clamps this to the real maximum, which is
    // the position the old left-counted arithmetic got wrong: it does not land
    // on a card boundary, so the counter read "2 - 3 of 4" with the fourth card
    // plainly on screen.
    await page.evaluate(() => { document.getElementById('scroller')!.scrollLeft = 99999; });
    const atEnd = shelfPosition(await readShelf(page));
    expect(counter(atEnd, 4)).toBe('3 - 4 of 4');
    // And the bar is flush with the right end of its track.
    expect(atEnd.thumb.left + atEnd.thumb.width).toBeCloseTo(100, 5);

    // One card forward from rest, by the same step the arrows nudge by.
    const step = atRest.cardWidth + SHELF_GAP;
    await page.evaluate((left) => { document.getElementById('scroller')!.scrollLeft = left; }, step);
    const nudged = shelfPosition(await readShelf(page));
    expect(counter(nudged, 4)).toBe('2 - 3 of 4');
    expect(nudged.thumb.left).toBeGreaterThan(0);
  });

  test('a shelf whose cards all fit counts all of them and fills its bar', async ({ page }) => {
    // The sm: layout - three cards at 30% on a desktop-width shelf, so nothing
    // is off screen. The counter must say so rather than claiming a window.
    await page.setContent(SHELF_HARNESS(3, 900, '30%'));
    const wide = await readShelf(page);
    expect(wide.scrollWidth).toBe(wide.clientWidth);
    const all = shelfPosition(wide);
    expect(counter(all, 3)).toBe('1 - 3 of 3');
    expect(all.thumb.width).toBe(100);
    expect(all.thumb.left).toBe(0);

    // And when one card fills the view the label collapses to a single number
    // rather than reading "2 - 2".
    expect(shelfRangeLabel({ first: 2, last: 2 })).toBe('2');
    expect(shelfRangeLabel({ first: 1, last: 2 })).toBe('1 - 2');
  });
});
