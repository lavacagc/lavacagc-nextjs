/**
 * Which (button, variant_key) pairs are countable, for the event sink: the
 * active variants of a LIVE `hero-primary` / `hero-secondary` experiment
 * (Phase 2 slice H; before it, active rows of cta_variants).
 *
 * Cached in memory per server instance for 30 seconds, so the sink does not
 * read the experiments on every event. The cost: for up to 30 s after an admin
 * change, events for a just-deactivated variant are still accepted and events
 * for a just-activated one are dropped. Every experiments write calls
 * `forgetActivePairs` (via invalidateExperiments), so the instance that served
 * the edit is current at once.
 */
import { ctaRowsFor, isLive, readHeroRows } from './heroStore.server';
import { CTA_BUTTONS, type CtaButton } from './types';

const TTL_MS = 30_000;

/**
 * On globalThis, not module scope: in development each route can get its own
 * copy of this module, and the admin route's `forgetActivePairs` must reach the
 * cache the event route reads.
 */
const store = globalThis as typeof globalThis & { __ctaActivePairs?: { pairs: Set<string>; at: number } | null };

export function forgetActivePairs(): void {
  store.__ctaActivePairs = null;
}

export async function isActivePair(button: CtaButton, variantKey: string): Promise<boolean> {
  let cache = store.__ctaActivePairs;
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const rows = await readHeroRows();
    const pairs = new Set<string>();
    for (const b of CTA_BUTTONS) {
      if (!isLive(rows[b])) continue;
      for (const v of ctaRowsFor(b, rows[b])) if (v.active) pairs.add(`${b}:${v.variant_key}`);
    }
    cache = { pairs, at: Date.now() };
    store.__ctaActivePairs = cache;
  }
  return cache.pairs.has(`${button}:${variantKey}`);
}
