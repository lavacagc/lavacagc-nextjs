/**
 * Active hero CTA variants for the homepage, read on the server with the
 * PUBLISHABLE key. That is the one sanctioned exception to "no new table with
 * the publishable key" (migration comment "Exception 1"): RLS exposes only
 * active rows, and the wording of a public button is not sensitive. Admin
 * reads go through the secret key instead (src/app/api/admin/cta/*).
 *
 * A plain PostgREST fetch rather than the typed supabase-js client, because
 * the generated Database types predate these tables.
 *
 * Never throws. Any failure (env missing, network, timeout, bad payload, no
 * active rows) yields the hardcoded fallback for that button, so the homepage
 * cannot lose its buttons because of this table.
 */
import {
  CTA_BUTTONS,
  FALLBACK_VARIANTS,
  isCtaButton,
  isCtaVariantKey,
  type CtaVariant,
  type HeroCtaVariants,
} from './types';
import { ctaColorStyle } from './color';

const FETCH_TIMEOUT_MS = 3000;
/** Matches the homepage's `revalidate`; the admin API also revalidates '/' on edits. */
const REVALIDATE_SECONDS = 300;

function toVariant(row: unknown): CtaVariant | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (!isCtaButton(r.button) || !isCtaVariantKey(r.variant_key)) return null;
  if (typeof r.wording !== 'string' || !r.wording.trim()) return null;
  const color = typeof r.color === 'string' && ctaColorStyle(r.color) ? r.color.trim() : null;
  return {
    button: r.button,
    variant_key: r.variant_key,
    wording: r.wording.trim(),
    subtext: typeof r.subtext === 'string' && r.subtext.trim() ? r.subtext.trim() : null,
    color,
  };
}

export async function fetchHeroCtaVariants(): Promise<HeroCtaVariants> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) return FALLBACK_VARIANTS;

  try {
    const res = await fetch(
      `${url}/rest/v1/cta_variants?select=button,variant_key,wording,subtext,color&active=eq.true&order=button.asc,variant_key.asc&limit=14`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        next: { revalidate: REVALIDATE_SECONDS },
      },
    );
    if (!res.ok) {
      console.error(`cta variants read failed: ${res.status}`);
      return FALLBACK_VARIANTS;
    }
    const rows: unknown = await res.json();
    const variants = Array.isArray(rows) ? rows.map(toVariant).filter((v): v is CtaVariant => v !== null) : [];
    const out = { ...FALLBACK_VARIANTS };
    for (const button of CTA_BUTTONS) {
      const forButton = variants.filter((v) => v.button === button);
      if (forButton.length > 0) out[button] = forButton;
    }
    return out;
  } catch (err) {
    console.error('cta variants read failed:', err instanceof Error ? err.message : String(err));
    return FALLBACK_VARIANTS;
  }
}
