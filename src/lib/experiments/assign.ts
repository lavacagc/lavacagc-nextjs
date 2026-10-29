/**
 * Which variant a visitor sees. Pure and client-safe.
 *
 * The seed is the Phase 1 one: `R` in the `cta_v` cookie, 32 hex characters
 * drawn once per visitor (by the homepage pre-paint script, or by middleware
 * on a first visit to a page that renders an experiment server-side). The
 * index is `fmix32(fnv1a(seed + ":" + name)) % n` over the experiment's
 * active variants in key order - exactly `ctaIndex` from src/lib/cta/assign.ts,
 * reused rather than copied so the homepage and the server can never disagree.
 *
 * A visitor's variant therefore never changes while an experiment runs: the
 * seed is stable for 180 days and the active set does not change mid-run
 * (only the evaluator retires a loser, and a retired loser's visitors are
 * reassigned among the rest, which is what retiring means).
 *
 * The hash name is the experiment key, except for the two migrated Phase 1
 * buttons, which keep hashing on "primary" and "secondary" so no visitor who
 * already saw a button is moved by the migration.
 */
import { ctaIndex } from '@/lib/cta/assign';
import { isCrawlerUserAgent } from '@/lib/botFilter';
import { activeVariants, HERO_EXPERIMENT, type ExperimentVariant } from './types';

export { SEED_RE, seedFromCookie, parsePreview, PREVIEW_HEADER, PREVIEW_PARAM, PREVIEW_RE } from './seed';

export function hashName(experimentKey: string): string {
  if (experimentKey === HERO_EXPERIMENT.primary) return 'primary';
  if (experimentKey === HERO_EXPERIMENT.secondary) return 'secondary';
  return experimentKey;
}

/** The hashed variant for this seed among the active variants, or null when none are active. */
export function assignVariant(seed: string, experimentKey: string, variants: readonly ExperimentVariant[]): ExperimentVariant | null {
  const pool = activeVariants(variants);
  if (pool.length === 0) return null;
  return pool[ctaIndex(seed, hashName(experimentKey), pool.length)];
}

export type AssignmentReason = 'hash' | 'crawler' | 'no_seed' | 'preview';

export interface Assignment {
  variant: ExperimentVariant;
  reason: AssignmentReason;
  /** Only a hashed human assignment is ever counted. */
  track: boolean;
}

/**
 * The full rule: an admin preview shows the named variant (counted never); a
 * crawler gets the control (counted never); a visitor without a seed gets the
 * control (cannot be kept sticky, so counted never); everyone else is hashed.
 */
export function resolveAssignment(input: {
  experimentKey: string;
  variants: readonly ExperimentVariant[];
  controlKey: string;
  seed: string | null;
  userAgent: string | null | undefined;
  previewKey?: string | null;
}): Assignment | null {
  const { experimentKey, variants, controlKey, seed, userAgent, previewKey } = input;
  const control = variants.find((v) => v.key === controlKey) ?? activeVariants(variants)[0];
  if (previewKey) {
    const named = variants.find((v) => v.key === previewKey);
    if (named) return { variant: named, reason: 'preview', track: false };
  }
  if (!control) return null;
  if (isCrawlerUserAgent(userAgent)) return { variant: control, reason: 'crawler', track: false };
  if (!seed) return { variant: control, reason: 'no_seed', track: false };
  const hashed = assignVariant(seed, experimentKey, variants);
  return hashed ? { variant: hashed, reason: 'hash', track: true } : { variant: control, reason: 'no_seed', track: false };
}
