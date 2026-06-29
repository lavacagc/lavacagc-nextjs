import { NextResponse } from 'next/server';
import {
  NormalizedListingSchema,
  deriveSlug,
  RENDERING_SECTIONS,
  type NormalizedListing,
  type BeforePhoto,
  type RenderingSection,
} from '@/lib/listings/columns';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const ALLOWED_SECTIONS = new Set<string>(RENDERING_SECTIONS.map((r) => r.section));

/**
 * Bulk import for "Buy + Remodel" listings.
 *
 * Flow (modeled on /api/leads/submit conventions):
 *   body-size cap -> JSON parse -> per-row Zod safeParse -> derive slug ->
 *   best-effort re-host photos into the `listings` storage bucket ->
 *   upsert valid rows via supabaseRest (on_conflict=slug).
 *
 * The route is session-protected by middleware (the `/api/admin/` prefix).
 * Writes use SUPABASE_SECRET_KEY (bypasses RLS), like the leads route.
 *
 * Invalid rows are skipped (reported in `errors`); photo failures are
 * non-fatal (reported in `warnings`) so one dead URL never blocks an import.
 */
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';
const BUCKET = 'listings';

const MAX_BODY_BYTES = 2_000_000; // ~2MB of normalized JSON rows
const MAX_ROWS = 500;
const PHOTO_FETCH_TIMEOUT_MS = 8000;
const MAX_PHOTO_BYTES = 10_000_000; // 10MB/image
const PHOTO_CONCURRENCY = 4;

interface ImportError {
  row: number; // 1-based row number as seen by the user
  reason: string;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/** Fetch one external image and upload it to the listings bucket at <objectPathNoExt>.<ext>; returns the public URL. */
async function rehostImage(url: string, objectPathNoExt: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(PHOTO_FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`source returned ${res.status}`);

  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!contentType.startsWith('image/')) throw new Error(`not an image (${contentType || 'unknown'})`);

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_PHOTO_BYTES) throw new Error('image too large');

  const ext = EXT_BY_TYPE[contentType] || 'jpg';
  const objectPath = `${objectPathNoExt}.${ext}`;
  const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: buf,
    signal: AbortSignal.timeout(PHOTO_FETCH_TIMEOUT_MS),
  });
  if (!upload.ok) {
    const text = await upload.text().catch(() => '');
    throw new Error(`storage upload failed: ${upload.status} ${text}`.trim());
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

const rehostPhoto = (slug: string, index: number, url: string) => rehostImage(url, `${slug}/${index}`);

/** Run async tasks with bounded concurrency, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function POST(request: Request) {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  // Body-size cap.
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  // JSON parse guard.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const rows = (parsed as { rows?: unknown })?.rows;
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: 'No rows to import' }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS})` }, { status: 413 });
  }

  // Rate limit (lenient — authenticated admin route).
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`listings-import:${ip}`, 20, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many imports, slow down' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    );
  }

  const errors: ImportError[] = [];
  const warnings: ImportError[] = [];

  // 1) Validate + derive slug for each row. Each item is { listing, before_photos };
  //    older callers may send the bare listing object — tolerate both.
  const valid: { slug: string; data: NormalizedListing; beforePhotos: BeforePhoto[] }[] = [];
  rows.forEach((rowInput, idx) => {
    const rowNum = idx + 1;
    const item = (rowInput && typeof rowInput === 'object' && 'listing' in (rowInput as object)
      ? (rowInput as { listing: unknown; before_photos?: unknown })
      : { listing: rowInput, before_photos: [] });
    const result = NormalizedListingSchema.safeParse(item.listing);
    if (!result.success) {
      errors.push({ row: rowNum, reason: result.error.issues[0]?.message ?? 'Invalid row' });
      return;
    }
    const data = result.data as NormalizedListing;
    const slug = deriveSlug(data);
    const beforePhotos: BeforePhoto[] = Array.isArray(item.before_photos)
      ? (item.before_photos as unknown[])
          .filter(
            (b): b is BeforePhoto =>
              !!b &&
              typeof b === 'object' &&
              ALLOWED_SECTIONS.has((b as BeforePhoto).section) &&
              typeof (b as BeforePhoto).url === 'string' &&
              /^https?:\/\//i.test((b as BeforePhoto).url),
          )
          .map((b) => ({ section: b.section, url: b.url, style: b.style ?? null }))
      : [];
    valid.push({ slug, data, beforePhotos });
  });

  if (valid.length === 0) {
    return NextResponse.json({ inserted: 0, updated: 0, errors, warnings });
  }

  // 2) Determine insert vs update by checking which slugs already exist.
  let existingSlugs = new Set<string>();
  try {
    const slugList = valid.map((v) => v.slug);
    const inClause = `(${slugList.map((sl) => `"${sl.replace(/"/g, '')}"`).join(',')})`;
    const existing = await supabaseRest<{ slug: string }[]>(
      'GET',
      `listings?select=slug&slug=in.${encodeURIComponent(inClause)}`,
    );
    existingSlugs = new Set((existing || []).map((r) => r.slug));
  } catch (err) {
    console.error('listings import: existing-slug lookup failed', err);
    // Non-fatal: upsert still works; counts may classify all as inserts.
  }

  // 3) Re-host photos (best-effort) and build db rows.
  const nowIso = new Date().toISOString();
  const dbRows = await Promise.all(
    valid.map(async ({ slug, data }, i) => {
      const rowNum = i + 1;
      const rehosted = await mapWithConcurrency(data.photo_urls, PHOTO_CONCURRENCY, async (url, idx) => {
        try {
          return await rehostPhoto(slug, idx, url);
        } catch (err) {
          warnings.push({
            row: rowNum,
            reason: `photo ${idx + 1} could not be imported (${err instanceof Error ? err.message : 'error'})`,
          });
          return null;
        }
      });
      const photo_urls = rehosted.filter((u): u is string => Boolean(u));
      if (photo_urls.length === 0) {
        warnings.push({ row: rowNum, reason: 'no photos imported — listing will show a placeholder' });
      }
      return {
        slug,
        external_id: data.external_id,
        mls_number: data.mls_number,
        address_line1: data.address_line1,
        address_line2: data.address_line2,
        city: data.city,
        county: data.county,
        state: data.state,
        zip: data.zip,
        list_price: data.list_price,
        beds: data.beds,
        baths: data.baths,
        sqft: data.sqft,
        lot_size: data.lot_size,
        year_built: data.year_built,
        property_type: data.property_type,
        short_description: data.short_description,
        est_remodel_budget_low: data.est_remodel_budget_low,
        est_remodel_budget_high: data.est_remodel_budget_high,
        est_arv: data.est_arv,
        recommended_scope: data.recommended_scope,
        highlights: data.highlights,
        photo_urls,
        listing_url: data.listing_url || null,
        featured: data.featured,
        sort_order: data.sort_order,
        status: data.status,
        updated_at: nowIso,
      };
    }),
  );

  // 4) Upsert.
  try {
    await supabaseRest('POST', 'listings', dbRows, {
      onConflict: 'slug',
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  } catch (err) {
    console.error('listings import: upsert failed', err);
    return NextResponse.json({ error: 'Database write failed' }, { status: 500 });
  }

  const updated = dbRows.filter((r) => existingSlugs.has(r.slug)).length;
  const inserted = dbRows.length - updated;

  // 5) Enqueue before/after renderings (best-effort; never fails the import).
  //    Re-host each before photo, then upsert a pending listing_renderings row.
  //    Skip rows already 'ready' whose source before-URL is unchanged (no re-bill).
  let queuedRenderings = 0;
  const rowsWithBefores = valid.filter((v) => v.beforePhotos.length > 0);
  if (rowsWithBefores.length > 0) {
    try {
      // Map slug -> listing id for the rows we just upserted.
      const slugs = rowsWithBefores.map((v) => v.slug);
      const inClause = `(${slugs.map((sl) => `"${sl.replace(/"/g, '')}"`).join(',')})`;
      const idRows = await supabaseRest<{ id: string; slug: string }[]>(
        'GET',
        `listings?select=id,slug&slug=in.${encodeURIComponent(inClause)}`,
      );
      const idBySlug = new Map((idRows || []).map((r) => [r.slug, r.id]));

      // Existing renderings for these listings, to dedupe by source_before_url.
      const ids = [...idBySlug.values()];
      const existingByKey = new Map<string, { source_before_url: string | null; status: string }>();
      if (ids.length > 0) {
        const idIn = `(${ids.map((id) => `"${id}"`).join(',')})`;
        const existing = await supabaseRest<
          { listing_id: string; section: string; source_before_url: string | null; status: string }[]
        >('GET', `listing_renderings?select=listing_id,section,source_before_url,status&listing_id=in.${encodeURIComponent(idIn)}`);
        for (const r of existing || []) existingByKey.set(`${r.listing_id}:${r.section}`, r);
      }

      const renderingRows: Record<string, unknown>[] = [];
      for (const v of rowsWithBefores) {
        const listingId = idBySlug.get(v.slug);
        if (!listingId) continue;
        for (const bp of v.beforePhotos) {
          const prior = existingByKey.get(`${listingId}:${bp.section}`);
          // Unchanged + already done → leave it alone.
          if (prior && prior.status === 'ready' && prior.source_before_url === bp.url) continue;
          let beforeUrl: string;
          try {
            beforeUrl = await rehostImage(bp.url, `renderings/${v.slug}/${bp.section}-before`);
          } catch (err) {
            warnings.push({
              row: 0,
              reason: `${bp.section} before photo for ${v.slug} could not be imported (${err instanceof Error ? err.message : 'error'})`,
            });
            continue;
          }
          renderingRows.push({
            listing_id: listingId,
            section: bp.section as RenderingSection,
            source_before_url: bp.url,
            before_url: beforeUrl,
            after_url: null,
            style: bp.style,
            status: 'pending',
            attempts: 0,
            error: null,
            updated_at: nowIso,
          });
        }
      }

      if (renderingRows.length > 0) {
        await supabaseRest('POST', 'listing_renderings', renderingRows, {
          onConflict: 'listing_id,section',
          prefer: 'resolution=merge-duplicates,return=minimal',
        });
        queuedRenderings = renderingRows.length;
      }
    } catch (err) {
      console.error('listings import: rendering enqueue failed (non-fatal)', err);
    }
  }

  return NextResponse.json({ inserted, updated, errors, warnings, queuedRenderings });
}
