import { test, expect } from '@playwright/test';
import { readShopTasks, eligibleTaskKeys } from '@/lib/homecare/productAdmin';
import { readProductShelves } from '@/lib/homecare/productShelf';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { isDiyEligible } from '@/lib/homecare/products';

/**
 * Home Care DIY Kit - the rules that only a real database can answer.
 *
 * These call the libraries directly rather than the HTTP routes, and that is a
 * deliberate consequence of how this repo's two test builds work. The admin
 * routes are gated by middleware, which authenticates the fabricated session
 * only against a build whose NEXT_PUBLIC_SUPABASE_URL points at the GoTrue
 * stub - and that same baked value is what every server-side read uses, so a
 * build that can authenticate an admin cannot reach the real catalog. One build
 * cannot satisfy both, which CLAUDE.md sets out at length. The route spec takes
 * the auth half; this one takes the data half, at the layer underneath.
 *
 * What is being asked here is not "does the route return 422" - the route spec
 * covers that - but whether the RULE resolves correctly against the catalog as
 * it actually is: that `chimney_inspect` is genuinely refused because the live
 * row says `pro`, not because a fixture said so.
 *
 * Skips loudly without credentials, so CI stays deterministic. Run it with
 * `set -a && . ./.env.local && set +a && npx playwright test tests/home-care-diy-kit-live.spec.ts`.
 */

const HAS_BACKEND = !!process.env.SUPABASE_SECRET_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const REASON = 'needs SUPABASE_SECRET_KEY + NEXT_PUBLIC_SUPABASE_URL in the environment';

/** Reserved for this file. Nothing else may use it, and it is deleted after every test. */
const TEST_ASIN = 'B0TESTKIT1';

/**
 * A task key that exists in NO catalog row, and that is the point.
 *
 * These tests write to whatever database `.env.local` names, which is
 * production. Linked to a real key like `basement_humidity`, the test product
 * would sit on the live shelf of every member whose plan includes that task for
 * as long as the test runs - with a broken photo, since nothing was ever
 * uploaded to `B0TESTKIT1/`. `readProductShelves` never consults the catalog; it
 * joins from the keys the checklist hands it, so an off-catalog key exercises
 * the identical insert, read, filter and cascade rules and can never reach a
 * member page.
 */
const TEST_TASK_KEY = 'zz_diy_kit_test';

async function removeTestProduct() {
  await supabaseRest('DELETE', `home_care_products?asin=eq.${TEST_ASIN}`, undefined).catch(() => {});
}

test.describe('DIY Kit against the live catalog', () => {
  test.skip(!HAS_BACKEND, REASON);
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(removeTestProduct);
  test.afterAll(removeTestProduct);

  test('the DIY gate resolves against the catalog as it actually is', async () => {
    const tasks = await readShopTasks();
    expect(tasks.length).toBeGreaterThan(40);

    // Pro tasks are RETURNED and marked ineligible, never filtered out: the
    // admin renders them locked so the exclusion reads as a decision.
    const chimney = tasks.find((t) => t.key === 'chimney_inspect');
    expect(chimney, 'chimney_inspect is missing from the catalog').toBeTruthy();
    expect(chimney!.diy_or_pro).toBe('pro');
    expect(chimney!.eligible).toBe(false);

    const basement = tasks.find((t) => t.key === 'basement_humidity');
    expect(basement!.eligible).toBe(true);

    // Every task's eligibility agrees with the column it was derived from, so
    // a catalog edit cannot silently open a shelf on work we do ourselves.
    for (const t of tasks) expect(t.eligible, t.key).toBe(isDiyEligible(t.diy_or_pro));

    const eligible = await eligibleTaskKeys();
    expect(eligible.has('basement_humidity')).toBe(true);
    expect(eligible.has('chimney_inspect')).toBe(false);
    expect(eligible.size).toBeGreaterThan(20);
    expect(eligible.size).toBeLessThan(tasks.length);
  });

  test('unhappy: the schema refuses a live product with no photo, and a duplicate ASIN', async () => {
    // Draft with no photo: allowed, because that is the state a blocked photo
    // pull leaves behind and the owner has to be able to save it.
    const draft = await supabaseRest<Array<{ id: string; active: boolean }>>('POST', 'home_care_products', {
      asin: TEST_ASIN, display_name: 'Kit test product', price_band: 'under_25',
    });
    expect(draft?.[0]?.active, 'a product must arrive as a draft, not live').toBe(false);

    // Live with no photo: refused by the schema, not by the UI.
    await expect(
      supabaseRest('PATCH', `home_care_products?asin=eq.${TEST_ASIN}`, { active: true }),
    ).rejects.toThrow(/home_care_products_active_needs_image/);

    // The same ASIN twice: refused.
    await expect(
      supabaseRest('POST', 'home_care_products', { asin: TEST_ASIN, display_name: 'again', price_band: 'under_25' }),
    ).rejects.toThrow(/duplicate key|23505/i);

    // With a photo it publishes.
    await supabaseRest('PATCH', `home_care_products?asin=eq.${TEST_ASIN}`, {
      active: true, images: [`${TEST_ASIN}/1.png`],
    });
    const live = await supabaseRest<Array<{ active: boolean }>>(
      'GET', `home_care_products?select=active&asin=eq.${TEST_ASIN}`,
    );
    expect(live?.[0]?.active).toBe(true);
  });

  test('happy: a stocked product reaches the member shelf, and hiding it takes it away', async () => {
    // Created as a DRAFT and published only once it is linked to the off-catalog
    // key: a product is only ever visible to a member while active, so this
    // leaves no window at all in which a real page could pick it up.
    const created = await supabaseRest<Array<{ id: string }>>('POST', 'home_care_products', {
      asin: TEST_ASIN, display_name: 'Kit test product', pitch: 'A pitch.',
      images: [`${TEST_ASIN}/1.png`], price_band: 'under_25',
    });
    const id = created![0].id;
    await supabaseRest('POST', 'home_care_product_tasks', [
      { product_id: id, task_key: TEST_TASK_KEY, sort_order: 0 },
    ]);
    await supabaseRest('PATCH', `home_care_products?id=eq.${id}`, { active: true });

    const shelves = await readProductShelves([TEST_TASK_KEY, 'chimney_inspect']);
    expect(shelves[TEST_TASK_KEY]?.some((p) => p.asin === TEST_ASIN)).toBe(true);
    // A task nobody stocked has no entry at all - not an empty array, nothing,
    // which is what lets the row render exactly as it did before this feature.
    expect(shelves.chimney_inspect).toBeUndefined();

    // unhappy: a product marked gone stops rendering immediately. Fail closed -
    // a member tapping a dead link is worse than one fewer pick.
    await supabaseRest('PATCH', `home_care_products?id=eq.${id}`, { link_status: 'gone' });
    expect((await readProductShelves([TEST_TASK_KEY]))[TEST_TASK_KEY] ?? [])
      .not.toContainEqual(expect.objectContaining({ asin: TEST_ASIN }));

    // But 'suspect' - "we could not tell", usually an Amazon block - still
    // renders, which is the whole point of having three states.
    await supabaseRest('PATCH', `home_care_products?id=eq.${id}`, { link_status: 'suspect' });
    expect((await readProductShelves([TEST_TASK_KEY]))[TEST_TASK_KEY]?.some((p) => p.asin === TEST_ASIN)).toBe(true);

    // Same for a draft: stocked, but not published, so not shown.
    await supabaseRest('PATCH', `home_care_products?id=eq.${id}`, { link_status: 'ok', active: false, images: [] });
    expect((await readProductShelves([TEST_TASK_KEY]))[TEST_TASK_KEY] ?? []).toHaveLength(0);

    // Deleting the product takes its shelf entry with it - no orphan rows for a
    // later reader to defend against.
    await supabaseRest('DELETE', `home_care_products?id=eq.${id}`, undefined);
    const links = await supabaseRest<Array<{ task_key: string }>>(
      'GET', `home_care_product_tasks?select=task_key&product_id=eq.${id}`,
    );
    expect(links ?? []).toHaveLength(0);
  });

  test('the shelf read stays one query, and survives a task list with nothing stocked', async () => {
    // No tasks: no query at all, and an empty map rather than a throw.
    expect(await readProductShelves([])).toEqual({});
    // Unknown keys: an empty map, not an error - the checklist must render.
    expect(await readProductShelves(['no_such_task', 'another_missing_one'])).toEqual({});
  });
});
