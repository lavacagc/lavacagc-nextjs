/**
 * PATCH  /api/admin/home-care/products/[id] -> edit a product, or move its shelves
 * DELETE /api/admin/home-care/products/[id] -> remove it from the library entirely
 *
 * `task_keys`, when present, REPLACES the set of shelves this product sits on.
 * That is what makes "also show on these items" and "remove from this task" the
 * same operation, and it is why the eligibility check runs here too: an edit is
 * as good a way to attach a pro task as a create.
 *
 * Deleting cascades to the join rows and the click rows by foreign key. A
 * product the owner takes out of the library leaves no orphan shelf entry behind
 * that a later reader would have to defend against.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { eligibleTaskKeys, normalizeTaskKeys } from '@/lib/homecare/productAdmin';
import { isPriceBand, isProductCategory } from '@/lib/homecare/products';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME = 120;
const MAX_PITCH = 240;

interface PatchBody {
  display_name?: unknown;
  brand?: unknown;
  pitch?: unknown;
  images?: unknown;
  image_source?: unknown;
  price_band?: unknown;
  category?: unknown;
  active?: unknown;
  task_keys?: unknown;
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Unknown product.' }, { status: 404 });

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.display_name === 'string') {
    const name = body.display_name.trim().slice(0, MAX_NAME);
    if (!name) return NextResponse.json({ error: 'The display name cannot be empty.' }, { status: 422 });
    patch.display_name = name;
  }
  if (typeof body.brand === 'string') patch.brand = body.brand.trim().slice(0, MAX_NAME) || null;
  if (typeof body.pitch === 'string') patch.pitch = body.pitch.trim().slice(0, MAX_PITCH) || null;
  if (body.price_band !== undefined) {
    if (!isPriceBand(body.price_band)) return NextResponse.json({ error: 'Pick a price band.' }, { status: 422 });
    patch.price_band = body.price_band;
  }
  if (body.category !== undefined) patch.category = isProductCategory(body.category) ? body.category : null;
  if (body.image_source !== undefined) patch.image_source = typeof body.image_source === 'string' ? body.image_source : null;
  if (Array.isArray(body.images)) {
    patch.images = body.images.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  }
  if (typeof body.active === 'boolean') patch.active = body.active;

  // Activation needs a picture, and the images may be arriving in this same
  // request - so the check reads the incoming array when there is one and the
  // stored row otherwise. Doing it here rather than leaving it to the CHECK
  // constraint is what turns "violates home_care_products_active_needs_image"
  // into a sentence about photos.
  if (patch.active === true) {
    const incoming = Array.isArray(patch.images) ? (patch.images as string[]) : null;
    if (incoming ? incoming.length === 0 : await hasNoStoredImage(id)) {
      return NextResponse.json({ error: 'A live product needs at least one photo.' }, { status: 422 });
    }
  }

  const taskKeys = body.task_keys !== undefined ? normalizeTaskKeys(body.task_keys) : null;
  if (taskKeys && taskKeys.length > 0) {
    const eligible = await eligibleTaskKeys();
    const refused = taskKeys.filter((k) => !eligible.has(k));
    if (refused.length > 0) {
      return NextResponse.json(
        { error: `We only recommend gear for tasks a homeowner can do themselves. Not eligible: ${refused.join(', ')}.` },
        { status: 422 },
      );
    }
  }

  try {
    if (Object.keys(patch).length > 0) {
      await supabaseRest('PATCH', `home_care_products?id=eq.${encodeURIComponent(id)}`, patch);
    }
    if (taskKeys) {
      // Replace rather than diff: the set is at most a handful of rows, and a
      // delete-then-insert cannot leave the shelves half-moved the way an
      // interrupted diff can.
      await supabaseRest('DELETE', `home_care_product_tasks?product_id=eq.${encodeURIComponent(id)}`, undefined);
      if (taskKeys.length > 0) {
        await supabaseRest('POST', 'home_care_product_tasks',
          taskKeys.map((task_key, i) => ({ product_id: id, task_key, sort_order: i })));
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Could not save the product.' }, { status: 500 });
  }
}

async function hasNoStoredImage(id: string): Promise<boolean> {
  try {
    const rows = await supabaseRest<Array<{ images: unknown }>>(
      'GET', `home_care_products?select=images&id=eq.${encodeURIComponent(id)}&limit=1`,
    );
    const images = rows?.[0]?.images;
    return !Array.isArray(images) || images.length === 0;
  } catch {
    // Unknown rather than empty. Refusing to activate on a read failure is the
    // fail-closed side: the worst case is the owner presses the toggle again.
    return true;
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Unknown product.' }, { status: 404 });
  try {
    await supabaseRest('DELETE', `home_care_products?id=eq.${encodeURIComponent(id)}`, undefined);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Could not remove the product.' }, { status: 500 });
  }
}
