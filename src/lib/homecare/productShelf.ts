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
 * ONE query for every visible task, not one per task. The checklist page issues
 * it inside the Promise.all it already runs, so the whole feature costs one
 * round trip on a page every member loads.
 */
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { isRenderable, type HomeCareProduct, type PriceBand, type LinkStatus } from '@/lib/homecare/products';

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

export async function readProductShelves(taskKeys: string[]): Promise<ProductShelves> {
  const keys = Array.from(new Set(taskKeys.filter((k) => typeof k === 'string' && k.length > 0)));
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
