/**
 * Even, reproducible variant assignment. Pure, client-safe.
 *
 * The `cta_v` cookie holds `P=<key>;S=<key>;R=<seed>` (written and read only
 * by the pre-paint script, bootstrap.ts). `R` is a random
 * per-visitor assignment seed (32 hex chars) drawn by the pre-paint script on
 * the first visit; P and S are the keys that visitor was served. A raw `;` or
 * `=` is not legal in a cookie value, so the value is stored URI-encoded.
 *
 * The seed lives here, not in `cta_vid`, because `cta_vid` is server-minted and
 * httpOnly (it is the COUNTING identity, see /api/cta/event) and does not exist
 * yet when a first-time visitor's buttons have to be chosen before first paint.
 */

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
