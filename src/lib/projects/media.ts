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

/** Enough leading bytes to tell every accepted type apart. */
export const SNIFF_BYTES = 32;

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
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
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: 'image', ext: 'jpg', contentType: 'image/jpeg' };
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG') {
    return { kind: 'image', ext: 'png', contentType: 'image/png' };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return { kind: 'image', ext: 'webp', contentType: 'image/webp' };
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { kind: 'video', ext: 'webm', contentType: 'video/webm' };
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (brand === 'qt  ') return { kind: 'video', ext: 'mov', contentType: 'video/quicktime' };
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif)$/.test(brand)) return null;
    return { kind: 'video', ext: 'mp4', contentType: 'video/mp4' };
  }
  return null;
}

/** True for an ISO-BMFF HEIC/HEIF still, so the refusal can name the fix. */
export function isHeic(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp'
    && /^(heic|heix|heim|heis|mif1|msf1)$/.test(ascii(bytes, 8, 12));
}

export const UNSUPPORTED_MEDIA_MESSAGE =
  'Only JPEG, PNG or WebP photos and MP4, MOV or WebM videos can be stored. Convert HEIC photos to JPEG first.';
