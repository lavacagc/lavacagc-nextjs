/**
 * Request bodies for the experiments agent routes (zod, strict). Client-safe.
 */
import { z } from 'zod';
import { findSurface, SURFACES } from './surfaces';
import {
  COPY_SLOTS,
  EXPERIMENT_KEY_RE,
  PRIMARY_METRICS,
  RESERVED_KEYS,
  VARIANT_KEYS,
  variantSchema,
  type CopySlot,
  type ExperimentVariant,
} from './types';

/** Any key, at any depth, that names or looks like a price field. */
const PRICE_KEY_RE = /price|cents|minimum|amount|cost/i;

export function priceFieldsIn(value: unknown, path = ''): string[] {
  if (!value || typeof value !== 'object') return [];
  const found: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const here = path ? `${path}.${k}` : k;
    if (PRICE_KEY_RE.test(k)) found.push(here);
    found.push(...priceFieldsIn(v, here));
  }
  return found;
}

export const PRICE_REFUSAL = 'Prices are never an experiment variable (decision 005). Remove every price field from the variants:';

const keySchema = z
  .string()
  .min(3)
  .max(60)
  .regex(EXPERIMENT_KEY_RE, 'A key is lowercase words joined by dashes, for example landing-hero-2')
  .refine((k) => !(RESERVED_KEYS as readonly string[]).includes(k), 'That key is reserved by the routes; pick another');

export const createExperimentSchema = z
  .object({
    key: keySchema,
    page: z.string().min(1).max(100),
    element: z.string().min(1).max(40),
    hypothesis: z.string().trim().min(20, 'Write the hypothesis in a full sentence before starting').max(1000),
    expected_effect: z.string().trim().min(10, 'Write the expected effect (which metric, which direction, roughly how much)').max(500),
    variants: z.array(variantSchema).min(2, 'An experiment needs a control and at least one challenger').max(7),
    control_key: z.enum(VARIANT_KEYS).default('A'),
    primary_metric: z.enum(PRIMARY_METRICS).default('request_submitted'),
    min_visitors: z.number().int().min(50).max(100_000).default(200),
    min_days: z.number().int().min(7).max(90).default(14),
    backlog_id: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    const surface = findSurface(body.page, body.element);
    if (!surface) {
      ctx.addIssue({
        code: 'custom',
        path: ['element'],
        message: `Nothing renders ${body.page} ${body.element}. Surfaces: ${SURFACES.map((s) => `${s.page} ${s.element}`).join('; ')}`,
      });
      return;
    }
    const keys = body.variants.map((v) => v.key);
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Variant keys must be unique' });
    if (!keys.includes(body.control_key)) ctx.addIssue({ code: 'custom', path: ['control_key'], message: `control_key ${body.control_key} is not one of the variants` });
    const slotSets = body.variants.map((v) => Object.keys(v.payload).sort().join(','));
    if (new Set(slotSets).size > 1) {
      ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Every variant must set the same slots, so the control and the challengers differ only in their values' });
    }
    const payloads = body.variants.map((v) => JSON.stringify(v.payload));
    if (new Set(payloads).size !== payloads.length) ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Two variants have the same payload' });
    body.variants.forEach((v: ExperimentVariant, i) => {
      for (const slot of Object.keys(v.payload)) {
        if (!(surface.slots as readonly string[]).includes(slot)) {
          ctx.addIssue({ code: 'custom', path: ['variants', i, 'payload', slot], message: `${body.page} ${body.element} does not render "${slot}". Slots: ${surface.slots.join(', ')}` });
        }
        if (surface.bilingual && (COPY_SLOTS as readonly string[]).includes(slot)) {
          const copy = v.payload[slot as CopySlot];
          if (copy && !copy.es) ctx.addIssue({ code: 'custom', path: ['variants', i, 'payload', slot, 'es'], message: 'Both languages, always: add the Spanish copy' });
        }
      }
      if (v.payload.order && surface.sections) {
        const want = [...surface.sections].sort().join(',');
        if ([...v.payload.order].sort().join(',') !== want) {
          ctx.addIssue({ code: 'custom', path: ['variants', i, 'payload', 'order'], message: `The order must name each section exactly once: ${surface.sections.join(', ')}` });
        }
      }
      for (const slot of surface.required ?? []) {
        if (!(slot in v.payload)) ctx.addIssue({ code: 'custom', path: ['variants', i, 'payload', slot], message: `${body.page} ${body.element} renders nothing without "${slot}"; every variant must set it (the label is never shown to visitors)` });
      }
      if (v.active === false) ctx.addIssue({ code: 'custom', path: ['variants', i, 'active'], message: 'A new experiment starts with every variant active' });
    });
  });
export type CreateExperimentBody = z.infer<typeof createExperimentSchema>;

export const concludeSchema = z.union([
  z.object({ winner_key: z.enum(VARIANT_KEYS), note: z.string().trim().max(500).optional() }).strict(),
  z.object({ retire: z.literal(true), reason: z.string().trim().min(3).max(500) }).strict(),
]);

export const startSchema = z.object({}).strict();

export const backlogCreateSchema = z
  .object({
    page: z.string().min(1).max(100),
    element: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/),
    hypothesis: z.string().trim().min(10).max(500),
    priority: z.number().int().min(0).max(100).default(50),
    source: z.string().trim().min(1).max(40).default('agent'),
  })
  .strict();

export const notifySchema = z.object({ text: z.string().trim().min(1).max(3500) }).strict();

export const adminActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('promote'), winner_key: z.enum(VARIANT_KEYS).optional() }).strict(),
  z.object({ action: z.literal('retire'), reason: z.string().trim().max(500).optional() }).strict(),
  z.object({ action: z.literal('veto') }).strict(),
  z.object({ action: z.literal('start') }).strict(),
]);
