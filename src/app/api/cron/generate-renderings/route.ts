import { NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { buildRemodelPrompt } from '@/lib/listings/renderingPrompt';

/**
 * Background generator for listing before/after renderings.
 *
 * Picks up `listing_renderings` rows the import enqueued as 'pending' (and
 * 'failed' rows with attempts < 3), sends the before photo + a remodel prompt
 * to Gemini Nano Banana Pro (image-in -> image-out, same camera angle), stores
 * the generated "after" in the `listings` bucket, and marks the row 'ready'.
 *
 * Auth: Bearer CRON_SECRET, enforced by middleware on /api/cron/*. Scheduled
 * in vercel.json. Kept off the request path so imports stay fast.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY || '';
const MODEL = 'gemini-3-pro-image-preview'; // Nano Banana Pro
const BUCKET = 'listings';

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

/** Call Gemini image-edit; returns {base64, mimeType} of the generated after. */
async function generateAfter(before: { data: string; mimeType: string }, prompt: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ inlineData: { mimeType: before.mimeType, data: before.data } }, { text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
      signal: AbortSignal.timeout(120000),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`gemini ${res.status}: ${text.substring(0, 200)}`);
  }
  const json = await res.json();
  const part = json?.candidates?.[0]?.content?.parts?.find(
    (p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData,
  );
  if (!part?.inlineData?.data) throw new Error('no image in gemini response');
  return { base64: part.inlineData.data as string, mimeType: (part.inlineData.mimeType as string) || 'image/png' };
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
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  let pending: RenderingRow[] = [];
  try {
    pending = await supabaseRest<RenderingRow[]>(
      'GET',
      `listing_renderings?select=id,section,before_url,style,attempts,listings(slug)` +
        `&or=(status.eq.pending,and(status.eq.failed,attempts.lt.${MAX_ATTEMPTS}))` +
        `&before_url=not.is.null&order=created_at.asc&limit=${BATCH}`,
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
