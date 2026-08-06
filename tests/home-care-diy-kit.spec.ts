import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseAsin, amazonProductUrl, isDiyEligible, isRenderable, priceBandLabel, isPriceBand,
  isProductCategory, productImageUrl, AFFILIATE_DISCLOSURE, type HomeCareProduct,
} from '@/lib/homecare/products';

/**
 * Home Care DIY Kit, slice 1. Acceptance criteria in
 * docs/home-care-diy-kit-acceptance-criteria.md.
 *
 * The pure contract (ASIN parsing, link building, the DIY gate, what may render)
 * is exercised directly. The rules that live in SQL or in a server component are
 * asserted over the files that carry them, in the same style as
 * home-care-catalog-v2.spec.ts: the database is the source of truth for those,
 * and the migration is the tracked statement of what it will say.
 */

const root = process.cwd();
const MIGRATION = 'supabase/migrations/20260828000000_home_care_products.sql';
const SHELF = 'src/components/homecare/DiyKitShelf.tsx';
const CLIENT = 'src/components/homecare/HomeCareChecklistClient.tsx';
const PAGE = 'src/app/home-care/checklist/page.tsx';
const PRODUCTS_ROUTE = 'src/app/api/admin/home-care/products/route.ts';
const PATCH_ROUTE = 'src/app/api/admin/home-care/products/[id]/route.ts';
const PARSE_ROUTE = 'src/app/api/admin/home-care/parse-amazon/route.ts';
const ADMIN = 'src/components/admin/HomeCareShopManager.tsx';
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/**
 * The body of one `const <name> = ...` in a component, up to the next one.
 *
 * Anchored on the declaration that follows rather than on a character window.
 * A window says "these two things are near each other", which stops being true
 * when somebody adds two lines of comment in between - and then the build goes
 * red pointing at code that is correct. This branch has already had to move one
 * such anchor once.
 */
const functionBody = (src: string, name: string): string => {
  const from = src.indexOf(`const ${name} `);
  expect(from, `${name} is not declared in this file`).toBeGreaterThan(-1);
  const end = src.indexOf('\n  const ', from + 1);
  return src.slice(from, end === -1 ? undefined : end);
};

const product = (over: Partial<HomeCareProduct> = {}): HomeCareProduct => ({
  id: 'p1', asin: 'B08XYZ1234', display_name: 'Digital hygrometer, 2-pack',
  images: ['B08XYZ1234/1-0.jpg'], price_band: 'under_25', active: true, link_status: 'ok', ...over,
});

// ---------------------------------------------------------------- AC2: ASINs

test('AC2 - every shape the owner actually pastes yields the ASIN', () => {
  for (const input of [
    'https://www.amazon.com/dp/B08XYZ1234',
    'https://www.amazon.com/dp/B08XYZ1234/ref=sr_1_3?keywords=hygrometer&th=1',
    'https://www.amazon.com/gp/product/B08XYZ1234',
    'https://www.amazon.com/gp/aw/d/B08XYZ1234',
    'https://www.amazon.com/ThermoPro-Hygrometer-Thermometer/dp/B08XYZ1234/ref=sr_1_3',
    'https://smile.amazon.co.uk/dp/B08XYZ1234',
    'www.amazon.com/dp/B08XYZ1234',
    'B08XYZ1234',
    '  b08xyz1234  ',
  ]) {
    expect(parseAsin(input), input).toBe('B08XYZ1234');
  }
});

test('AC2 - a link that names no product fails rather than guessing', () => {
  for (const input of [
    'https://www.amazon.com/s?k=hygrometer',
    'https://www.amazon.com/',
    'https://www.notamazon.com/dp/B08XYZ1234',
    'https://example.com/dp/B08XYZ1234',
    'just some text',
    '',
    null,
    undefined,
  ]) {
    expect(parseAsin(input as string), String(input)).toBeNull();
  }
});

test('AC2 - a bare ten-character word is not mistaken for an ASIN', () => {
  // The failure this guards is silent: a bad ASIN 404s at Amazon, on a member's
  // phone, and never anywhere we would see it.
  expect(parseAsin('JAVASCRIPT')).toBeNull();
  expect(parseAsin('HELLOWORLD')).toBeNull();
  // ISBN-10 book listings are still real ASINs.
  expect(parseAsin('0143127748')).toBe('0143127748');
  expect(parseAsin('012345678X')).toBe('012345678X');
});

// ------------------------------------------------- AC3/AC4: links and marking

test('AC3 - the tag is applied at render and the link works without one', () => {
  expect(amazonProductUrl('B08XYZ1234', 'lavacagc-20')).toBe('https://www.amazon.com/dp/B08XYZ1234?tag=lavacagc-20');
  expect(amazonProductUrl('B08XYZ1234')).toBe('https://www.amazon.com/dp/B08XYZ1234');
  expect(amazonProductUrl('B08XYZ1234', '')).toBe('https://www.amazon.com/dp/B08XYZ1234');
  expect(amazonProductUrl('B08XYZ1234', null)).toBe('https://www.amazon.com/dp/B08XYZ1234');
  // Whichever regional host it was pasted from, the tagged link is the US one:
  // an Associates tag only earns on the marketplace it belongs to.
  expect(amazonProductUrl('B08XYZ1234', 'lavacagc-20')).toContain('www.amazon.com');
});

test('AC3 - no stored column ever carries a finished affiliate URL', () => {
  const sql = read(MIGRATION);
  expect(sql).not.toContain('tag=');
  expect(sql).toMatch(/asin\s+TEXT NOT NULL UNIQUE/);
  // The tag reaches the client as a prop read from the env, never from a row.
  expect(read(PAGE)).toContain('affiliateTag={process.env.AMAZON_ASSOCIATES_TAG ?? null}');
});

test('AC4 - outbound product links are marked sponsored and disclosed', () => {
  const shelf = read(SHELF);
  expect(shelf).toContain('rel="sponsored nofollow noopener"');
  expect(shelf).toContain('target="_blank"');
  expect(shelf).toContain('{AFFILIATE_DISCLOSURE}');
  // The disclosure says the three things it has to: commission, no extra cost,
  // and that the counting is not attributed to a person.
  expect(AFFILIATE_DISCLOSURE).toMatch(/commission/i);
  expect(AFFILIATE_DISCLOSURE).toMatch(/no extra cost/i);
  expect(AFFILIATE_DISCLOSURE).toMatch(/not who tapped/i);
});

// ------------------------------------------------------ AC1: the DIY-only gate

test('AC1 - only diy and either tasks may carry a shelf', () => {
  expect(isDiyEligible('diy')).toBe(true);
  expect(isDiyEligible('either')).toBe(true);
  expect(isDiyEligible('pro')).toBe(false);
  expect(isDiyEligible(null)).toBe(false);
  expect(isDiyEligible(undefined)).toBe(false);
  expect(isDiyEligible('')).toBe(false);
});

test('AC1 - the gate is enforced on write, not only in the UI', () => {
  for (const route of [PRODUCTS_ROUTE, PATCH_ROUTE]) {
    const src = read(route);
    expect(src, route).toContain('refuseIneligible');
    expect(src, route).toContain('status: 422');
    // The refusal itself is written once, where the rule lives, so the two
    // write paths cannot come to say different things about the same task.
    expect(src, route).not.toContain('Not eligible:');
  }
  const admin = read('src/lib/homecare/productAdmin.ts');
  expect(admin).toContain('Not eligible:');
  expect(admin).toContain('eligibleTaskKeys');
  // And the admin renders pro rows locked rather than hiding them, so the
  // exclusion reads as a decision instead of a missing task.
  expect(read(ADMIN)).toContain('We do this one');
});

// --------------------------------------------------- AC5: when a shelf renders

test('AC5 - nothing dead, drafted or pictureless reaches a member', () => {
  expect(isRenderable(product())).toBe(true);
  expect(isRenderable(product({ active: false }))).toBe(false);
  expect(isRenderable(product({ link_status: 'gone' }))).toBe(false);
  expect(isRenderable(product({ images: [] }))).toBe(false);
  // 'suspect' means "we could not tell", usually an Amazon block. Emptying a
  // shelf on an inconclusive answer is the failure the three states exist to
  // prevent, so it still renders.
  expect(isRenderable(product({ link_status: 'suspect' }))).toBe(true);
});

test('AC5 - a task with no shelf renders exactly as before', () => {
  const client = read(CLIENT);
  expect(client).toContain('const shelf = productShelves[t.key] ?? [];');
  expect(client).toContain('{shelf.length > 0 && <DiyKitShelf');
});

// ------------------------------------------------------- AC6: the swipe shelf

test('AC6 - past two picks the shelf swipes, with a bar that is always drawn', () => {
  const shelf = read(SHELF);
  expect(shelf).toContain('const SWIPE_FROM = 3');
  expect(shelf).toContain('snap-x snap-mandatory');
  // The platform scrollbar is hidden precisely because it fades: the drawn bar
  // is the only thing telling a member the shelf continues.
  expect(shelf).toContain('[&::-webkit-scrollbar]:hidden');
  expect(shelf).toMatch(/aria-hidden="true"[\s\S]{0,200}rounded-full bg-muted/);
  expect(shelf).toContain('of {products.length}');
  expect(shelf).toContain('swipe for more');
});

// --------------------------------------------------------------- AC7: photos

test('AC7 - a blocked fetch is a normal answer, not an error', () => {
  const route = read(PARSE_ROUTE);
  // The only 4xx is the one the operator can act on: a URL with no product.
  expect(route).toContain("status: 422");
  expect(route).toMatch(/Amazon blocked the request/);
  expect(route).toContain('listingFetchEnabled()');
  // Images are copied into our storage, never hotlinked.
  expect(route).toContain('storeProductImage');
  // And the listing that gets read is the CANONICAL one built from the ASIN. A
  // bare ASIN and a scheme-less URL both parse, and neither is something fetch
  // can open, so pointing this at the raw paste turned two advertised shapes
  // into "Amazon blocked the request" for a request never sent.
  expect(route).toContain('parseAmazonListing(amazonProductUrl(asin)');
});

test('AC7 - a live product cannot exist without a photo, and that is in the schema', () => {
  const sql = read(MIGRATION);
  expect(sql).toContain('home_care_products_active_needs_image');
  expect(sql).toContain('CHECK (NOT active OR jsonb_array_length(images) > 0)');
  // And the column defaults to draft, so the minimal insert lands hidden rather
  // than failing against that rule.
  expect(sql).toMatch(/active\s+BOOLEAN NOT NULL DEFAULT false/);
});

test('AC7 - the image switch can be thrown without a deploy', () => {
  expect(read('src/lib/homecare/amazonListing.ts')).toContain('HOME_CARE_IMAGE_FETCH');
});

// ---------------------------------------------------- AC8: the admin is task-first

test('AC8 - the admin opens on tasks and links products rather than copying them', () => {
  const admin = read(ADMIN);
  expect(admin).toContain("useState<'tasks' | 'library'>('tasks')");
  expect(admin).toContain('By maintenance item');
  expect(admin).toContain('Pick from my library');
  // Reuse patches the existing row's task list; it never creates a second row.
  expect(functionBody(admin, 'attachExisting')).toContain("method: 'PATCH'");
  expect(admin).toContain('Also show on these items');
});

test('AC8 - attaching adds one shelf and never restates a set the screen may not have', () => {
  // The failure this guards: a screen left open while another tab stocks the
  // same product elsewhere, then an attach computed from the stale list that
  // silently strips every other shelf. What the screen actually SENDS is
  // asserted in home-care-diy-kit-browser.spec.ts; this is the same invariant
  // read off the source, so a refactor cannot quietly reintroduce the set.
  const attach = functionBody(read(ADMIN), 'attachExisting');
  expect(attach).toContain('attach_task_key: openTask');
  expect(attach).not.toContain('task_keys');
  expect(functionBody(read(ADMIN), 'detach')).toContain('detach_task_key: openTask');
  // The server owns the union, and answers with the resulting set.
  const route = read(PATCH_ROUTE);
  expect(route).toContain('attach_task_key');
  expect(route).toContain('currentTaskKeys');
});

test('AC8 - a task_keys that is not a list is refused, never read as "off every shelf"', () => {
  // `[]` is a real instruction and stays one. Anything else that is not a list
  // is a client bug, and the two must not be the same value by the time a route
  // decides whether to delete every join row.
  const admin = read('src/lib/homecare/productAdmin.ts');
  expect(admin).toContain('export function normalizeTaskKeys(value: unknown): string[] | null');
  expect(admin).toContain('if (!Array.isArray(value)) return null;');
  for (const route of [PRODUCTS_ROUTE, PATCH_ROUTE]) {
    expect(read(route), route).toContain('TASK_KEYS_NOT_A_LIST');
  }
});

// ------------------------------------------------------- AC9: the two row tweaks

test('AC9 - Learn more sits beside the badge, not in the action row', () => {
  const client = read(CLIENT);
  const meta = client.slice(client.indexOf('DIY / PRO'), client.indexOf('Pro est.'));
  expect(meta).toContain('Learn more');
  expect(meta).toContain('/home-care/guides/');
});

test('AC9 - the hide control is an icon that still says what it does, and is undoable', () => {
  const client = read(CLIENT);
  expect(client).toContain('aria-label={`Not relevant - hide ${t.title}`}');
  expect(client).toContain('title="Not relevant - hide for me"');
  expect(client).toContain('dismissWithUndo');
  expect(client).toContain("data-testid=\"undo-hide\"");
  // The visual shrinks inside the button; the button keeps its tap target.
  expect(client).toMatch(/dismissWithUndo[\s\S]{0,700}h-7 w-7/);
});

// ------------------------------------------------- AC10/AC11/AC12: the rest

test('AC10 - all three tables are deny-by-default', () => {
  const sql = read(MIGRATION);
  for (const t of ['home_care_products', 'home_care_product_tasks', 'home_care_product_clicks']) {
    expect(sql, t).toContain(`ALTER TABLE public.${t}`);
  }
  expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(3);
  expect(sql).not.toContain('CREATE POLICY');
});

test('AC11 - the checklist read is fail-soft and issued once', () => {
  const shelfRead = read('src/lib/homecare/productShelf.ts');
  expect(shelfRead).toContain('return {};');
  expect(shelfRead).toContain('catch');
  // One request for every visible task, not one per task.
  expect(shelfRead).toContain('task_key=in.(');
  expect(read(PAGE)).toContain('readProductShelves(tasks)');
});

test('AC1 - the shelf read re-checks the DIY rule, and cannot be asked to skip it', () => {
  const shelfRead = read('src/lib/homecare/productShelf.ts');
  // Eligibility is applied to what the caller passed rather than looked up, so
  // it costs no query - and it is applied HERE rather than at each surface, so
  // no future member page can forget it.
  expect(shelfRead).toContain('isDiyEligible(t.diy_or_pro)');
  // The verdict travels with the key: there is no signature that takes bare
  // task keys, which is what makes the gate impossible to leave out.
  expect(shelfRead).not.toContain('readProductShelves(taskKeys: string[])');
  // And the page hands over the catalog rows it already read, not a key list.
  expect(read(PAGE)).not.toContain('readProductShelves(tasks.map');
});

test('AC12 - a click row has nowhere to put a person', () => {
  const sql = read(MIGRATION);
  const table = sql.slice(sql.indexOf('CREATE TABLE public.home_care_product_clicks'));
  const body = table.slice(0, table.indexOf(');'));
  for (const forbidden of ['homeowner_id', 'session', 'ip_address', 'email', 'user_id']) {
    expect(body, forbidden).not.toContain(forbidden);
  }
  expect(body).toContain('surface');
});

// ------------------------------------------------------------- small contracts

test('price bands are labelled, and nothing else is a band', () => {
  expect(priceBandLabel('under_25')).toBe('Under $25');
  expect(priceBandLabel('100_plus')).toBe('$100 and up');
  expect(priceBandLabel('cheap')).toBeNull();
  expect(priceBandLabel(null)).toBeNull();
  expect(isPriceBand('25_50')).toBe(true);
  expect(isPriceBand('25-50')).toBe(false);
  expect(isProductCategory('tool')).toBe(true);
  expect(isProductCategory('gadget')).toBe(false);
});

test('an image path with no storage host configured yields null, not a broken URL', () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(productImageUrl('B08XYZ1234/1-0.jpg')).toBeNull();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    expect(productImageUrl('B08XYZ1234/1-0.jpg'))
      .toBe('https://example.supabase.co/storage/v1/object/public/home-care-products/B08XYZ1234/1-0.jpg');
    expect(productImageUrl(null)).toBeNull();
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  }
});
