/**
 * POST /api/home-services/photos - one homeowner photo, uploaded the moment it
 * is picked on the details screen (grill 001 Q7), before any request exists.
 *
 * Multipart: `photo` (one file) and optional `draft_token`. Returns
 * `{ id, draft_token }`; the first call mints the token. See
 * src/lib/home-services/photos.ts for the claim and purge lifecycle.
 *
 * SEC1 / SEC2: size capped before the body is read, rate limited per IP, type
 * decided by magic bytes (never the client's header or file name), stored
 * server-side in the PRIVATE bucket with the service role, generic errors.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import {
  PHOTO_BUCKET,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_TOKEN,
  DRAFT_TOKEN_RE,
  mintDraftToken,
  sniffImage,
  storageClient,
  countDraftPhotos,
} from '@/lib/home-services/photos';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
/**
 * A daily ceiling per IP as well (review D8). The 10-per-token cap can be
 * sidestepped by never sending a token (each call then mints a fresh one), so
 * without this only the burst limit bounded storage: 30 every 10 minutes is
 * over 4,000 a day. A real homeowner uploads at most 10 per request.
 */
const DAILY_MAX = 60;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Multipart framing and the token field on top of the file itself. */
const MAX_REQUEST_BYTES = MAX_PHOTO_BYTES + 64 * 1024;

export async function POST(request: NextRequest) {
  try {
    // Browsers always declare the length of a FormData body. Without one the
    // cap below could not be applied before formData() buffers the stream.
    const declared = Number(request.headers.get('content-length') ?? 'NaN');
    if (!Number.isFinite(declared) || declared <= 0) {
      return NextResponse.json({ error: 'length_required' }, { status: 411 });
    }
    if (declared > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: 'too_large' }, { status: 413 });
    }

    const ip = getClientIp(request);
    const rl = await checkRateLimit(`hs-photo:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 600) } });
    }
    const daily = await checkRateLimit(`hs-photo-day:${ip}`, DAILY_MAX, DAILY_WINDOW_MS);
    if (!daily.allowed) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(daily.retryAfter ?? 86400) } });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    const file = form.get('photo');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: 'too_large' }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniffImage(bytes);
    if (!sniffed) {
      return NextResponse.json({ error: 'unsupported_type' }, { status: 415 });
    }

    // Only a token this server minted is reused: one with no photos behind it
    // (never minted, or every photo already claimed or purged) gets a fresh one.
    const offered = form.get('draft_token');
    let draftToken = typeof offered === 'string' && DRAFT_TOKEN_RE.test(offered) ? offered : null;
    if (draftToken) {
      const count = await countDraftPhotos(draftToken);
      if (count >= MAX_PHOTOS_PER_TOKEN) {
        return NextResponse.json({ error: 'too_many_photos' }, { status: 400 });
      }
      if (count === 0) draftToken = null;
    }
    if (!draftToken) draftToken = mintDraftToken();

    const storage = storageClient();
    if (!storage) {
      console.error('[home-services/photos] no Supabase credentials');
      return NextResponse.json({ error: 'server_error' }, { status: 503 });
    }

    const id = randomUUID();
    const path = `drafts/${draftToken}/${id}.${sniffed.ext}`;
    const { error: uploadError } = await storage.storage
      .from(PHOTO_BUCKET)
      .upload(path, bytes, { contentType: sniffed.contentType, upsert: false });
    if (uploadError) {
      console.error('[home-services/photos] upload failed:', uploadError.message);
      return NextResponse.json({ error: 'server_error' }, { status: 502 });
    }

    try {
      await supabaseRest('POST', 'lead_photos', [{
        id,
        draft_token: draftToken,
        storage_path: path,
        content_type: sniffed.contentType,
        bytes: bytes.length,
      }], { prefer: 'return=minimal' });
    } catch (err) {
      console.error('[home-services/photos] row insert failed:', err instanceof Error ? err.message : err);
      await storage.storage.from(PHOTO_BUCKET).remove([path]);
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }

    return NextResponse.json({ id, draft_token: draftToken });
  } catch (err) {
    console.error('[home-services/photos] unhandled:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
