/**
 * Homeowner photos for a home services request (acceptance-criteria.md,
 * "Request flow API" and SEC2).
 *
 * Lifecycle:
 *   1. The details screen uploads each photo the moment it is picked, through
 *      POST /api/home-services/photos. The first upload mints a draft token;
 *      the object lands at  drafts/<draft_token>/<id>.<ext>  and a lead_photos
 *      row records it with that token and no request.
 *   2. The submit claims the photos it names (id AND token must both match):
 *      request_id is set, the object moves to  requests/<request_id>/<id>.<ext>
 *      and the token is cleared, so the token is worthless afterwards.
 *   3. /api/cron/purge-draft-photos deletes anything still unclaimed after 48 h
 *      (abandoned flows, and photos the homeowner removed from the screen).
 *
 * Server-only: uses the service-role key. The bucket is private, so every view
 * of a photo is a signed URL minted here, never a public one.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { carriesMarkup } from '@/lib/projects/media';

export const PHOTO_BUCKET = 'service-request-photos';
export const MAX_PHOTOS_PER_TOKEN = 10;
/** After client compression a 1600 px JPEG is well under 1 MB; 6 MB is the hard ceiling. */
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
export const DRAFT_TTL_HOURS = 48;

/** 32 random bytes, base64url: 43 characters, no padding. */
export const DRAFT_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function mintDraftToken(): string {
  return randomBytes(32).toString('base64url');
}

export type SniffedImage = { contentType: 'image/jpeg' | 'image/png' | 'image/webp'; ext: 'jpg' | 'png' | 'webp' };

/**
 * The real type of an upload, from its first bytes. The client's Content-Type
 * header and file name are ignored entirely (SEC2): a renamed HTML file is not
 * an image however it is labelled. HEIC is converted to JPEG in the browser
 * before upload, so it is not accepted here.
 */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  // Security review F1: an image signature followed by markup in the first
  // kilobyte is a polyglot, not a photo (same guard as the project uploads).
  if (carriesMarkup(bytes)) return null;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: 'image/jpeg', ext: 'jpg' };
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) {
    return { contentType: 'image/png', ext: 'png' };
  }
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return { contentType: 'image/webp', ext: 'webp' };
  }
  return null;
}

export function storageClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface LeadPhotoRow {
  id: string;
  request_id: string | null;
  draft_token: string | null;
  storage_path: string;
  content_type: string;
  bytes: number;
  created_at: string;
}

export async function countDraftPhotos(draftToken: string): Promise<number> {
  const rows = await supabaseRest<Array<{ id: string }>>(
    'GET',
    `lead_photos?select=id&draft_token=eq.${encodeURIComponent(draftToken)}&request_id=is.null&limit=${MAX_PHOTOS_PER_TOKEN + 1}`,
  );
  return rows?.length ?? 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Bind the named draft photos to a request and move them out of drafts/.
 *
 * Only rows matching BOTH the id and the draft token are touched, so a caller
 * cannot claim someone else's photo by guessing its id, and a photo removed on
 * screen (still under the token, but not named) is left for the purge.
 *
 * Never throws: a photo that fails to move keeps its drafts/ path but is still
 * bound to the request, so it is never lost and never purged. Returns the
 * claimed rows with their final storage paths.
 */
export async function claimDraftPhotos(
  requestId: string,
  draftToken: string | undefined,
  photoIds: string[],
): Promise<LeadPhotoRow[]> {
  const ids = photoIds.filter((id) => UUID_RE.test(id)).slice(0, MAX_PHOTOS_PER_TOKEN);
  if (!draftToken || !DRAFT_TOKEN_RE.test(draftToken) || ids.length === 0) return [];

  let rows: LeadPhotoRow[] = [];
  try {
    rows = await supabaseRest<LeadPhotoRow[]>(
      'GET',
      `lead_photos?select=id,request_id,draft_token,storage_path,content_type,bytes,created_at` +
        `&id=in.(${ids.join(',')})&draft_token=eq.${encodeURIComponent(draftToken)}&request_id=is.null&limit=${MAX_PHOTOS_PER_TOKEN}`,
    );
  } catch (err) {
    console.error('[home-services] photo claim lookup failed:', err instanceof Error ? err.message : err);
    return [];
  }

  const storage = storageClient();
  const claimed: LeadPhotoRow[] = [];
  for (const row of rows ?? []) {
    const fileName = row.storage_path.split('/').pop() ?? `${row.id}.jpg`;
    const target = `requests/${requestId}/${fileName}`;
    let finalPath = row.storage_path;
    if (storage) {
      const { error } = await storage.storage.from(PHOTO_BUCKET).move(row.storage_path, target);
      if (error) {
        console.error(`[home-services] photo move failed for ${row.id}:`, error.message);
      } else {
        finalPath = target;
      }
    }
    try {
      await supabaseRest('PATCH', `lead_photos?id=eq.${row.id}`, {
        request_id: requestId,
        draft_token: null,
        storage_path: finalPath,
      }, { prefer: 'return=minimal' });
      claimed.push({ ...row, request_id: requestId, draft_token: null, storage_path: finalPath });
    } catch (err) {
      console.error(`[home-services] photo claim update failed for ${row.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return claimed;
}

/** Photos already bound to a request (for the alert sent after verification). */
export async function photosForRequest(requestId: string): Promise<LeadPhotoRow[]> {
  try {
    return await supabaseRest<LeadPhotoRow[]>(
      'GET',
      `lead_photos?select=id,request_id,draft_token,storage_path,content_type,bytes,created_at&request_id=eq.${requestId}&order=created_at.asc&limit=${MAX_PHOTOS_PER_TOKEN * 4}`,
    );
  } catch (err) {
    console.error('[home-services] photo list failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/** Seven-day signed URLs for the owner alert, in the same order. Failures are skipped. */
export async function signPhotoUrls(paths: string[]): Promise<string[]> {
  const storage = storageClient();
  if (!storage || paths.length === 0) return [];
  const { data, error } = await storage.storage.from(PHOTO_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    console.error('[home-services] signing photo URLs failed:', error?.message);
    return [];
  }
  return data.map((d) => d.signedUrl).filter((u): u is string => Boolean(u));
}
