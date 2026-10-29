/**
 * Experiments (Phase 2 slice H, decision 005): shared types, constants and the
 * payload schema. Client-safe: no server imports.
 *
 * Tables: supabase/migrations/20261030000000_phase_2.sql (experiments,
 * experiment_events, experiment_backlog) and 20261030000003_cta_to_experiments.sql.
 *
 * PRICES ARE NEVER AN EXPERIMENT VARIABLE (decision 005, Q16). That is held
 * three ways here:
 *  1. The payload is a CLOSED set of named slots (`.strict()`), and none of
 *     them is a price: there is no key a variant could use to reach
 *     `priceDisplay`, `startingPriceCents` or `minimumCents`. `NoPriceSlots`
 *     below makes that a compile error, and tests/experiments.spec.ts pins it.
 *  2. Copy slots refuse text that states an amount, the phone number or the
 *     license (`forbiddenClaim`), so a price cannot ride in as words either.
 *  3. Prices render from the catalog (getCatalog), which no payload touches.
 */
import { z } from 'zod';

export const EXPERIMENT_STATUSES = ['draft', 'running', 'pending_promotion', 'concluded', 'retired'] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

/** Statuses during which visitors are assigned and counted. */
export const LIVE_STATUSES: readonly ExperimentStatus[] = ['running', 'pending_promotion'];

export const FUNNEL_EVENTS = ['view', 'click', 'request_started', 'request_submitted', 'quote_accepted', 'job_paid'] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/** Metrics an experiment may be judged on (view is the denominator, never the metric). */
export const PRIMARY_METRICS = ['click', 'request_started', 'request_submitted', 'quote_accepted', 'job_paid'] as const;
export type PrimaryMetric = (typeof PRIMARY_METRICS)[number];

export const VARIANT_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export type VariantKey = (typeof VARIANT_KEYS)[number];

/** Keys that are path segments of the agent routes, so they can never name an experiment. */
export const RESERVED_KEYS = ['backlog', 'event', 'report', 'veto', 'notify'] as const;
export const EXPERIMENT_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The Phase 1 hero buttons, migrated by 20261030000003_cta_to_experiments.sql. */
export const HERO_EXPERIMENT = { primary: 'hero-primary', secondary: 'hero-secondary' } as const;

/** Thresholds (docs/phase-2/acceptance-criteria.md, "Experiments"). */
export const WIN_PROBABILITY = 0.95;
export const LOSE_PROBABILITY = 0.05;
export const MAX_EXPECTED_LOSS = 0.005;
export const MONTE_CARLO_DRAWS = 10_000;
export const VETO_WINDOW_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

/**
 * What copy may not say. Plain-English reasons, because the agent reads them.
 * Amounts (prices, discounts), the phone number and the license are fixed
 * facts, never variables.
 */
export function forbiddenClaim(text: string): string | null {
  if (/[$€£]\s?\d|\d[\d,.]*\s?(?:usd|dollars?|d[oó]lares)\b|\bcents?\b/i.test(text)) return 'Copy may not state a price or an amount; prices are never tested.';
  if (/\d+\s?%|\bpercent\b|\bpor ciento\b/i.test(text)) return 'Copy may not state a percentage or discount; prices are never tested.';
  if (/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(text)) return 'Copy may not contain a phone number; the phone number is fixed.';
  if (/\bHIC\b|\blicen[sc]e[ds]?\b|\blicencia\b|\b13VH\d+/i.test(text)) return 'Copy may not mention the license; it is a fixed fact.';
  return null;
}

const copyText = z.string().trim().min(1).max(240).superRefine((value, ctx) => {
  const reason = forbiddenClaim(value);
  if (reason) ctx.addIssue({ code: 'custom', message: reason });
});

/** A piece of copy, per language. Spanish may be absent only on English-only surfaces (the homepage). */
export const copySchema = z.object({ en: copyText, es: copyText.optional() }).strict();
export type Copy = z.infer<typeof copySchema>;

export const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** A file under /public: an absolute site path, no traversal, an image extension. */
export const PUBLIC_IMAGE_RE = /^\/(?!.*\.\.)(?!\/)[A-Za-z0-9/_.-]+\.(?:png|jpe?g|webp|avif|svg)$/;
export const SECTION_ID_RE = /^[a-z0-9-]{1,40}$/;

/** Copy slots: strings per language. */
export const COPY_SLOTS = ['eyebrow', 'title', 'body', 'cta', 'heading', 'intro', 'wording', 'subtext', 'imageAlt'] as const;
export type CopySlot = (typeof COPY_SLOTS)[number];

/**
 * The payload of one variant: a closed set of slots. Copy is a string per
 * language, section order an array of section ids, an image a path under
 * /public, a colour a hex value. Nothing else, and never a price.
 */
export const payloadSchema = z
  .object({
    eyebrow: copySchema.optional(),
    title: copySchema.optional(),
    body: copySchema.optional(),
    cta: copySchema.optional(),
    heading: copySchema.optional(),
    intro: copySchema.optional(),
    wording: copySchema.optional(),
    subtext: copySchema.optional(),
    imageAlt: copySchema.optional(),
    image: z.string().regex(PUBLIC_IMAGE_RE, 'An image is a path under /public, for example /images/hero.webp').optional(),
    color: z.string().regex(HEX_COLOR_RE, 'A colour is a hex value like #1f7a4d').optional(),
    order: z
      .array(z.string().regex(SECTION_ID_RE))
      .min(2)
      .max(12)
      .refine((ids) => new Set(ids).size === ids.length, 'Section ids must not repeat')
      .optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 0, 'A payload needs at least one slot');
export type ExperimentPayload = z.infer<typeof payloadSchema>;
export type PayloadSlot = keyof ExperimentPayload;
export const PAYLOAD_SLOTS = [...COPY_SLOTS, 'image', 'color', 'order'] as const satisfies readonly PayloadSlot[];

/** Price fields of the catalog (HomeService). A payload can never name one. */
export const PRICE_FIELDS = ['priceDisplay', 'startingPriceCents', 'minimumCents', 'priceUnit', 'priceNote'] as const;

/**
 * Compile-time pin: no payload slot is a price field or looks like one. If
 * someone adds `price` (or anything with price/cents/minimum in it) to the
 * payload schema, this line stops the build.
 */
type PriceLike = (typeof PRICE_FIELDS)[number] | `${string}${'price' | 'Price' | 'cents' | 'Cents' | 'minimum' | 'Minimum' | 'amount' | 'Amount'}${string}`;
export type NoPriceSlots = Extract<PayloadSlot, PriceLike> extends never ? true : never;
export const NO_PRICE_SLOTS: NoPriceSlots = true;

// ---------------------------------------------------------------------------
// Variants and experiments
// ---------------------------------------------------------------------------

export const variantSchema = z
  .object({
    key: z.enum(VARIANT_KEYS),
    label: z.string().trim().min(1).max(80),
    /** False takes a variant out of assignment (a retired loser, or a Phase 1 variant switched off). */
    active: z.boolean().optional(),
    payload: payloadSchema,
  })
  .strict();
export type ExperimentVariant = z.infer<typeof variantSchema>;

export interface ExperimentDecision {
  evaluated_at?: string;
  verdict?: { kind: string; reason: string; winner_key?: string; retire?: string[]; ready_on?: string | null };
  arms?: Array<{ key: string; visitors: number; conversions: number; rate: number | null; p_beat_control: number | null; expected_loss: number | null; revenue_per_visitor_cents: number | null }>;
  /** Set while status is pending_promotion. */
  pending?: { winner_key: string; notified_at: string; promote_after: string; by: string } | null;
  promoted?: { at: string; by: string; winner_key: string; previous_control: string };
  vetoed?: { at: string; by: string; winner_key: string };
  retired?: { at: string; by: string; reason?: string };
  history?: Array<{ at: string; what: string; by: string }>;
  [key: string]: unknown;
}

export interface ExperimentRow {
  key: string;
  page: string;
  element: string;
  hypothesis: string;
  expected_effect: string | null;
  variants: ExperimentVariant[];
  control_key: string;
  status: ExperimentStatus;
  primary_metric: PrimaryMetric;
  min_visitors: number;
  min_days: number;
  started_at: string | null;
  concluded_at: string | null;
  winner_key: string | null;
  decision: ExperimentDecision | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const EXPERIMENT_COLUMNS =
  'key,page,element,hypothesis,expected_effect,variants,control_key,status,primary_metric,min_visitors,min_days,started_at,concluded_at,winner_key,decision,created_by,created_at,updated_at';

/** Variants a visitor can be assigned to, in key order (the order the hash indexes). */
export function activeVariants(variants: readonly ExperimentVariant[]): ExperimentVariant[] {
  return variants.filter((v) => v.active !== false).sort((a, b) => a.key.localeCompare(b.key));
}

/** Read a variants column leniently: rows that do not parse are dropped, never thrown. */
export function parseVariants(raw: unknown): ExperimentVariant[] {
  if (!Array.isArray(raw)) return [];
  const out: ExperimentVariant[] = [];
  for (const item of raw) {
    // Stored rows were validated on the way in; a lenient read keeps a legacy
    // wording that predates a copy rule renderable instead of blanking a button.
    const loose = z.object({ key: z.enum(VARIANT_KEYS), label: z.string(), active: z.boolean().optional(), payload: z.record(z.string(), z.unknown()) }).safeParse(item);
    if (loose.success) out.push(loose.data as ExperimentVariant);
  }
  return out;
}

/** Copy for a language: Spanish falls back to English on English-only surfaces. */
export function copyFor(copy: Copy | undefined, lang: 'en' | 'es'): string | undefined {
  if (!copy) return undefined;
  return lang === 'es' ? copy.es ?? copy.en : copy.en;
}
