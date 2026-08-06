/**
 * PATCH  /api/admin/home-care/products/[id] -> edit a product, or move its shelves
 * DELETE /api/admin/home-care/products/[id] -> remove it from the library entirely
 *
 * THREE WAYS TO SAY SOMETHING ABOUT THE SHELVES, and only one of them at a time:
 *
 *  - `attach_task_key` / `detach_task_key` - one shelf, added or removed, with
 *    the rest left exactly as they are. These exist because the caller is a
 *    screen that may have been open for an hour: a client that restates the
 *    whole set from what it last loaded will silently strip the shelves another
 *    tab added in the meantime. "Also put it on this task" is the instruction
 *    the operator actually gives, so it is the instruction the route takes, and
 *    the current set stays the server's to know.
 *  - `task_keys` - REPLACES the set outright. Kept for the caller that genuinely
 *    means the whole list (the draft form, which composes one before the product
 *    exists), and for the reordering slice 2 adds.
 *
 * The eligibility check runs on all three: an edit is as good a way to attach a
 * pro task as a create. Every answer that touched the shelves carries the
 * resulting `task_keys`, so no caller has to infer them.
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
  attach_task_key?: unknown;
  detach_task_key?: unknown;
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
  const attachKey = typeof body.attach_task_key === 'string' ? body.attach_task_key.trim() : '';
  const detachKey = typeof body.detach_task_key === 'string' ? body.detach_task_key.trim() : '';

  // One instruction at a time. Two of them describe the same set from different
  // directions, and guessing an order to apply them in would be inventing a rule
  // no caller asked for.
  if ([taskKeys !== null, !!attachKey, !!detachKey].filter(Boolean).length > 1) {
    return NextResponse.json(
      { error: 'Say one thing about the shelves at a time.' },
      { status: 422 },
    );
  }

  const wantsEligible = attachKey ? [attachKey] : taskKeys ?? [];
  if (wantsEligible.length > 0) {
    const eligible = await eligibleTaskKeys();
    const refused = wantsEligible.filter((k) => !eligible.has(k));
    if (refused.length > 0) {
      return NextResponse.json(
        { error: `We only recommend gear for tasks a homeowner can do themselves. Not eligible: ${refused.join(', ')}.` },
        { status: 422 },
      );
    }
  }

  // True only inside the window the replacement path opens: the old rows are
  // gone and the new ones are not in yet. See the message it produces below.
  let shelvesEmptied = false;
  try {
    if (Object.keys(patch).length > 0) {
      await supabaseRest('PATCH', `home_care_products?id=eq.${encodeURIComponent(id)}`, patch);
    }

    if (attachKey) {
      await attachToShelf(id, attachKey);
    } else if (detachKey) {
      await supabaseRest(
        'DELETE',
        `home_care_product_tasks?product_id=eq.${encodeURIComponent(id)}&task_key=eq.${encodeURIComponent(detachKey)}`,
        undefined,
      );
    } else if (taskKeys) {
      // Replace rather than diff: the set is at most a handful of rows, so
      // working out which to add and which to drop costs more than restating it.
      //
      // It is NOT atomic, and the honest version of that is worth writing down:
      // PostgREST has no transaction across two requests, so a failure or a
      // teardown between the DELETE and the POST leaves the product on NO
      // shelves. Rare, and silent unless it is said out loud - which is what
      // `shelvesEmptied` is for. The additive operations above exist partly
      // because they never open this window at all.
      await supabaseRest('DELETE', `home_care_product_tasks?product_id=eq.${encodeURIComponent(id)}`, undefined);
      if (taskKeys.length > 0) {
        shelvesEmptied = true;
        await supabaseRest('POST', 'home_care_product_tasks',
          taskKeys.map((task_key, i) => ({ product_id: id, task_key, sort_order: i })));
        shelvesEmptied = false;
      }
    }

    if (attachKey || detachKey || taskKeys) {
      const current = await currentTaskKeys(id);
      return NextResponse.json(current ? { ok: true, task_keys: current } : { ok: true });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      {
        error: shelvesEmptied
          ? 'Saved, but the shelves may not have moved - open the product again and check which items it is on.'
          : 'Could not save the product.',
      },
      { status: 500 },
    );
  }
}

/**
 * Put a product on one more shelf, leaving every other shelf alone.
 *
 * Appended at the END of that task's shelf rather than at sort_order 0, so
 * stocking one more pick does not silently re-order the ones the owner already
 * arranged. Already-there is a no-op instead of a primary-key violation: an
 * operator pressing Add twice means the same thing both times.
 */
async function attachToShelf(id: string, taskKey: string): Promise<void> {
  const rows = await supabaseRest<Array<{ product_id: string; sort_order: number }>>(
    'GET',
    `home_care_product_tasks?select=product_id,sort_order&task_key=eq.${encodeURIComponent(taskKey)}`,
  ) ?? [];
  if (rows.some((r) => r.product_id === id)) return;
  const sortOrder = rows.reduce((max, r) => Math.max(max, r.sort_order), -1) + 1;
  await supabaseRest('POST', 'home_care_product_tasks', [
    { product_id: id, task_key: taskKey, sort_order: sortOrder },
  ]);
}

/**
 * The shelves this product is on now, or null if we could not ask.
 *
 * Answered back to the caller so the admin screen never has to compute a set it
 * may hold a stale copy of. Fail-soft on purpose: the write has already landed
 * by the time this runs, and reporting it as a failure because the read-back
 * failed would be the wrong sentence entirely.
 */
async function currentTaskKeys(id: string): Promise<string[] | null> {
  try {
    const rows = await supabaseRest<Array<{ task_key: string }>>(
      'GET', `home_care_product_tasks?select=task_key&product_id=eq.${encodeURIComponent(id)}`,
    );
    return (rows ?? []).map((r) => r.task_key);
  } catch {
    return null;
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
