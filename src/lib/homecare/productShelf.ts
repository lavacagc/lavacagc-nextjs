/**
 * Server-only read of the DIY Kit shelves for a set of maintenance tasks.
 *
 * Its own module rather than part of products.ts, for the reason homeRecords.ts
 * is separate from records.ts: products.ts is imported by the 'use client'
 * checklist component, so it must stay free of the service-role supabaseRest
 * import.
 *
 * FAIL-SOFT, like readHomeRecords. home_care_products is created by migration
 * and applied to the real database by hand, so on any environment where that has
 * not happened yet - a Supabase Preview branch, a restored copy, production
 * before go-live - this returns an empty map and the checklist renders exactly
 * as it does today. A shelf is an enhancement; the member's plan is the page.
 *
 * ONE query for every visible task, not one per task. It is an EXTRA round trip
 * on a page every member loads, and a SEQUENTIAL one - it cannot join the
 * Promise.all the checklist page already runs, because the keys it is handed are
 * the profile-filtered catalog and that filter is one of the things that batch
 * resolves. Fetching shelves for work that is not on the member's plan would
 * make it parallelisable and is not worth it: this is a small indexed read
 * against a small table, and the alternative reads rows for tasks the page will
 * throw away.
 */
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { isDiyEligible, isRenderable, type HomeCareProduct, type PriceBand, type LinkStatus } from '@/lib/homecare/products';

/** The join row as PostgREST returns it with the product embedded. */
interface ShelfRow {
  task_key: string;
  sort_order: number;
  home_care_products: {
    id: string;
    asin: string;
    display_name: string;
    brand: string | null;
    pitch: string | null;
    images: unknown;
    price_band: string;
    category: string | null;
    active: boolean;
    link_status: string;
  } | null;
}

/** Shelves keyed by task_key, each already ordered and filtered to what may render. */
export type ProductShelves = Record<string, HomeCareProduct[]>;

/**
 * A task as this read has to be asked about it: the key, and the catalog's own
 * DIY verdict for it.
 *
 * The verdict is part of the ARGUMENT rather than something re-fetched here, and
 * that is the whole shape of the eligibility rule at render time. `diy_or_pro`
 * is edited as data: a task stocked while it was `either` keeps its join rows
 * after the owner hands the work to the crew, so a read that trusts the join
 * table alone will keep offering a member the gear for work we have just
 * declared pro-only. Taking the verdict here means the rule is re-checked on
 * every render, and taking it as a required field of the task means a caller
 * cannot ask for a shelf without saying which side of that line the task is on.
 * Every member surface already has it in hand - the checklist page reads
 * `maintenance_catalog` before it calls this - so it costs no extra query.
 */
export interface ShelfTask {
  key: string;
  diy_or_pro?: string | null;
}

/**
 * A stored `images` value, defensively.
 *
 * The column is CHECKed as a jsonb array, but its ELEMENTS are not constrained -
 * jsonb has no element type - so a bad writer could land `[null, 42]` and the
 * card would render a broken frame. Filtering here rather than trusting the
 * column is the same instinct as the registry filter on home records: the
 * chokepoint every reader passes through is the cheapest place to be strict.
 */
function imagePaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

export async function readProductShelves(tasks: ReadonlyArray<ShelfTask>): Promise<ProductShelves> {
  // Ineligible tasks are dropped before the query rather than after it: a task
  // the catalog now calls `pro` is not a shelf we filter out of the answer, it
  // is a shelf we never ask about.
  const keys = Array.from(new Set(
    (tasks ?? [])
      .filter((t) => t && typeof t.key === 'string' && t.key.length > 0 && isDiyEligible(t.diy_or_pro))
      .map((t) => t.key),
  ));
  if (keys.length === 0 || !process.env.SUPABASE_SECRET_KEY) return {};

  try {
    // PostgREST embeds the product through the foreign key, so this is one
    // request rather than a list of ids followed by a second one.
    const inList = keys.map((k) => `"${k.replace(/"/g, '')}"`).join(',');
    const rows = await supabaseRest<ShelfRow[]>(
      'GET',
      `home_care_product_tasks?select=task_key,sort_order,home_care_products(id,asin,display_name,brand,pitch,images,price_band,category,active,link_status)`
        + `&task_key=in.(${encodeURIComponent(inList)})&order=sort_order.asc`,
    );

    const shelves: ProductShelves = {};
    for (const row of rows ?? []) {
      const p = row.home_care_products;
      if (!p) continue;
      const product: HomeCareProduct = {
        id: p.id,
        asin: p.asin,
        display_name: p.display_name,
        brand: p.brand,
        pitch: p.pitch,
        images: imagePaths(p.images),
        price_band: p.price_band as PriceBand,
        category: (p.category ?? null) as HomeCareProduct['category'],
        active: p.active,
        link_status: p.link_status as LinkStatus,
      };
      // Fail-closed on anything the member should not tap: inactive, known-dead,
      // or pictureless. The last one cannot happen while it is active (the
      // schema forbids it) but reads that way here so the rule survives a
      // future writer who relaxes the constraint.
      if (!isRenderable(product)) continue;
      (shelves[row.task_key] ??= []).push(product);
    }
    return shelves;
  } catch {
    // Missing table pre-go-live, or any transient Supabase error. The checklist
    // must still render, just without shelves. Never throws.
    return {};
  }
}
