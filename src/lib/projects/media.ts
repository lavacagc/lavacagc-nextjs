/**
 * What a file IS, decided from its first bytes rather than from the name or the
 * Content-Type a client sent (SEC2). Pure, so the server routes and the specs
 * share one answer.
 */

export interface SniffedMedia {
  kind: 'image' | 'video';
  ext: 'jpg' | 'png' | 'webp' | 'mp4' | 'mov' | 'webm';
  contentType: string;
}

/**
 * How many leading bytes the sniffer reads: the magic numbers need 12, and the
 * markup scan below looks at the first kilobyte.
 */
export const SNIFF_BYTES = 1024;
const MIN_BYTES = 12;

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/**
 * A polyglot guard: a file that starts with an image signature and then
 * carries markup or script in its first kilobyte is not a photo anyone took.
 * (Real JPEG/PNG/WebP headers are binary; these strings do not occur there.)
 */
const MARKUP = /<html|<script|<\?php/i;
function carriesMarkup(bytes: Uint8Array): boolean {
  return MARKUP.test(new TextDecoder('latin1').decode(bytes.subarray(0, SNIFF_BYTES)));
}

/**
 * The media type of a buffer, or null for anything we do not store.
 *
 * HEIC is deliberately NOT accepted: browsers other than Safari cannot show it,
 * so a HEIC on the public site is a broken image for most visitors. The admin
 * form converts it in the browser and the CLI converts it with `sips` before
 * upload; anything else arriving as HEIC is refused with a sentence that says so.
 */
export function sniffMedia(bytes: Uint8Array): SniffedMedia | null {
  if (bytes.length < MIN_BYTES) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return carriesMarkup(bytes) ? null : { kind: 'image', ext: 'jpg', contentType: 'image/jpeg' };
  }
  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG' && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return carriesMarkup(bytes) ? null : { kind: 'image', ext: 'png', contentType: 'image/png' };
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return carriesMarkup(bytes) ? null : { kind: 'image', ext: 'webp', contentType: 'image/webp' };
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { kind: 'video', ext: 'webm', contentType: 'video/webm' };
  }
  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (brand === 'qt  ') return { kind: 'video', ext: 'mov', contentType: 'video/quicktime' };
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif)$/.test(brand)) return null;
    return { kind: 'video', ext: 'mp4', contentType: 'video/mp4' };
  }
  return null;
}

/** True for an ISO-BMFF HEIC/HEIF still, so the refusal can name the fix. */
export function isHeic(bytes: Uint8Array): boolean {
  return bytes.length >= MIN_BYTES && ascii(bytes, 4, 8) === 'ftyp'
    && /^(heic|heix|heim|heis|mif1|msf1)$/.test(ascii(bytes, 8, 12));
}

export const UNSUPPORTED_MEDIA_MESSAGE =
  'Only JPEG, PNG or WebP photos and MP4, MOV or WebM videos can be stored. Convert HEIC photos to JPEG first.';

/** Per-type ceilings for an object that reached storage without passing through a function. */
export const STORED_CAPS = { image: 25 * 1024 * 1024, video: 200 * 1024 * 1024 } as const;

/**
 * What a range read of a stored object says, as a verdict the caller can act on.
 *
 * - `ok`: the bytes are an accepted type and the size is within bounds.
 * - `bad`: storage answered 2xx and the object is definitively unacceptable
 *   (wrong bytes, over the cap, or not the size the uploader declared). The
 *   ONLY verdict that may lead to deleting the object.
 * - `missing`: storage answered 404. Nothing to delete.
 * - `unavailable`: any other status, or the read threw. Retryable; the object
 *   is left alone, so a storage blip can never delete a live photo.
 */
export type StoredVerdict =
  | { kind: 'ok'; media: SniffedMedia; size: number | null }
  | { kind: 'bad'; status: 413 | 415; reason: string }
  | { kind: 'missing' }
  | { kind: 'unavailable' };

export interface StoredRead {
  /** HTTP status of the range read, or null when the read threw. */
  status: number | null;
  bytes?: Uint8Array;
  /** Total object size from Content-Range (or Content-Length on a full 200), when known. */
  size?: number | null;
}

export function judgeStoredObject(read: StoredRead, declaredSize?: number | null): StoredVerdict {
  if (read.status === null) return { kind: 'unavailable' };
  if (read.status === 404 || read.status === 400) return { kind: 'missing' };
  if (read.status < 200 || read.status >= 300) return { kind: 'unavailable' };
  const media = sniffMedia(read.bytes ?? new Uint8Array());
  if (!media) {
    const heic = isHeic(read.bytes ?? new Uint8Array());
    return { kind: 'bad', status: 415, reason: heic ? 'HEIC photos must be converted to JPEG before upload.' : UNSUPPORTED_MEDIA_MESSAGE };
  }
  const size = read.size ?? null;
  if (size !== null && size > STORED_CAPS[media.kind]) {
    return { kind: 'bad', status: 413, reason: media.kind === 'video' ? 'Videos are limited to 200 MB.' : 'Photos are limited to 25 MB.' };
  }
  if (size !== null && declaredSize != null && size !== declaredSize) {
    return { kind: 'bad', status: 413, reason: 'The stored file is not the size that was declared for this upload.' };
  }
  return { kind: 'ok', media, size };
}

/** Total size from `Content-Range: bytes 0-1023/123456`, or null. */
export function totalFromContentRange(header: string | null): number | null {
  const total = header?.split('/')[1];
  if (!total || total === '*') return null;
  const n = Number(total);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
