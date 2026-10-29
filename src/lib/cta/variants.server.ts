/**
 * The hero CTA variants the homepage renders, read on the server from the
 * experiments `hero-primary` and `hero-secondary` (Phase 2 slice H) with the
 * secret key. The homepage's ISR (`revalidate = 300`, plus revalidatePath('/')
 * on every admin or agent write) is the only cache layer.
 *
 *  - a running (or pending) experiment: its active variants, the control
 *    first, so the no-JavaScript default and the crawler default is the
 *    control;
 *  - a concluded experiment: its control alone (the promoted winner);
 *  - draft, retired, missing, or any read failure: the hardcoded fallback for
 *    that button, which is never counted. The homepage cannot lose its buttons
 *    because of this table.
 */
import { ctaColorStyle } from './color';
import { ctaRowsFor, isLive, readHeroRows, type HeroRow } from './heroStore.server';
import { CTA_BUTTONS, FALLBACK_VARIANTS, type CtaButton, type CtaVariant, type HeroCtaVariants } from './types';

function forButton(button: CtaButton, row: HeroRow | null): CtaVariant[] | null {
  if (!row) return null;
  const rows = ctaRowsFor(button, row).filter((v) => v.wording.trim());
  const toVariant = (v: (typeof rows)[number]): CtaVariant => ({
    button,
    variant_key: v.variant_key,
    wording: v.wording,
    subtext: v.subtext,
    color: v.color && ctaColorStyle(v.color) ? v.color : null,
  });
  if (isLive(row)) {
    const active = rows.filter((v) => v.active);
    // Control first: CSS shows the first link before (or without) the pre-paint script.
    active.sort((a, b) => (a.variant_key === row.control_key ? -1 : b.variant_key === row.control_key ? 1 : a.variant_key.localeCompare(b.variant_key)));
    return active.length ? active.map(toVariant) : null;
  }
  if (row.status === 'concluded') {
    const control = rows.find((v) => v.variant_key === row.control_key);
    // A single variant contributes one key; the pre-paint script then always picks it.
    return control ? [toVariant(control)] : null;
  }
  return null;
}

export async function fetchHeroCtaVariants(): Promise<HeroCtaVariants> {
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return FALLBACK_VARIANTS;
  try {
    const rows = await readHeroRows();
    const out = { ...FALLBACK_VARIANTS };
    for (const button of CTA_BUTTONS) {
      const variants = forButton(button, rows[button]);
      if (variants) out[button] = variants;
    }
    return out;
  } catch (err) {
    console.error('cta variants read failed:', err instanceof Error ? err.message : String(err));
    return FALLBACK_VARIANTS;
  }
}
