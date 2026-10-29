/**
 * Getting media into the `project-images` bucket, for the admin form and the
 * ingest API alike. Server-only.
 *
 * Two paths, chosen by what the platform allows rather than by preference:
 *
 * 1. Through the function (multipart): the bytes are sniffed BEFORE anything is
 *    stored. Bounded by Vercel's 4.5 MB request body, so the admin form
 *    re-encodes large photos in the browser first.
 * 2. Signed upload (videos, and the CLI's full-size photos): the server picks
 *    the object key and mints a one-object signed URL, the client uploads
 *    straight to storage, and the server sniffs the stored object's first
 *    bytes afterwards, deleting it if it is not what we accept.
 *
 * Either way the server decides the key and the content type, never the client.
 */
import { z } from 'zod';
import { MAX_IMAGE_BODY_BYTES, MAX_SIGNED_IMAGE_BYTES, MAX_VIDEO_BYTES } from './fields';
import { SNIFF_BYTES, UNSUPPORTED_MEDIA_MESSAGE, isHeic, sniffMedia, type StoredVerdict } from './media';
import { ProjectError } from './draft';
import {
  createSignedUpload, discardRefused, isSafeObjectPath, judgeStored, newObjectPath, publicUrlFor, uploadObject,
} from './storage';

export interface StoredMedia {
  path: string;
  url: string;
  media_type: 'image' | 'video';
  content_type: string;
  size: number;
}

/** Sniff and store one file that came through the function body. */
export async function storeFile(file: File, path?: (ext: string) => string): Promise<StoredMedia> {
  if (file.size === 0) throw new ProjectError(400, 'That file is empty.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = bytes.subarray(0, SNIFF_BYTES);
  const media = sniffMedia(head);
  if (!media) {
    throw new ProjectError(415, isHeic(head) ? 'HEIC photos must be converted to JPEG before upload.' : UNSUPPORTED_MEDIA_MESSAGE);
  }
  if (media.kind === 'image' && bytes.length > MAX_IMAGE_BODY_BYTES) {
    throw new ProjectError(413, 'That photo is over 4 MB. Resize it, or use a signed upload.');
  }
  const key = path ? path(media.ext) : newObjectPath(media.ext);
  await uploadObject(key, bytes, media.contentType);
  return { path: key, url: publicUrlFor(key), media_type: media.kind, content_type: media.contentType, size: bytes.length };
}

export const signRequestSchema = z.object({
  /** Only used to pick an extension hint; the real type is sniffed after upload. */
  filename: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
  kind: z.enum(['image', 'video']),
});
export type SignRequest = z.infer<typeof signRequestSchema>;

const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/** A key and a signed URL for one upload. Size and extension are checked up front. */
export async function signUpload(req: SignRequest, prefix = 'projects'): Promise<{ path: string; token: string; signed_url: string }> {
  if (req.kind === 'video') {
    if (!VIDEO_EXT.test(req.filename)) throw new ProjectError(415, UNSUPPORTED_MEDIA_MESSAGE);
    if (req.size > MAX_VIDEO_BYTES) throw new ProjectError(413, 'Videos are limited to 200 MB.');
  } else {
    if (!IMAGE_EXT.test(req.filename)) throw new ProjectError(415, UNSUPPORTED_MEDIA_MESSAGE);
    if (req.size > MAX_SIGNED_IMAGE_BYTES) throw new ProjectError(413, 'Photos are limited to 25 MB.');
  }
  const ext = (req.filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'bin').toLowerCase().replace('jpeg', 'jpg').replace('m4v', 'mp4');
  const signed = await createSignedUpload(newObjectPath(ext, prefix));
  return { path: signed.path, token: signed.token, signed_url: signed.signedUrl };
}

/** The caller-facing error for a verdict that is not `ok`. */
export function verdictError(path: string, verdict: Exclude<StoredVerdict, { kind: 'ok' }>): ProjectError {
  switch (verdict.kind) {
    case 'bad': return new ProjectError(verdict.status, `${path}: ${verdict.reason}`);
    case 'missing': return new ProjectError(422, `${path}: not found in storage.`);
    default: return new ProjectError(503, `${path}: storage did not answer. Try again in a moment.`);
  }
}

/**
 * Check a stored object (after a signed upload, or when a caller references one).
 *
 * It must be an accepted type by its bytes, within the per-type cap, and, when
 * the uploader declared a size, exactly that size. A definitive refusal deletes
 * the object only if this server minted its key and nothing references it
 * (discardRefused); a storage error deletes nothing and answers 503.
 */
export async function verifyStored(
  path: string,
  opts: { declaredSize?: number | null; expectKind?: 'image' | 'video' } = {},
): Promise<StoredMedia> {
  if (!isSafeObjectPath(path)) throw new ProjectError(400, 'Invalid storage path.');
  let verdict = await judgeStored(path, opts.declaredSize);
  if (verdict.kind === 'ok' && opts.expectKind && verdict.media.kind !== opts.expectKind) {
    verdict = { kind: 'bad', status: 415, reason: `expected a ${opts.expectKind}. ${UNSUPPORTED_MEDIA_MESSAGE}` };
  }
  if (verdict.kind !== 'ok') {
    await discardRefused(path, verdict);
    throw verdictError(path, verdict);
  }
  return {
    path,
    url: publicUrlFor(path),
    media_type: verdict.media.kind,
    content_type: verdict.media.contentType,
    size: verdict.size ?? 0,
  };
}
