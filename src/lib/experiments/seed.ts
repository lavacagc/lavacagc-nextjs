/**
 * The assignment seed and the admin preview parameter, import-free so
 * middleware (edge) can use them without bundling zod.
 *
 * The seed is `R` in the `cta_v` cookie (Phase 1): 32 hex characters, URI
 * encoded in the cookie as `P%3DA%3BS%3DB%3BR%3D<seed>` by the homepage
 * pre-paint script, or `R%3D<seed>` when middleware draws it on a first visit
 * to a page that renders an experiment on the server.
 */
export const SEED_RE = /^[0-9a-f]{32}$/;

/** The `R` seed from a raw or URI-decoded `cta_v` cookie value, or null. */
export function seedFromCookie(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // A malformed escape: read what is there.
  }
  for (const part of value.split(';')) {
    const [k, v] = part.split('=');
    const seed = (v ?? '').trim();
    if (k?.trim() === 'R' && SEED_RE.test(seed)) return seed;
  }
  return null;
}

/** A fresh seed from WebCrypto (edge and browser alike). */
export function drawSeed(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, '0')).join('');
}

/** `?exp=<key>:<variant>`, forwarded by middleware for a signed-in admin only. */
export const PREVIEW_PARAM = 'exp';
export const PREVIEW_HEADER = 'x-exp-preview';
export const PREVIEW_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*):([A-G])$/;

export function parsePreview(value: string | null | undefined): { key: string; variant: string } | null {
  const m = value ? PREVIEW_RE.exec(value) : null;
  return m ? { key: m[1], variant: m[2] } : null;
}

/** Pages whose experiments are applied on the server, so a first visit needs a seed before render. */
export function isServerExperimentPage(pathname: string): boolean {
  return pathname === '/home-services' || pathname.startsWith('/home-services/');
}
