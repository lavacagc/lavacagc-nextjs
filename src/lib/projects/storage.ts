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
import { SNIFF_BYTES, sniffMedia, type SniffedMedia } from './media';

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
 * Read the first bytes of a stored object and say what it really is.
 * Null when the object is missing or is not a type we accept.
 */
export async function sniffStoredObject(path: string): Promise<SniffedMedia | null> {
  const res = await fetch(publicUrlFor(path), {
    headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer()).subarray(0, SNIFF_BYTES);
  return sniffMedia(buf);
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
