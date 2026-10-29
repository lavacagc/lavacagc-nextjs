/**
 * Sticky, even, reproducible variant assignment. Pure functions, client-safe.
 *
 * The `cta_v` cookie holds `P=<key>;S=<key>`. A raw `;` or `=` is not legal in
 * a cookie value (the `;` would end the cookie), so the value is stored
 * URI-encoded (`P%3DA%3BS%3DB`) and decoded on read.
 */
import type { CtaButton, CtaVariant, CtaVariantKey } from './types';
import { isCtaVariantKey } from './types';

export type CtaAssignment = Partial<Record<CtaButton, CtaVariantKey>>;

const COOKIE_LETTER: Record<CtaButton, string> = { primary: 'P', secondary: 'S' };

/**
 * FNV-1a, 32-bit. Stable across browsers and releases, which is the point:
 * the same visitor id always maps to the same index for a given active set.
 */
export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Index of the variant for this visitor among the active ones.
 *
 * The button name is mixed into the hash so the two buttons are assigned
 * independently. Hashing the visitor id alone would pair primary A with
 * secondary A for every visitor whenever both buttons have the same number of
 * variants, and the two tests would confound each other.
 */
export function pickVariant<T extends Pick<CtaVariant, 'variant_key'>>(
  active: readonly T[],
  visitorId: string,
  button: CtaButton,
): T | undefined {
  if (active.length === 0) return undefined;
  return active[stableHash(`${visitorId}:${button}`) % active.length];
}

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
    const [letter, key] = part.split('=').map((s) => s.trim());
    if (!isCtaVariantKey(key)) continue;
    if (letter === 'P') out.primary = key;
    else if (letter === 'S') out.secondary = key;
  }
  return out;
}

export function serializeAssignmentCookie(assignment: CtaAssignment): string {
  const parts: string[] = [];
  if (assignment.primary) parts.push(`${COOKIE_LETTER.primary}=${assignment.primary}`);
  if (assignment.secondary) parts.push(`${COOKIE_LETTER.secondary}=${assignment.secondary}`);
  return encodeURIComponent(parts.join(';'));
}

/**
 * Keep the stored key while it is still active; otherwise assign by hash.
 * Returns the chosen variant (undefined only when `active` is empty).
 */
export function resolveVariant<T extends Pick<CtaVariant, 'variant_key'>>(
  active: readonly T[],
  stored: CtaVariantKey | undefined,
  visitorId: string,
  button: CtaButton,
): T | undefined {
  const kept = stored ? active.find((v) => v.variant_key === stored) : undefined;
  return kept ?? pickVariant(active, visitorId, button);
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}
