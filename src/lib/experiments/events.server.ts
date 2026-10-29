/**
 * The funnel steps after the view (docs/phase-2/acceptance-criteria.md,
 * "Funnel events"). Each is recorded once per visitor per experiment and
 * variant (the unique index), against the variants that visitor was shown:
 *
 *  - request_started, request_submitted: every LIVE experiment the visitor
 *    has a `view` in (they saw it, then acted).
 *  - quote_accepted, job_paid: every experiment the visitor has a
 *    `request_submitted` in, whatever its status now (a job is often paid
 *    after the test that brought it in has concluded, and revenue per visitor
 *    should still count it).
 *
 * The visitor is the signed `cta_vid` id, never a value from a request body.
 * These never throw: a funnel write must not fail a homeowner's request or an
 * admin's status change.
 */
import { liveKeys, recordEvents, visitorPairs } from './store.server';
import type { FunnelEvent } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function recordDownstream(
  visitorId: string | null | undefined,
  event: Exclude<FunnelEvent, 'view' | 'click'>,
  valueCents?: number | null,
): Promise<number> {
  if (!visitorId || !UUID_RE.test(visitorId)) return 0;
  try {
    const after: FunnelEvent = event === 'quote_accepted' || event === 'job_paid' ? 'request_submitted' : 'view';
    let pairs = await visitorPairs(visitorId, after);
    if (after === 'view') {
      const live = await liveKeys([...new Set(pairs.map((p) => p.experiment_key))]);
      pairs = pairs.filter((p) => live.has(p.experiment_key));
    }
    await recordEvents(
      pairs.map((p) => ({
        experiment_key: p.experiment_key,
        variant_key: p.variant_key,
        visitor_id: visitorId,
        event,
        value_cents: valueCents ?? null,
      })),
    );
    return pairs.length;
  } catch (err) {
    console.error(`experiments: recording ${event} failed:`, err instanceof Error ? err.message : String(err));
    return 0;
  }
}
