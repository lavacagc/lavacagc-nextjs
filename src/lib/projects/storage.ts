/**
 * Server-side access to the `project-images` bucket with the service key.
 *
 * Every write the new project flow makes to storage goes through here, so it
 * works the same on production (where the bucket has admin RLS policies) and on
 * a local replay (where it has none), and no browser ever needs a storage
 * policy of its own.
 */
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PROJECT_IMAGES_BUCKET } from './fields';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import {
  SNIFF_BYTES, judgeStoredObject, totalFromContentRange, type StoredRead, type StoredVerdict,
} from './media';

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase service credentials not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

/** `<supabase>/storage/v1/object/public/project-images/` - the only URL prefix we store. */
export function publicPrefix(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return `${url.replace(/\/+$/, '')}/storage/v1/object/public/${PROJECT_IMAGES_BUCKET}/`;
}

export function publicUrlFor(path: string): string {
  return publicPrefix() + path.split('/').map(encodeURIComponent).join('/');
}

/**
 * An object key that is safe to hand to storage: relative, no `..`, no
 * backslashes, no leading slash, nothing outside a conservative alphabet.
 */
const SAFE_PATH = /^(?!.*\.\.)(?!\/)[A-Za-z0-9][A-Za-z0-9._/-]{0,250}$/;
export function isSafeObjectPath(path: string): boolean {
  return SAFE_PATH.test(path);
}

/** The object key inside the bucket for one of our public URLs, or null for any other URL. */
export function pathFromPublicUrl(url: string): string | null {
  const prefix = publicPrefix();
  if (!url.startsWith(prefix)) return null;
  let path: string;
  try {
    path = decodeURIComponent(url.slice(prefix.length).split('?')[0]);
  } catch {
    return null;
  }
  return isSafeObjectPath(path) ? path : null;
}

/** A fresh key under `projects/` that cannot collide with a live object. */
export function newObjectPath(ext: string, prefix = 'projects'): string {
  return `${prefix}/${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
}

export async function uploadObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const { error } = await serviceClient()
    .storage.from(PROJECT_IMAGES_BUCKET)
    .upload(path, bytes, { contentType, upsert: false, cacheControl: '31536000' });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
}

export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await serviceClient().storage.from(PROJECT_IMAGES_BUCKET).remove(paths);
  if (error) console.error('project-images remove failed:', error.message);
}

/** A signed URL the browser or the CLI can PUT one object to, without any storage policy. */
export async function createSignedUpload(path: string): Promise<{ path: string; token: string; signedUrl: string }> {
  const { data, error } = await serviceClient()
    .storage.from(PROJECT_IMAGES_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) throw new Error(`signed upload failed: ${error?.message ?? 'no data'}`);
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

/**
 * Range-read the first bytes of a stored object, plus its total size.
 * Never throws: a failed read comes back as `status: null`, which
 * judgeStoredObject treats as "unavailable, try again", never as "bad".
 */
export async function readStoredHead(path: string): Promise<StoredRead> {
  const url = publicUrlFor(path);
  try {
    // Size first. A Range that runs past the end of the object makes Supabase
    // storage hang rather than answer 206 (reproduced: a 1 KB range on a 676-byte
    // object never returned), so the range below never asks past the end.
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS) });
    if (!head.ok) return { status: head.status };
    const size = Number(head.headers.get('content-length'));
    if (!Number.isInteger(size) || size < 0) return { status: null };
    if (size === 0) return { status: head.status, bytes: new Uint8Array(), size: 0 };

    const last = Math.min(size, SNIFF_BYTES) - 1;
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${last}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return { status: res.status };
    }
    const bytes = new Uint8Array(await res.arrayBuffer()).subarray(0, SNIFF_BYTES);
    const total = res.status === 206 ? totalFromContentRange(res.headers.get('content-range')) ?? size : size;
    return { status: res.status, bytes, size: total };
  } catch {
    // Timeouts and network errors are "unavailable": retryable, never grounds to delete.
    return { status: null };
  }
}

/** A storage call that takes longer than this is treated as unavailable. */
const STORAGE_TIMEOUT_MS = 10_000;

/** What a stored object is, as a verdict (see judgeStoredObject). */
export async function judgeStored(path: string, declaredSize?: number | null): Promise<StoredVerdict> {
  return judgeStoredObject(await readStoredHead(path), declaredSize);
}

/**
 * The shape of a key this server mints for a signed upload
 * (`projects/<ms>-<12 hex>.<ext>`, see newObjectPath). Only such keys may ever
 * be deleted after a refusal: a `drafts/` object or a live project's
 * `projects/<id>_<n>` file that a caller merely referenced is never touched.
 */
const MINTED_KEY = /^projects\/\d{13}-[0-9a-f]{12}\.[a-z0-9]{2,4}$/;
export function isMintedUploadKey(path: string): boolean {
  return MINTED_KEY.test(path);
}

/** Does any project_images row point at this object? */
export async function isReferenced(path: string): Promise<boolean> {
  const rows = await supabaseRest<Array<{ id: string }>>(
    'GET',
    `project_images?select=id&image_url=eq.${encodeURIComponent(publicUrlFor(path))}&limit=1`,
  );
  return (rows ?? []).length > 0;
}

/**
 * Delete an object that was just refused, but only when it is safe to:
 * a definitive `bad` verdict, a key this server minted for a signed upload,
 * and no project referencing it. Anything else is left exactly where it is.
 */
export async function discardRefused(path: string, verdict: StoredVerdict): Promise<boolean> {
  if (verdict.kind !== 'bad' || !isMintedUploadKey(path)) return false;
  if (await isReferenced(path)) return false;
  await removeObjects([path]);
  return true;
}

export interface DraftPhoto {
  name: string;
  path: string;
  url: string;
  size: number | null;
  created_at: string | null;
  content_type: string | null;
}

/**
 * Everything under `drafts/` (the orphaned uploads of the old wizard), newest
 * first. Capped: the panel is a picker, not an archive browser.
 */
export async function listDraftPhotos(limit = 200): Promise<DraftPhoto[]> {
  const { data, error } = await serviceClient()
    .storage.from(PROJECT_IMAGES_BUCKET)
    .list('drafts', { limit, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw new Error(`storage list failed: ${error.message}`);
  return (data ?? [])
    // Folders come back as entries with no id; placeholder files are not photos.
    .filter((o) => o.id && o.name !== '.emptyFolderPlaceholder')
    .map((o) => {
      const meta = (o.metadata ?? {}) as { size?: number; mimetype?: string };
      const path = `drafts/${o.name}`;
      return {
        name: o.name,
        path,
        url: publicUrlFor(path),
        size: typeof meta.size === 'number' ? meta.size : null,
        created_at: o.created_at ?? null,
        content_type: meta.mimetype ?? null,
      };
    });
}
