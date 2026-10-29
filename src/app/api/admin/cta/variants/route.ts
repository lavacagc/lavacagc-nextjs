/**
 * /api/admin/cta/variants - list, create and edit hero CTA variants.
 *
 * GET    -> { variants: CtaVariantRow[] } (all, active or not)
 * POST   { button, wording, subtext?, color?, active? } -> next free key A..G;
 *        409 once a button has seven.
 * PATCH  { button, variant_key, wording?, subtext?, color?, active? };
 *        409 when it would leave a button with no active variant, and 409 for
 *        a wording change on a variant that already has events: its counts
 *        belong to the old wording, so the change would merge two variants'
 *        results under one key. Deactivate it and add a new variant instead.
 *        Subtext and colour edits stay allowed.
 *
 * Since Phase 2 slice H the variants are entries of the experiments
 * hero-primary / hero-secondary (payload { wording, subtext?, color? }, a hex
 * colour only, copy that states no price, phone or license), and "has events"
 * means experiment_events rows. Writes are guarded by the experiment's
 * updated_at (a concurrent edit answers 409, reload and retry).
 *
 * Every write expires the experiments cache and revalidates '/', so the
 * homepage shows the change on its next request instead of waiting out its
 * 300 second revalidate window.
 *
 * Admin auth is enforced by middleware on /api/admin/*. Secret key only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseRestCounted } from '@/lib/notify/supabase-rest';
import { listVariants, nextFreeKey, variantsForButton } from '@/lib/cta/admin.server';
import { heroKey, heroPayload, readHeroRow, type HeroRow } from '@/lib/cta/heroStore.server';
import { readCappedJson } from '@/lib/cta/http';
import { CTA_BUTTONS, CTA_VARIANT_KEYS, MAX_VARIANTS_PER_BUTTON, type CtaButton } from '@/lib/cta/types';
import { invalidateExperiments, updateExperiment } from '@/lib/experiments/store.server';
import { forbiddenClaim, HEX_COLOR_RE, type ExperimentVariant } from '@/lib/experiments/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 2048;

/** '' and whitespace mean "clear it". */
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : typeof v === 'string' ? v.trim() : v),
    z.string().max(max).nullable().superRefine(noClaims),
  );

const colorField = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : typeof v === 'string' ? v.trim() : v),
  z.string().max(120).regex(HEX_COLOR_RE, 'Use a hex colour like #1f7a4d').nullable(),
);

/** Copy rules of every experiment payload: no price, phone number or license. */
const noClaims = (value: string | null | undefined, ctx: z.RefinementCtx) => {
  const reason = value ? forbiddenClaim(value) : null;
  if (reason) ctx.addIssue({ code: 'custom', message: reason });
};

const wordingField = z.string().trim().min(1, 'Wording is required').max(60).superRefine(noClaims);

const createSchema = z.object({
  button: z.enum(CTA_BUTTONS),
  wording: wordingField,
  subtext: optionalText(80).optional(),
  color: colorField.optional(),
  active: z.boolean().optional(),
}).strict();

const updateSchema = z.object({
  button: z.enum(CTA_BUTTONS),
  variant_key: z.enum(CTA_VARIANT_KEYS),
  wording: wordingField.optional(),
  subtext: optionalText(80).optional(),
  color: colorField.optional(),
  active: z.boolean().optional(),
}).strict();

function fail(status: number, error: string, issues?: unknown) {
  return NextResponse.json(issues ? { error, issues } : { error }, { status });
}

function serverError(what: string, err: unknown) {
  console.error(`cta variants ${what} failed:`, err instanceof Error ? err.message : String(err));
  return fail(500, `Could not ${what} the variant`);
}

export async function GET() {
  try {
    return NextResponse.json({ variants: await listVariants(), max_per_button: MAX_VARIANTS_PER_BUTTON });
  } catch (err) {
    return serverError('list', err);
  }
}

async function heroOr404(button: CtaButton): Promise<HeroRow | NextResponse> {
  const row = await readHeroRow(button);
  return row ?? fail(404, `The ${button} button has no experiment (${heroKey(button)}). Apply migration 20261030000003_cta_to_experiments.sql.`);
}

/** Write the button's variants, only if nobody changed the experiment since it was read. */
async function saveVariants(button: CtaButton, row: HeroRow, variants: ExperimentVariant[]): Promise<boolean> {
  const updated = await updateExperiment(heroKey(button), { variants }, row.updated_at);
  if (!updated) return false;
  invalidateExperiments(['/']);
  return true;
}

const busy = () => fail(409, 'Another change was just saved. Reload and try again.');

export async function POST(request: NextRequest) {
  const body = await readCappedJson(request, MAX_BODY_BYTES);
  if ('error' in body) return fail(body.status, body.error);
  const parsed = createSchema.safeParse(body.value);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Validation failed', parsed.error.issues);
  const { button, wording, subtext, color, active } = parsed.data;

  try {
    const row = await heroOr404(button);
    if (row instanceof NextResponse) return row;
    const existing = await variantsForButton(button);
    const key = nextFreeKey(existing.map((v) => v.variant_key));
    if (!key) {
      return fail(409, `The ${button} button already has ${MAX_VARIANTS_PER_BUTTON} variants (A to G). Edit one instead.`);
    }
    const variant: ExperimentVariant = {
      key,
      label: wording,
      active: active ?? false,
      payload: heroPayload({ wording, subtext: subtext ?? null, color: color ?? null }),
    };
    if (!(await saveVariants(button, row, [...row.variants, variant]))) return busy();
    const created = (await variantsForButton(button)).find((v) => v.variant_key === key) ?? null;
    return NextResponse.json({ status: 'created', variant: created }, { status: 201 });
  } catch (err) {
    return serverError('create', err);
  }
}

export async function PATCH(request: NextRequest) {
  const body = await readCappedJson(request, MAX_BODY_BYTES);
  if ('error' in body) return fail(body.status, body.error);
  const parsed = updateSchema.safeParse(body.value);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Validation failed', parsed.error.issues);
  const { button, variant_key, ...patch } = parsed.data;
  if (Object.keys(patch).length === 0) return fail(400, 'Nothing to update');

  try {
    const row = await heroOr404(button);
    if (row instanceof NextResponse) return row;
    const existing = await variantsForButton(button);
    const target = existing.find((v) => v.variant_key === variant_key);
    const stored = row.variants.find((v) => v.key === variant_key);
    if (!target || !stored) return fail(404, `There is no ${button} variant ${variant_key}`);

    if (patch.active === false && target.active) {
      const othersActive = existing.filter((v) => v.active && v.variant_key !== variant_key).length;
      if (othersActive === 0) {
        return fail(409, `Variant ${variant_key} is the only active ${button} variant. Activate another one first; the homepage needs one.`);
      }
    }

    if (patch.wording !== undefined && patch.wording !== target.wording) {
      const events = await supabaseRestCounted<{ id: number }>(
        `experiment_events?select=id&experiment_key=eq.${heroKey(button)}&variant_key=eq.${variant_key}&limit=1`,
      );
      if ((events.total ?? events.rows.length) > 0) {
        return fail(
          409,
          `Variant ${variant_key} already has ${events.total ?? 'some'} recorded views and clicks under its current wording. ` +
            'Changing the wording would mix two variants in one result. Deactivate it and add a new variant instead.',
        );
      }
    }

    const wording = patch.wording ?? target.wording;
    const next: ExperimentVariant = {
      ...stored,
      label: wording,
      active: patch.active ?? stored.active !== false,
      payload: heroPayload({
        wording,
        subtext: patch.subtext !== undefined ? patch.subtext : target.subtext,
        color: patch.color !== undefined ? patch.color : target.color,
      }),
    };
    const variants = row.variants.map((v) => (v.key === variant_key ? next : v));
    if (!(await saveVariants(button, row, variants))) return busy();
    const updated = (await variantsForButton(button)).find((v) => v.variant_key === variant_key) ?? null;
    return NextResponse.json({ status: 'updated', variant: updated });
  } catch (err) {
    return serverError('update', err);
  }
}
