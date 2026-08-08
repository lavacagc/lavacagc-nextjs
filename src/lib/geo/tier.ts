/**
 * Geo tiers (round 10): who can submit what, by where they are.
 *
 * The owner's rule: NJ visitors can request estimates; US visitors (outside
 * NJ) can join Home Care and the newsletter but not request estimates;
 * international visitors browse everything and submit nothing. Unknown
 * location gets FULL access - the owner's explicit call (2026-08-08): a
 * privacy relay must never cost a real NJ customer, and spam protection is
 * reCAPTCHA + rate limits, not geography.
 *
 * This is honest signage plus a server-side check, NOT a security boundary:
 * a US VPN defeats it by design, and that is fine. The reading prefers
 * Cloudflare's visitor-location headers (the site fronts through Cloudflare;
 * `cf-region-code` needs the free "Add visitor location headers" managed
 * transform switched on in the dashboard) and falls back to Vercel's own.
 *
 * Phase A ships this classification as signage only - notices render, but
 * every submit still goes through, tagged with the tier it arrived under so a
 * week of real traffic can prove the reading before it is allowed to refuse
 * anybody. The `can*` predicates below are what Phase B will enforce with.
 */

export type GeoTier = 'nj' | 'us' | 'intl' | 'unknown';

/** The cookie pages read client-side to swap form vs notice (set by middleware). */
export const GEO_TIER_COOKIE = 'geo_tier';

/**
 * The request header API routes read server-side. Middleware ALWAYS strips
 * the incoming value before setting its own, so a client cannot claim a tier.
 */
export const GEO_TIER_HEADER = 'x-geo-tier';

/** The sticky local-testing override cookie (non-production only). */
export const GEO_OVERRIDE_COOKIE = 'geo_override';

export function isGeoTier(value: string | null | undefined): value is GeoTier {
  return value === 'nj' || value === 'us' || value === 'intl' || value === 'unknown';
}

/**
 * Classify a request's location from its headers.
 *
 * Cloudflare first (`cf-ipcountry` / `cf-region-code`), Vercel as fallback
 * (`x-vercel-ip-country` / `x-vercel-ip-country-region`). Cloudflare's
 * country can be the sentinel `XX` (unknown) or `T1` (Tor exit) - both read
 * as unknown here, which the predicates below treat as full access.
 *
 * A US visitor whose REGION cannot be read is also `unknown` rather than
 * `us`: the only question the region answers is NJ-or-not, and an unreadable
 * answer must not quietly demote a possible NJ customer to no-estimates.
 */
export function classifyGeo(headers: { get(name: string): string | null }): GeoTier {
  const country = (headers.get('cf-ipcountry') ?? headers.get('x-vercel-ip-country') ?? '')
    .trim().toUpperCase();
  const region = (headers.get('cf-region-code') ?? headers.get('x-vercel-ip-country-region') ?? '')
    .trim().toUpperCase();

  if (!country || country === 'XX' || country === 'T1') return 'unknown';
  if (country !== 'US') return 'intl';
  if (!region) return 'unknown';
  return region === 'NJ' ? 'nj' : 'us';
}

// ---- What each tier may do. Unknown is full access (owner's decision). ----

export const canRequestEstimate = (tier: GeoTier): boolean =>
  tier === 'nj' || tier === 'unknown';

/** Referrals refer NJ projects, so they follow the estimate rule. */
export const canReferProject = canRequestEstimate;

export const canJoinHomeCare = (tier: GeoTier): boolean => tier !== 'intl';

/** US-only, exactly as the owner stated - no worldwide exception. */
export const canJoinNewsletter = canJoinHomeCare;

/** How a tier reads on the internal lead notification (Phase A telemetry). */
export function geoTierLabel(tier: string | null | undefined): string | undefined {
  switch (tier) {
    case 'nj': return 'NJ';
    case 'us': return 'US (outside NJ)';
    case 'intl': return 'International';
    case 'unknown': return 'Unknown';
    default: return undefined;
  }
}
