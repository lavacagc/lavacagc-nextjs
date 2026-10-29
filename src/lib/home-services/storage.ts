/**
 * Server-only access to the private `service-request-photos` bucket: signed
 * links (7-day TTL, SEC2) and uploads for offer attachments.
 *
 * Content type is decided from the file's first bytes, never from the header
 * the browser sent, so a renamed executable cannot ride in as "photo.jpg".
 */
import { createClient } from '@supabase/supabase-js';
import { cleanEnv } from '@/lib/envClean';
import { carriesMarkup } from '@/lib/projects/media';

export const PHOTO_BUCKET = 'service-request-photos';
export const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

function bucket() {
  const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = cleanEnv(process.env.SUPABASE_SECRET_KEY);
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } }).storage.from(PHOTO_BUCKET);
}

/** Signed links for storage paths, in order; a path that cannot be signed maps to null. */
export async function signPaths(paths: string[], ttlSeconds = SIGNED_URL_TTL_SECONDS): Promise<Array<string | null>> {
  if (paths.length === 0) return [];
  const store = bucket();
  if (!store) return paths.map(() => null);
  try {
    const { data, error } = await store.createSignedUrls(paths, ttlSeconds);
    if (error || !data) return paths.map(() => null);
    const byPath = new Map(data.map((d) => [d.path, d.signedUrl ?? null]));
    return paths.map((p) => byPath.get(p) ?? null);
  } catch {
    return paths.map(() => null);
  }
}

export const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] as const;
export type AttachmentType = (typeof ALLOWED_ATTACHMENT_TYPES)[number];

const EXT: Record<AttachmentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

/** Content type from magic bytes; null when it is none of the allowed kinds. */
export function sniffContentType(bytes: Uint8Array): AttachmentType | null {
  const b = bytes;
  // Security review F1: an image signature followed by markup in the first
  // kilobyte is a polyglot, not a photo. PDFs are text-bearing by design and
  // are left to the PDF signature alone.
  const image = (type: AttachmentType): AttachmentType | null => (carriesMarkup(b) ? null : type);
  const ascii = (start: number, end: number) => String.fromCharCode(...b.slice(start, end));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return image('image/jpeg');
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a) return image('image/png');
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return image('image/webp');
  if (b.length >= 12 && ascii(4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(ascii(8, 12))) return image('image/heic');
  if (b.length >= 5 && ascii(0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

export function extensionFor(type: AttachmentType): string {
  return EXT[type];
}

/** Upload bytes to a path in the bucket. Returns false on any failure (never throws). */
export async function uploadObject(path: string, bytes: Uint8Array, contentType: string): Promise<boolean> {
  const store = bucket();
  if (!store) return false;
  try {
    const { error } = await store.upload(path, bytes, { contentType, upsert: false });
    if (error) {
      console.error('offer attachment upload failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('offer attachment upload failed:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** Best-effort cleanup after a failed multi-file write. */
export async function removeObjects(paths: string[]): Promise<void> {
  const store = bucket();
  if (!store || paths.length === 0) return;
  try { await store.remove(paths); } catch { /* best effort */ }
}
