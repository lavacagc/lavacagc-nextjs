/**
 * Homepage hero CTA test - shared types and constants.
 *
 * Client-safe: no server imports. The schema lives in
 * supabase/migrations/20261029000000_home_services.sql (cta_variants,
 * cta_events, site_settings.cta_min_visitors, home_service_requests.cta_variant_*).
 */

export const CTA_BUTTONS = ['primary', 'secondary'] as const;
export type CtaButton = (typeof CTA_BUTTONS)[number];

/** A to G: the spec allows at most seven variants per button. */
export const CTA_VARIANT_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export type CtaVariantKey = (typeof CTA_VARIANT_KEYS)[number];
export const MAX_VARIANTS_PER_BUTTON = CTA_VARIANT_KEYS.length;

/** What the homepage needs to render one button. */
export interface CtaVariant {
  button: CtaButton;
  variant_key: CtaVariantKey;
  wording: string;
  subtext: string | null;
  color: string | null;
  /** True only on the hardcoded fallback: no table row backs it, so no events. */
  fallback?: boolean;
}

export interface HeroCtaVariants {
  primary: CtaVariant[];
  secondary: CtaVariant[];
}

/** Destinations are fixed per button; only wording, subtext and colour vary. */
export const CTA_HREF: Record<CtaButton, string> = {
  primary: '/home-services#services',
  secondary: '/portfolio',
};

/**
 * Used when the table cannot be read or a button has no active variant. The
 * homepage must never lose its buttons because of this table. The key is 'A'
 * so the fallback still reads as the control, but events are never sent for a
 * fallback (`fallback: true`), since nothing in the table backs it.
 */
export const FALLBACK_VARIANTS: HeroCtaVariants = {
  primary: [{ button: 'primary', variant_key: 'A', wording: 'Explore My Service Options', subtext: null, color: null, fallback: true }],
  secondary: [{ button: 'secondary', variant_key: 'A', wording: 'See Our Projects', subtext: null, color: null, fallback: true }],
};

/** Cookie names and lifetime (180 days). */
export const CTA_VID_COOKIE = 'cta_vid';
export const CTA_ASSIGN_COOKIE = 'cta_v';
export const CTA_COOKIE_MAX_AGE = 180 * 24 * 60 * 60;

export function isCtaButton(value: unknown): value is CtaButton {
  return typeof value === 'string' && (CTA_BUTTONS as readonly string[]).includes(value);
}

export function isCtaVariantKey(value: unknown): value is CtaVariantKey {
  return typeof value === 'string' && (CTA_VARIANT_KEYS as readonly string[]).includes(value);
}
