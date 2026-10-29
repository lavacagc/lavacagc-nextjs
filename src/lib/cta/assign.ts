/**
 * Sticky, even, reproducible variant assignment. Pure functions, client-safe.
 *
 * The `cta_v` cookie holds `P=<key>;S=<key>;R=<seed>`. `R` is a random
 * per-visitor assignment seed (32 hex chars) drawn by the pre-paint script on
 * the first visit; P and S are the keys that visitor was served. A raw `;` or
 * `=` is not legal in a cookie value, so the value is stored URI-encoded.
 *
 * The seed lives here, not in `cta_vid`, because `cta_vid` is server-minted and
 * httpOnly (it is the COUNTING identity, see /api/cta/event) and does not exist
 * yet when a first-time visitor's buttons have to be chosen before first paint.
 */
import type { CtaButton, CtaVariant, CtaVariantKey } from './types';
import { isCtaVariantKey } from './types';

/**
 * Index of the variant for (seed, button) among `count` active variants.
 *
 * FNV-1a over `seed:button`, then the murmur3 fmix32 finalizer, then modulo.
 * The finalizer is load-bearing: FNV-1a multiplies by an odd prime, so its low
 * k bits depend only on the low k bits of the input, and `% n` for an even n
 * reads exactly those bits. Without it the ":primary" and ":secondary" suffixes
 * shift the low bits by a constant and the two buttons come out perfectly
 * correlated (with two variants each, only AA and BB were ever served).
 *
 * s: seed, b: button name, n: active variant count; short names because the
 * function ships in the under-1-KB pre-paint script.
 *
 * SELF-CONTAINED ON PURPOSE: no references outside its own body, because the
 * pre-paint script embeds this exact function via `toString()` (see
 * bootstrap.ts). The browser and the tests therefore run the same code.
 */
export function ctaIndex(s: string, b: string, n: number): number {
  const t = s + ':' + b;
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) % n;
}

export function pickVariant<T extends Pick<CtaVariant, 'variant_key'>>(
  active: readonly T[],
  seed: string,
  button: CtaButton,
): T | undefined {
  if (active.length === 0) return undefined;
  return active[ctaIndex(seed, button, active.length)];
}

export interface CtaAssignment {
  primary?: CtaVariantKey;
  secondary?: CtaVariantKey;
  seed?: string;
}

export const SEED_PATTERN = /^[0-9a-f]{32}$/;

export function parseAssignmentCookie(raw: string | undefined | null): CtaAssignment {
  const out: CtaAssignment = {};
  if (!raw) return out;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return out;
  }
  for (const part of decoded.split(';')) {
    const [letter, value] = part.split('=').map((s) => s.trim());
    if (letter === 'R' && SEED_PATTERN.test(value ?? '')) out.seed = value;
    else if (!isCtaVariantKey(value)) continue;
    else if (letter === 'P') out.primary = value;
    else if (letter === 'S') out.secondary = value;
  }
  return out;
}

export function serializeAssignmentCookie(assignment: CtaAssignment): string {
  const parts: string[] = [];
  if (assignment.primary) parts.push(`P=${assignment.primary}`);
  if (assignment.secondary) parts.push(`S=${assignment.secondary}`);
  if (assignment.seed) parts.push(`R=${assignment.seed}`);
  return encodeURIComponent(parts.join(';'));
}

/** Keep the stored key while it is still active; otherwise assign by hash of the seed. */
export function resolveVariant<T extends Pick<CtaVariant, 'variant_key'>>(
  active: readonly T[],
  stored: CtaVariantKey | undefined,
  seed: string,
  button: CtaButton,
): T | undefined {
  const kept = stored ? active.find((v) => v.variant_key === stored) : undefined;
  return kept ?? pickVariant(active, seed, button);
}
