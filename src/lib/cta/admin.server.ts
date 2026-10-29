/**
 * Server-side data access for the homepage buttons in the admin Experiments
 * tab (Phase 1 "CTA Tests"). Variants live in the experiments hero-primary /
 * hero-secondary and their views and clicks in experiment_events since Phase 2
 * slice H; cta_variants and cta_events are read only as history.
 * Secret key only (via supabaseRest), never the publishable key (SEC5).
 */
import { isMissingTableError, supabaseRest, supabaseRestCounted } from '@/lib/notify/supabase-rest';
import { ctaRowsFor, heroKey, readHeroRow, readHeroRows } from './heroStore.server';
import {
  CTA_BUTTONS,
  CTA_VARIANT_KEYS,
  MAX_VARIANTS_PER_BUTTON,
  type CtaButton,
  type CtaVariantKey,
} from './types';
import {
  computeCtaReport,
  eventCountKey,
  type CtaReport,
  type CtaRequestRow,
  type CtaVariantRow,
  type EventCounts,
  type EventType,
} from './report';

/**
 * Requests are human-submitted and low volume, so the attributed rows are read
 * in one capped request. If the cap is ever reached the report says so
 * (`requests_truncated`) instead of silently undercounting.
 */
const REQUEST_READ_CAP = 10000;

/** Every variant of both buttons, from the hero experiments (active or not). */
export async function listVariants(): Promise<CtaVariantRow[]> {
  const rows = await readHeroRows();
  return CTA_BUTTONS.flatMap((button) => ctaRowsFor(button, rows[button]));
}

export async function getMinVisitors(): Promise<number> {
  const rows = await supabaseRest<{ cta_min_visitors: number }[]>('GET', 'site_settings?select=cta_min_visitors&id=eq.1&limit=1');
  return rows?.[0]?.cta_min_visitors ?? 100;
}

export async function setMinVisitors(value: number): Promise<void> {
  await supabaseRest('PATCH', 'site_settings?id=eq.1', { cta_min_visitors: value }, { prefer: 'return=minimal' });
}

/**
 * One exact count per (button, variant, event type), from experiment_events of
 * hero-primary / hero-secondary. Bounded by the variant count (at most 7 x 2
 * buttons x 2 types = 28), run in parallel, each served by the
 * (experiment_key, variant_key, event) index, and none of them moves rows.
 */
async function countEvents(variants: CtaVariantRow[]): Promise<EventCounts> {
  const counts: EventCounts = new Map();
  const jobs: Promise<void>[] = [];
  for (const v of variants) {
    for (const type of ['view', 'click'] as EventType[]) {
      jobs.push(
        supabaseRestCounted<{ id: number }>(
          `experiment_events?select=id&experiment_key=eq.${heroKey(v.button)}&variant_key=eq.${v.variant_key}&event=eq.${type}&limit=1`,
        ).then(({ total }) => {
          counts.set(eventCountKey(v.button, v.variant_key, type), total ?? 0);
        }),
      );
    }
  }
  await Promise.all(jobs);
  return counts;
}

/**
 * Phase 1 history, read-only: the cta_events counts per button, variant and
 * type, as they stood when the buttons moved into experiments (their uuid
 * visitors were copied into experiment_events by the migration). Bounded the
 * same way as countEvents. Empty when the history table is gone.
 */
export async function loadCtaHistory(): Promise<Array<{ button: CtaButton; variant_key: string; wording: string | null; views: number; clicks: number }>> {
  try {
    const legacy = await supabaseRest<Array<{ button: CtaButton; variant_key: string; wording: string }>>(
      'GET',
      `cta_variants?select=button,variant_key,wording&order=button.asc,variant_key.asc&limit=${CTA_BUTTONS.length * MAX_VARIANTS_PER_BUTTON}`,
    );
    return await Promise.all(
      (legacy ?? []).map(async (v) => {
        const [views, clicks] = await Promise.all(
          (['view', 'click'] as const).map(async (type) =>
            (await supabaseRestCounted<{ id: number }>(
              `cta_events?select=id&button=eq.${v.button}&variant_key=eq.${v.variant_key}&event_type=eq.${type}&limit=1`,
            )).total ?? 0,
          ),
        );
        return { button: v.button, variant_key: v.variant_key, wording: v.wording, views, clicks };
      }),
    );
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

export type CtaHistory = Awaited<ReturnType<typeof loadCtaHistory>>;

export async function loadCtaReport(): Promise<CtaReport & { requests_truncated: boolean; generated_at: string; history: CtaHistory }> {
  const [variants, minVisitors, requestPage, verified, history] = await Promise.all([
    listVariants(),
    getMinVisitors(),
    supabaseRestCounted<CtaRequestRow>(
      'home_service_requests?select=status,phone_verified,cta_variant_primary,cta_variant_secondary' +
        `&or=(cta_variant_primary.not.is.null,cta_variant_secondary.not.is.null)&order=created_at.desc&limit=${REQUEST_READ_CAP}`,
    ),
    supabaseRest<{ id: string }[]>('GET', 'home_service_requests?select=id&phone_verified=is.true&limit=1'),
    loadCtaHistory(),
  ]);
  const events = await countEvents(variants);
  const report = computeCtaReport({
    variants,
    events,
    requests: requestPage.rows,
    minVisitors,
    smsInUse: (verified?.length ?? 0) > 0,
  });
  return {
    ...report,
    requests_truncated: requestPage.total !== null && requestPage.total > requestPage.rows.length,
    generated_at: new Date().toISOString(),
    history,
  };
}

/** The first of A..G this button does not use yet, or null when all seven exist. */
export function nextFreeKey(existing: readonly CtaVariantKey[]): CtaVariantKey | null {
  return CTA_VARIANT_KEYS.find((k) => !existing.includes(k)) ?? null;
}

export async function variantsForButton(button: CtaButton): Promise<CtaVariantRow[]> {
  return ctaRowsFor(button, await readHeroRow(button));
}
