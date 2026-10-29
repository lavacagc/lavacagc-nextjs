/**
 * Which (button, variant_key) pairs are active, for the event sink.
 *
 * Cached in memory per server instance for 30 seconds, so the sink does not
 * read cta_variants on every event. The cost: for up to 30 s after an admin
 * change, events for a just-deactivated variant are still accepted and events
 * for a just-activated one are dropped. The admin variants route calls
 * `forgetActivePairs` so the instance that served the edit is current at once.
 */
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { CTA_BUTTONS, MAX_VARIANTS_PER_BUTTON, type CtaButton } from './types';

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
    const rows = await supabaseRest<{ button: string; variant_key: string }[]>(
      'GET',
      `cta_variants?select=button,variant_key&active=is.true&limit=${CTA_BUTTONS.length * MAX_VARIANTS_PER_BUTTON}`,
    );
    cache = { pairs: new Set((rows ?? []).map((r) => `${r.button}:${r.variant_key}`)), at: Date.now() };
    store.__ctaActivePairs = cache;
  }
  return cache.pairs.has(`${button}:${variantKey}`);
}
