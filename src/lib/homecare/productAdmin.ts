/**
 * Server-only helpers the DIY Kit admin routes share.
 *
 * Two things live here because they are rules about the DATA rather than about
 * one route: which maintenance tasks may carry a shelf, and where a product
 * photo is stored. Both are enforced again on the server even though the admin
 * UI already respects them - the UI refusing to offer a pro task is a courtesy,
 * and a crafted POST is not obliged to be courteous.
 */
import { createClient } from '@supabase/supabase-js';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { isDiyEligible, PRODUCT_IMAGE_BUCKET } from '@/lib/homecare/products';
import type { FetchedImage } from '@/lib/homecare/amazonListing';

/** A catalog task as the admin shop screen lists it. */
export interface ShopTask {
  key: string;
  title: string;
  diy_or_pro: string;
  seasons: string[];
  frequency: string;
  /** May this task be stocked at all? False for `pro`, which the UI renders locked. */
  eligible: boolean;
}

/**
 * The active catalog, in the order the checklist shows it.
 *
 * Pro tasks are RETURNED, not filtered out. The owner's decision (D5) is that
 * they appear locked rather than absent, so the exclusion reads as deliberate
 * instead of looking like a task that went missing.
 */
export async function readShopTasks(): Promise<ShopTask[]> {
  const rows = await supabaseRest<Array<{
    key: string; title: string; diy_or_pro: string; seasons: string[] | null; frequency: string | null; priority: number;
  }>>(
    'GET',
    'maintenance_catalog?select=key,title,diy_or_pro,seasons,frequency,priority&active=eq.true&order=priority.desc',
  );
  return (rows ?? []).map((r) => ({
    key: r.key,
    title: r.title,
    diy_or_pro: r.diy_or_pro,
    seasons: r.seasons ?? [],
    frequency: r.frequency ?? '',
    eligible: isDiyEligible(r.diy_or_pro),
  }));
}

/**
 * The task keys a product may legally be linked to.
 *
 * Derived from the catalog on every write rather than cached: the catalog is
 * edited as data, and a stale allow-list would either block a task the owner has
 * just made DIY or, worse, keep allowing one they have just handed to the crew.
 */
export async function eligibleTaskKeys(): Promise<Set<string>> {
  const tasks = await readShopTasks();
  return new Set(tasks.filter((t) => t.eligible).map((t) => t.key));
}

/**
 * The sentence to refuse a write with, or null when every key may carry a shelf.
 *
 * The check AND the sentence live together here, for the reason
 * `TASK_KEYS_NOT_A_LIST` does: every path that can put a product onto a task -
 * create, edit, attach, and slice 2's reorder - is asking the same question and
 * has to answer it in the same words. Two copies of a rule this close to the
 * owner's "we do this one ourselves" line is two places for it to drift.
 */
export async function refuseIneligible(keys: string[]): Promise<string | null> {
  if (keys.length === 0) return null;
  const eligible = await eligibleTaskKeys();
  const refused = keys.filter((k) => !eligible.has(k));
  if (refused.length === 0) return null;
  return `We only recommend gear for tasks a homeowner can do themselves. Not eligible: ${refused.join(', ')}.`;
}

/**
 * The task keys a write actually means, de-duplicated and trimmed, or NULL when
 * the caller did not send a list at all.
 *
 * Shared by the create and the update path so "which shelves is this on" is
 * normalized once. A duplicate key in the request would otherwise hit the join
 * table's primary key and fail a whole save over what is plainly the same
 * instruction said twice.
 *
 * THE NULL IS THE POINT. An empty list is a real instruction - "take it off
 * every shelf" - and `task_keys: null`, a string, or an object are a client bug.
 * Folding those together into `[]` made the bug indistinguishable from the
 * instruction, so a PATCH carrying `task_keys: null` (the natural way to say
 * "unchanged") silently deleted every shelf the product was on and answered 200.
 * The two answers are separated here rather than at each call site so no future
 * caller can fall into it: a `null` from this function has to be handled, and
 * `TASK_KEYS_NOT_A_LIST` is the sentence to handle it with.
 */
export function normalizeTaskKeys(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return Array.from(new Set(
    value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim()),
  ));
}

/** What to tell a caller that sent a `task_keys` which is not a list. */
export const TASK_KEYS_NOT_A_LIST =
  'task_keys has to be a list of maintenance items. Send an empty list to take the product off every shelf.';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase service credentials not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Store one product image and return its path inside the bucket.
 *
 * Pathed by ASIN so a product's photos stay together and a re-parse of the same
 * listing does not collide with the previous attempt: the timestamp and index
 * make each upload its own object rather than overwriting one that a live shelf
 * may still be pointing at.
 */
export async function storeProductImage(
  asin: string,
  index: number,
  image: FetchedImage,
  stamp: number,
): Promise<string | null> {
  try {
    const path = `${asin}/${stamp}-${index}.${image.extension}`;
    const { error } = await serviceClient()
      .storage.from(PRODUCT_IMAGE_BUCKET)
      .upload(path, image.bytes, { contentType: image.contentType, upsert: false });
    if (error) return null;
    return path;
  } catch {
    return null;
  }
}

/** Store an operator-supplied file (the manual fallback when the fetch is blocked). */
export async function storeUploadedImage(asin: string, file: File, stamp: number): Promise<string | null> {
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
  if (!extension) return null;
  try {
    const path = `${asin}/${stamp}-upload.${extension}`;
    const { error } = await serviceClient()
      .storage.from(PRODUCT_IMAGE_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) return null;
    return path;
  } catch {
    return null;
  }
}
