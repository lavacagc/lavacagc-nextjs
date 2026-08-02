import { NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { buildRemodelPrompt } from '@/lib/listings/renderingPrompt';
import { cleanEnv } from '@/lib/envClean';

/**
 * Background generator for listing before/after renderings.
 *
 * Picks up `listing_renderings` rows the import enqueued as 'pending' (and
 * 'failed' rows with attempts < 3), sends the before photo + a remodel prompt
 * to OpenAI's gpt-image-1 image-edit (image-in -> image-out, same camera
 * angle), stores the generated "after" in the `listings` bucket, and marks the
 * row 'ready'.
 *
 * Auth: Bearer CRON_SECRET, enforced by middleware on /api/cron/*. Scheduled
 * in vercel.json. Kept off the request path so imports stay fast.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';
// Reuses the same OPENAI_API_KEY the other AI routes already use (no new env
// var): content-actions/draft and cron/seo-maintain. The chat widget that
// originally introduced it was deleted with the lead intake chat.
// cleanEnv() strips trailing whitespace / newlines / literal "\n" that a
// dashboard paste can append — those produce an opaque 401 "Incorrect API key".
const OPENAI_API_KEY = cleanEnv(process.env.OPENAI_API_KEY) || '';
const MODEL = 'gpt-image-1'; // OpenAI image-edit model
const IMAGE_QUALITY = 'medium'; // 'low' | 'medium' | 'high' — balances cost vs. fidelity
const BUCKET = 'listings';

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const BATCH = 6;
const MAX_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 15000;

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

interface RenderingRow {
  id: string;
  section: string;
  before_url: string | null;
  style: string | null;
  attempts: number;
  listings: { slug: string } | { slug: string }[] | null;
}

function slugOf(row: RenderingRow): string {
  const l = row.listings;
  if (!l) return 'listing';
  return Array.isArray(l) ? l[0]?.slug ?? 'listing' : l.slug;
}

async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`before fetch ${res.status}`);
  const mimeType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  const buf = Buffer.from(await res.arrayBuffer());
  return { data: buf.toString('base64'), mimeType };
}

/** Call OpenAI gpt-image-1 image-edit; returns {base64, mimeType} of the after. */
async function generateAfter(before: { data: string; mimeType: string }, prompt: string) {
  if (!openai) throw new Error('OPENAI_API_KEY not configured');
  const ext = EXT_BY_TYPE[before.mimeType] || 'png';
  const image = await toFile(Buffer.from(before.data, 'base64'), `before.${ext}`, { type: before.mimeType });
  let result;
  try {
    result = await openai.images.edit(
      { model: MODEL, image, prompt, size: 'auto', quality: IMAGE_QUALITY, n: 1 },
      { timeout: 120000, maxRetries: 1 },
    );
  } catch (err) {
    // Surface a compact, logged message like the rest of the pipeline expects.
    const status = (err as { status?: number })?.status;
    const msg = err instanceof Error ? err.message : 'image edit failed';
    throw new Error(`openai ${status ?? ''}: ${msg}`.trim().substring(0, 200));
  }
  // gpt-image-1 always returns base64 PNG (no url option).
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error('no image in openai response');
  return { base64: b64, mimeType: 'image/png' };
}

async function uploadAfter(slug: string, section: string, base64: string, mimeType: string): Promise<string> {
  const ext = EXT_BY_TYPE[mimeType] || 'png';
  const objectPath = `renderings/${slug}/${section}-after.${ext}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type': mimeType,
      'x-upsert': 'true',
    },
    body: Buffer.from(base64, 'base64'),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`storage upload ${res.status}: ${text}`.trim());
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

async function patchRow(id: string, patch: Record<string, unknown>) {
  await supabaseRest('PATCH', `listing_renderings?id=eq.${id}`, patch, { prefer: 'return=minimal' });
}

export async function GET() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !OPENAI_API_KEY) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  let pending: RenderingRow[] = [];
  try {
    // NOTE: kept as a single template literal with a flat filter on purpose.
    // The previous nested `or=(status.eq.pending,and(status.eq.failed,attempts.lt.N))`
    // form, split across `+`-concatenated segments, hit a Turbopack minifier bug
    // that dropped the trailing `))` in the production bundle — sending PostgREST a
    // malformed logic tree (PGRST100) so the cron 500'd and no renderings generated.
    // `status=in.(pending,failed)&attempts=lt.N` is equivalent: pending rows always
    // have attempts=0 (< N), failed rows are retried until attempts reaches N.
    pending = await supabaseRest<RenderingRow[]>(
      'GET',
      `listing_renderings?select=id,section,before_url,style,attempts,listings(slug)&status=in.(pending,failed)&attempts=lt.${MAX_ATTEMPTS}&before_url=not.is.null&order=created_at.asc&limit=${BATCH}`,
    );
  } catch (err) {
    console.error('generate-renderings: query failed', err);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  let ready = 0;
  let failed = 0;
  // Sequential — image gen is slow; a small batch keeps us well under maxDuration.
  for (const row of pending) {
    const attempts = (row.attempts ?? 0) + 1;
    try {
      const before = await fetchAsBase64(row.before_url as string);
      const prompt = buildRemodelPrompt(row.section, row.style);
      const after = await generateAfter(before, prompt);
      const afterUrl = await uploadAfter(slugOf(row), row.section, after.base64, after.mimeType);
      await patchRow(row.id, {
        after_url: afterUrl,
        status: 'ready',
        attempts,
        error: null,
        updated_at: new Date().toISOString(),
      });
      ready++;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'generation error';
      await patchRow(row.id, {
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        attempts,
        error: message.substring(0, 500),
        updated_at: new Date().toISOString(),
      }).catch(() => {});
      failed++;
      console.error(`generate-renderings: row ${row.id} failed`, message);
    }
  }

  return NextResponse.json({ processed: pending.length, ready, failed });
}
