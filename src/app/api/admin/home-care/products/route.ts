/**
 * GET  /api/admin/home-care/products -> everything the shop screen renders
 * POST /api/admin/home-care/products -> stock a new product
 *
 * The GET answers with BOTH the catalog and the library in one request, because
 * the screen is task-first (owner decision D4): it opens on the list of
 * maintenance tasks with their item counts, and a second round trip to find out
 * how many items each task has would show the operator an empty list first.
 *
 * Middleware gates /api/admin/*. What this route enforces is the data rule
 * nothing else can: a product may only be linked to a task the catalog marks
 * `diy` or `either`. The UI renders pro tasks locked; this is what makes that
 * true rather than merely displayed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, isMissingTableError } from '@/lib/notify/supabase-rest';
import {
  readShopTasks, refuseIneligible, normalizeTaskKeys, TASK_KEYS_NOT_A_LIST,
} from '@/lib/homecare/productAdmin';
import { isPriceBand, isProductCategory, isImageSource, type AdminProduct } from '@/lib/homecare/products';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ASIN_RE = /^[A-Z0-9]{10}$/;
const MAX_NAME = 120;
const MAX_PITCH = 240;

interface ProductRow {
  id: string;
  asin: string;
  display_name: string;
  brand: string | null;
  pitch: string | null;
  images: unknown;
  image_source: string | null;
  category: string | null;
  active: boolean;
  link_status: string;
  checked_at: string | null;
}

function toAdminProduct(row: ProductRow, taskKeys: string[]): AdminProduct {
  return {
    id: row.id,
    asin: row.asin,
    display_name: row.display_name,
    brand: row.brand,
    pitch: row.pitch,
    images: Array.isArray(row.images) ? row.images.filter((v): v is string => typeof v === 'string') : [],
    image_source: row.image_source,
    category: row.category as AdminProduct['category'],
    active: row.active,
    link_status: row.link_status as AdminProduct['link_status'],
    checked_at: row.checked_at,
    task_keys: taskKeys,
  };
}

export async function GET() {
  try {
    const [tasks, products, links] = await Promise.all([
      readShopTasks(),
      supabaseRest<ProductRow[]>(
        'GET',
        'home_care_products?select=id,asin,display_name,brand,pitch,images,image_source,category,active,link_status,checked_at&order=created_at.desc',
      ),
      supabaseRest<Array<{ product_id: string; task_key: string; sort_order: number }>>(
        'GET',
        'home_care_product_tasks?select=product_id,task_key,sort_order&order=sort_order.asc',
      ),
    ]);

    const byProduct = new Map<string, string[]>();
    const counts: Record<string, number> = {};
    for (const link of links ?? []) {
      const existing = byProduct.get(link.product_id);
      if (existing) existing.push(link.task_key);
      else byProduct.set(link.product_id, [link.task_key]);
      counts[link.task_key] = (counts[link.task_key] ?? 0) + 1;
    }

    return NextResponse.json({
      tasks: tasks.map((t) => ({ ...t, product_count: counts[t.key] ?? 0 })),
      products: (products ?? []).map((p) => toAdminProduct(p, byProduct.get(p.id) ?? [])),
    });
  } catch (err) {
    // The shop tables are applied by hand like every other Home Care migration,
    // so "not created yet" is a state the operator will genuinely meet. Say so
    // in words rather than showing them a PostgREST error - but through the
    // shared helper, whose whole point is that this test stays narrow. A local
    // `/404/` would match any error text carrying those three digits and send
    // the operator off to re-apply a migration that is already there.
    const missing = isMissingTableError(err);
    return NextResponse.json(
      { error: missing ? 'The Home Care Shop tables are not in this database yet. Apply the migration first.' : 'Could not load the shop.' },
      { status: missing ? 503 : 500 },
    );
  }
}

interface CreateBody {
  asin?: unknown;
  display_name?: unknown;
  brand?: unknown;
  pitch?: unknown;
  images?: unknown;
  image_source?: unknown;
  price_band?: unknown;
  category?: unknown;
  task_keys?: unknown;
  active?: unknown;
}

export async function POST(request: NextRequest) {
  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const asin = typeof body.asin === 'string' ? body.asin.trim().toUpperCase() : '';
  if (!ASIN_RE.test(asin)) return NextResponse.json({ error: 'That ASIN is not a valid Amazon identifier.' }, { status: 422 });

  const displayName = typeof body.display_name === 'string' ? body.display_name.trim().slice(0, MAX_NAME) : '';
  if (!displayName) return NextResponse.json({ error: 'Give the product a short display name.' }, { status: 422 });

  // Retired (owner, 2026-08-06): no form offers a band, so absent is the normal
  // case and null is the honest record of it. A band that DOES arrive is still
  // held to the vocabulary rather than silently dropped, so a backfill cannot
  // quietly write nonsense into a column the schema still constrains.
  if (body.price_band !== undefined && body.price_band !== null && !isPriceBand(body.price_band)) {
    return NextResponse.json({ error: 'That is not a price band we recognize.' }, { status: 422 });
  }

  const images = Array.isArray(body.images)
    ? body.images.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : [];
  // Explicit only, matching the column default. Curation is manual (D5), so
  // "live" is something a caller asks for and never something it gets for
  // omitting a field.
  const active = body.active === true;
  // The schema forbids this too, but a CHECK violation reaches the operator as a
  // constraint name. This is the same rule said in words they can act on.
  if (active && images.length === 0) {
    return NextResponse.json({ error: 'A live product needs at least one photo. Add one, or save it as a draft.' }, { status: 422 });
  }

  // Absent is fine - most drafts have no photo yet. A value the column's CHECK
  // does not know is not, and it is refused here for the same reason the band
  // and the category are: the alternative is a 500 carrying a constraint name.
  const imageSource = body.image_source === undefined || body.image_source === null ? null : body.image_source;
  if (imageSource !== null && !isImageSource(imageSource)) {
    return NextResponse.json({ error: 'Photos have to come from the listing, an upload, or the Amazon API.' }, { status: 422 });
  }

  const taskKeys = body.task_keys === undefined ? [] : normalizeTaskKeys(body.task_keys);
  if (taskKeys === null) return NextResponse.json({ error: TASK_KEYS_NOT_A_LIST }, { status: 422 });
  const refusal = await refuseIneligible(taskKeys);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 422 });

  // The id of the row once it exists, and the whole reason the catch below has
  // two answers. A create is TWO PostgREST requests with no transaction across
  // them, so the shelf insert can fail with the product already stored - and
  // "Could not save the product." is then a lie the operator acts on: they press
  // Add again and meet a 409 about a product they were just told did not save.
  let createdId: string | null = null;
  try {
    const created = await supabaseRest<Array<{ id: string }>>('POST', 'home_care_products', {
      asin,
      display_name: displayName,
      brand: typeof body.brand === 'string' ? body.brand.trim().slice(0, MAX_NAME) || null : null,
      pitch: typeof body.pitch === 'string' ? body.pitch.trim().slice(0, MAX_PITCH) || null : null,
      images,
      image_source: imageSource,
      price_band: isPriceBand(body.price_band) ? body.price_band : null,
      category: isProductCategory(body.category) ? body.category : null,
      active,
    });
    const id = created?.[0]?.id;
    if (!id) return NextResponse.json({ error: 'The product was not created.' }, { status: 500 });
    createdId = id;

    if (taskKeys.length > 0) {
      await supabaseRest('POST', 'home_care_product_tasks',
        taskKeys.map((task_key, i) => ({ product_id: id, task_key, sort_order: i })));
    }
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    // The product landed and only its shelves did not. Answering 201 with the
    // truth beside it is what makes the next move obvious - open it and put it
    // on the item - instead of sending the operator back through a create that
    // cannot succeed.
    if (createdId) {
      return NextResponse.json(
        {
          id: createdId,
          warning: 'Saved, but it may not be on the shelf yet - open the product and check which items it is on.',
        },
        { status: 201 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/duplicate key|already exists|23505/i.test(message)) {
      return NextResponse.json({ error: 'That product is already in your library.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Could not save the product.' }, { status: 500 });
  }
}
