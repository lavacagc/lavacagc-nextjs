/**
 * The homepage hero buttons, stored as the experiments `hero-primary` and
 * `hero-secondary` since Phase 2 slice H (migration
 * 20261030000003_cta_to_experiments.sql). Each Phase 1 variant is one entry
 * of the experiment's `variants`, its payload `{ wording, subtext?, color? }`
 * and its on/off switch `active`.
 *
 * `cta_variants` and `cta_events` are history now: read by the admin tab,
 * written by nothing.
 *
 * Secret key only (supabaseRest). Server-only.
 */
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { HERO_EXPERIMENT, LIVE_STATUSES, parseVariants, type ExperimentStatus, type ExperimentVariant } from '@/lib/experiments/types';
import { CTA_BUTTONS, isCtaVariantKey, type CtaButton } from './types';
import type { CtaVariantRow } from './report';

export interface HeroRow {
  key: string;
  status: ExperimentStatus;
  control_key: string;
  variants: ExperimentVariant[];
  updated_at: string;
}

export function heroKey(button: CtaButton): string {
  return HERO_EXPERIMENT[button];
}

export async function readHeroRows(): Promise<Record<CtaButton, HeroRow | null>> {
  const rows = await supabaseRest<HeroRow[]>(
    'GET',
    `experiments?select=key,status,control_key,variants,updated_at&key=in.(${CTA_BUTTONS.map(heroKey).join(',')})&limit=${CTA_BUTTONS.length}`,
  );
  const out = { primary: null, secondary: null } as Record<CtaButton, HeroRow | null>;
  for (const button of CTA_BUTTONS) {
    const row = (rows ?? []).find((r) => r.key === heroKey(button));
    out[button] = row ? { ...row, variants: parseVariants(row.variants) } : null;
  }
  return out;
}

export async function readHeroRow(button: CtaButton): Promise<HeroRow | null> {
  return (await readHeroRows())[button];
}

export function isLive(row: HeroRow | null): boolean {
  return !!row && (LIVE_STATUSES as readonly string[]).includes(row.status);
}

function copyText(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const en = (value as { en?: unknown }).en;
  return typeof en === 'string' && en.trim() ? en.trim() : null;
}

/** One stored variant in the Phase 1 shape the CTA admin and the homepage use. */
export function toCtaRow(button: CtaButton, row: HeroRow, v: ExperimentVariant): CtaVariantRow | null {
  if (!isCtaVariantKey(v.key)) return null;
  const payload = v.payload as Record<string, unknown>;
  return {
    id: `${row.key}:${v.key}`,
    button,
    variant_key: v.key,
    // Only the payload reaches a visitor, never the admin label: a variant
    // without wording renders nothing (variants.server.ts drops it).
    wording: copyText(payload.wording) ?? '',
    subtext: copyText(payload.subtext),
    color: typeof payload.color === 'string' ? payload.color : null,
    active: v.active !== false,
    updated_at: row.updated_at,
  };
}

export function ctaRowsFor(button: CtaButton, row: HeroRow | null): CtaVariantRow[] {
  if (!row) return [];
  return row.variants
    .map((v) => toCtaRow(button, row, v))
    .filter((v): v is CtaVariantRow => v !== null)
    .sort((a, b) => a.variant_key.localeCompare(b.variant_key));
}

/** The payload for a Phase 1 style edit: English-only copy (the homepage is English) and a hex colour. */
export function heroPayload(input: { wording: string; subtext: string | null; color: string | null }): ExperimentVariant['payload'] {
  return {
    wording: { en: input.wording },
    ...(input.subtext ? { subtext: { en: input.subtext } } : {}),
    ...(input.color ? { color: input.color } : {}),
  };
}
