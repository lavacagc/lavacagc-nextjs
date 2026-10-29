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
 * Every write revalidates '/', so the homepage shows the change on its next
 * request instead of waiting out its 300 second revalidate window.
 *
 * Admin auth is enforced by middleware on /api/admin/*. Secret key only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabaseRest, supabaseRestCounted } from '@/lib/notify/supabase-rest';
import { listVariants, nextFreeKey, variantsForButton } from '@/lib/cta/admin.server';
import { readCappedJson } from '@/lib/cta/http';
import { forgetActivePairs } from '@/lib/cta/activePairs.server';
import { isValidCtaColor } from '@/lib/cta/color';
import { CTA_BUTTONS, CTA_VARIANT_KEYS, MAX_VARIANTS_PER_BUTTON } from '@/lib/cta/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 2048;

/** '' and whitespace mean "clear it". */
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : typeof v === 'string' ? v.trim() : v),
    z.string().max(max).nullable(),
  );

const colorField = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : typeof v === 'string' ? v.trim() : v),
  z.string().max(120).refine(isValidCtaColor, 'Use a hex colour like #1f7a4d, or Tailwind classes').nullable(),
);

const wordingField = z.string().trim().min(1, 'Wording is required').max(60);

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

export async function POST(request: NextRequest) {
  const body = await readCappedJson(request, MAX_BODY_BYTES);
  if ('error' in body) return fail(body.status, body.error);
  const parsed = createSchema.safeParse(body.value);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Validation failed', parsed.error.issues);
  const { button, wording, subtext, color, active } = parsed.data;

  try {
    const existing = await variantsForButton(button);
    const key = nextFreeKey(existing.map((v) => v.variant_key));
    if (!key) {
      return fail(409, `The ${button} button already has ${MAX_VARIANTS_PER_BUTTON} variants (A to G). Edit one instead.`);
    }
    const created = await supabaseRest<unknown[]>('POST', 'cta_variants', [{
      button, variant_key: key, wording, subtext: subtext ?? null, color: color ?? null, active: active ?? false,
    }]);
    revalidatePath('/');
    forgetActivePairs();
    return NextResponse.json({ status: 'created', variant: created?.[0] ?? null }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Two admins creating at once can race for the same key; the unique
    // (button, variant_key) constraint catches it.
    if (/23505|duplicate key/i.test(message)) return fail(409, 'Another variant was just added. Reload and try again.');
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
    const existing = await variantsForButton(button);
    const target = existing.find((v) => v.variant_key === variant_key);
    if (!target) return fail(404, `There is no ${button} variant ${variant_key}`);

    if (patch.active === false && target.active) {
      const othersActive = existing.filter((v) => v.active && v.variant_key !== variant_key).length;
      if (othersActive === 0) {
        return fail(409, `Variant ${variant_key} is the only active ${button} variant. Activate another one first; the homepage needs one.`);
      }
    }

    if (patch.wording !== undefined && patch.wording !== target.wording) {
      const events = await supabaseRestCounted<{ id: number }>(
        `cta_events?select=id&button=eq.${button}&variant_key=eq.${variant_key}&limit=1`,
      );
      if ((events.total ?? events.rows.length) > 0) {
        return fail(
          409,
          `Variant ${variant_key} already has ${events.total ?? 'some'} recorded views and clicks under its current wording. ` +
            'Changing the wording would mix two variants in one result. Deactivate it and add a new variant instead.',
        );
      }
    }

    const updated = await supabaseRest<unknown[]>(
      'PATCH',
      `cta_variants?button=eq.${button}&variant_key=eq.${variant_key}`,
      patch,
    );
    revalidatePath('/');
    forgetActivePairs();
    return NextResponse.json({ status: 'updated', variant: updated?.[0] ?? null });
  } catch (err) {
    return serverError('update', err);
  }
}
