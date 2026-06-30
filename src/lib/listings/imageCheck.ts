/**
 * Image URL verifier — shared by the upload "verify" endpoint and (in spirit)
 * the import re-host. Confirms a photo URL is reachable and actually an image,
 * the same way the importer will accept it, so the admin learns about a broken
 * or non-image link BEFORE committing rather than as an after-the-fact warning.
 *
 * Network-light: it issues a GET but cancels the body once the headers are in,
 * so we don't download the whole image just to validate it.
 */

export const IMAGE_CHECK = {
  timeoutMs: 8000,
  maxBytes: 10_000_000, // 10MB — matches the importer's MAX_PHOTO_BYTES
};

export interface ImageCheckResult {
  url: string;
  ok: boolean;
  status?: number;
  contentType?: string;
  /** Human-readable problem when ok === false. */
  reason?: string;
}

export async function checkImageUrl(rawUrl: string): Promise<ImageCheckResult> {
  const url = (rawUrl ?? '').trim();
  if (!url) return { url, ok: false, reason: 'empty URL' };
  if (!/^https:\/\//i.test(url)) {
    return { url, ok: false, reason: 'must start with https://' };
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(IMAGE_CHECK.timeoutMs),
    });

    if (!res.ok) {
      try { await res.body?.cancel(); } catch {}
      return { url, ok: false, status: res.status, reason: `link returned ${res.status}` };
    }

    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const len = Number(res.headers.get('content-length') || '0');
    try { await res.body?.cancel(); } catch {}

    if (!contentType.startsWith('image/')) {
      return { url, ok: false, status: res.status, contentType, reason: `not an image (${contentType || 'unknown type'})` };
    }
    if (len && len > IMAGE_CHECK.maxBytes) {
      return { url, ok: false, status: res.status, contentType, reason: 'image is larger than 10MB' };
    }
    return { url, ok: true, status: res.status, contentType };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch failed';
    return { url, ok: false, reason: /timeout|abort/i.test(msg) ? 'timed out' : 'could not reach the URL' };
  }
}
